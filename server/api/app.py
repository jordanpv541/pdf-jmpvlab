"""API de conversiones de PDF jmpvlab.

Recibe un archivo, lo convierte y lo devuelve en la misma respuesta.
Nada se guarda: cada conversión tiene su carpeta temporal, que se borra al terminar de responder.

- Word, Excel, PowerPoint y HTML a PDF, y PDF a PDF/A: Gotenberg (LibreOffice y Chromium).
- PDF a Word, Excel y PowerPoint: pdf2docx, PyMuPDF y python-pptx, en un proceso aparte.

Licencia: AGPL-3.0-or-later. El código fuente está en SOURCE_URL.
"""

from __future__ import annotations

import asyncio
import ipaddress
import multiprocessing as mp
import os
import re
import shutil
import tempfile
import time
import unicodedata
from collections import defaultdict, deque
from dataclasses import dataclass
from pathlib import Path
from urllib.parse import parse_qs, quote, urlparse

import httpx
from fastapi import FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from python_multipart.exceptions import MultipartParseError
from python_multipart.multipart import MultipartParser, parse_options_header
from starlette.requests import ClientDisconnect

import converters
from converters import LOCAL_CONVERTERS

# ---------- Configuración (variables de entorno) ----------

GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://gotenberg:3000").rstrip("/")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "https://pdf.jmpvlab.com").split(",") if o.strip()]
SOURCE_URL = os.getenv("SOURCE_URL", "https://github.com/jordanpv541/pdf-jmpvlab")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "300"))
MAX_WORD_PAGES = int(os.getenv("MAX_WORD_PAGES", "150"))  # PDF a Word es la conversión más lenta
MAX_JOBS = int(os.getenv("MAX_JOBS", "2"))  # conversiones al mismo tiempo
MAX_WAITING = int(os.getenv("MAX_WAITING", "8"))  # conversiones esperando turno (o subiendo su archivo)
MAX_PER_IP = int(os.getenv("MAX_PER_IP", "2"))  # conversiones a la vez de una misma persona (IP)
RATE_LIMIT = int(os.getenv("RATE_LIMIT", "30"))  # conversiones por persona…
RATE_WINDOW = int(os.getenv("RATE_WINDOW", "600"))  # …en esta cantidad de segundos
JOB_TIMEOUT = int(os.getenv("JOB_TIMEOUT", "180"))  # Gotenberg se corta antes (170 s, en docker-compose.yml)
UPLOAD_TIMEOUT = int(os.getenv("UPLOAD_TIMEOUT", "300"))  # segundos para terminar de subir el archivo
MAX_OUTPUT_MB = int(os.getenv("MAX_OUTPUT_MB", "200"))  # tamaño máximo del archivo convertido
CHILD_MEMORY_MB = int(os.getenv("CHILD_MEMORY_MB", "1536"))  # memoria máxima de cada proceso hijo
PAGE_COUNT_TIMEOUT = 30  # segundos para abrir un PDF y contar sus páginas

MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024
MAX_OUTPUT_BYTES = MAX_OUTPUT_MB * 1024 * 1024
FORM_EXTRA_BYTES = 64 * 1024  # lo que ocupa el formulario además del archivo
MAX_FIELD_BYTES = 4096  # cada dato de texto del formulario (la dirección web, el tamaño de papel…)
MAX_URL_LENGTH = 2048

_MP = mp.get_context("forkserver")
_MP.set_forkserver_preload(["converters"])

# Las pruebas ponen aquí un Gotenberg falso (httpx.MockTransport).
_gotenberg_transport: httpx.AsyncBaseTransport | None = None

# ---------- Tipos de conversión ----------

OFFICE_KINDS = {
    "word-a-pdf": {"doc", "docx", "odt", "rtf", "txt"},
    "excel-a-pdf": {"xls", "xlsx", "ods", "csv"},
    "powerpoint-a-pdf": {"ppt", "pptx", "odp"},
}
PDF_KINDS = {"pdf-a-word", "pdf-a-excel", "pdf-a-powerpoint", "pdf-a-pdfa"}
HTML_KIND = "html-a-pdf"
ALL_KINDS = set(OFFICE_KINDS) | PDF_KINDS | {HTML_KIND}

PDFA_LEVELS = {"PDF/A-1b", "PDF/A-2b", "PDF/A-3b"}
PAPER = {"a4": ("8.27", "11.7"), "carta": ("8.5", "11")}
TEXT_FIELDS = {"url", "pdfa", "paper"}

CONVERT_PREFIX = "/v1/convert/"
BUSY = "Hay mucha gente convirtiendo en este momento. Intenta de nuevo en un minuto."
TOO_SLOW = "La conversión tardó demasiado. Prueba con un archivo más pequeño."
NOT_PUBLIC = "Esa dirección no es una página pública."


class Problem(HTTPException):
    """Error con un mensaje pensado para mostrarse tal cual en la web."""

    def __init__(self, status: int, message: str):
        super().__init__(status_code=status, detail=message)


def problem_response(exc: HTTPException) -> JSONResponse:
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code)


# ---------- Límites: ritmo por persona, conversiones a la vez y turnos ----------

_hits: dict[str, deque] = defaultdict(deque)
_in_flight = 0  # conversiones en curso (subiendo, esperando turno o convirtiendo)
_in_flight_by_ip: dict[str, int] = {}
_slots = asyncio.Semaphore(MAX_JOBS)


def client_ip(scope) -> str:
    # Caddy es el único que habla con la API. Borra el X-Forwarded-For que mande el
    # visitante y pone solo su IP real, así que basta con el primer valor.
    for name, value in scope.get("headers", []):
        if name == b"x-forwarded-for":
            first = value.decode("latin-1").split(",")[0].strip()
            if first:
                return first
    client = scope.get("client")
    return client[0] if client else "?"


def check_rate(ip: str) -> None:
    now = time.monotonic()
    hits = _hits[ip]
    while hits and now - hits[0] > RATE_WINDOW:
        hits.popleft()
    if len(hits) >= RATE_LIMIT:
        oldest = hits[0] if hits else now
        minutes = max(1, int((RATE_WINDOW - (now - oldest)) // 60) + 1)
        raise Problem(429, f"Hiciste muchas conversiones seguidas. Vuelve a intentarlo en {minutes} min.")
    hits.append(now)
    if len(_hits) > 10000:  # limpieza simple para que la memoria no crezca sin fin
        for key in [k for k, v in _hits.items() if not v or now - v[-1] > RATE_WINDOW]:
            _hits.pop(key, None)


def admit(scope, ip: str) -> None:
    """Decide si una conversión puede empezar, mirando solo la cabecera (sin leer el archivo)."""
    global _in_flight
    kind = scope["path"][len(CONVERT_PREFIX):]
    if kind not in ALL_KINDS:
        raise Problem(404, "Esa conversión no existe.")
    headers = {name: value for name, value in scope.get("headers", [])}
    length = headers.get(b"content-length")
    if b"transfer-encoding" in headers or length is None:
        raise Problem(411, "No sabemos cuánto pesa el archivo que envías. Vuelve a intentarlo desde la página.")
    try:
        size = int(length)
    except ValueError as exc:
        raise Problem(400, "La petición no es válida.") from exc
    if size > MAX_BYTES + FORM_EXTRA_BYTES:
        raise Problem(413, f"El archivo pesa más de {MAX_UPLOAD_MB} MB, que es el máximo.")
    if _in_flight_by_ip.get(ip, 0) >= MAX_PER_IP:
        raise Problem(429, "Ya estás convirtiendo otros archivos. Espera a que terminen y vuelve a intentarlo.")
    if _in_flight >= MAX_JOBS + MAX_WAITING:
        raise Problem(503, BUSY)
    check_rate(ip)
    _in_flight += 1
    _in_flight_by_ip[ip] = _in_flight_by_ip.get(ip, 0) + 1


def release(ip: str) -> None:
    global _in_flight
    _in_flight -= 1
    left = _in_flight_by_ip.get(ip, 0) - 1
    if left > 0:
        _in_flight_by_ip[ip] = left
    else:
        _in_flight_by_ip.pop(ip, None)


class Guard:
    """Revisa cada conversión ANTES de leer el archivo.

    Con File() o Form(), FastAPI recibe el archivo entero antes de llamar a la ruta. Por
    eso los límites van aquí, antes de todo: tamaño (por la cabecera Content-Length),
    ritmo por persona y conversiones a la vez (en total y por IP). Si algo no cuadra se
    responde al tiro, sin recibir el archivo.

    También crea la carpeta temporal de la conversión y la borra cuando termina la
    respuesta, pase lo que pase.
    """

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or scope["method"] != "POST" or not scope["path"].startswith(CONVERT_PREFIX):
            await self.app(scope, receive, send)
            return
        body_done = False

        async def receive_and_track():
            nonlocal body_done
            message = await receive()
            if message["type"] == "http.disconnect" or not message.get("more_body", False):
                body_done = True
            return message

        async def send_and_close(message):
            # Si respondemos sin haber recibido todo el archivo, se cierra la conexión.
            # Si no, el servidor seguiría recibiendo (y botando) el resto del archivo.
            if message["type"] == "http.response.start" and not body_done:
                message = {**message, "headers": [*message.get("headers", []), (b"connection", b"close")]}
            await send(message)

        ip = client_ip(scope)
        try:
            admit(scope, ip)
        except Problem as exc:
            await problem_response(exc)(scope, receive, send_and_close)
            return
        folder = tempfile.mkdtemp(prefix="conv-")
        try:
            scope["state"] = {**(scope.get("state") or {}), "job_dir": folder}
            await self.app(scope, receive_and_track, send_and_close)
        finally:
            release(ip)
            shutil.rmtree(folder, ignore_errors=True)


SECURITY_HEADERS = [
    (b"x-content-type-options", b"nosniff"),
    (b"cache-control", b"no-store"),
    (b"referrer-policy", b"no-referrer"),
]
_SECURITY_NAMES = {name for name, _ in SECURITY_HEADERS}


class SecurityHeaders:
    """Agrega cabeceras de seguridad a todas las respuestas."""

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        async def send_with_headers(message):
            if message["type"] == "http.response.start":
                headers = [(k, v) for k, v in message.get("headers", []) if k.lower() not in _SECURITY_NAMES]
                message = {**message, "headers": headers + SECURITY_HEADERS}
            await send(message)

        await self.app(scope, receive, send_with_headers)


class Turn:
    """Espera turno para convertir (solo MAX_JOBS a la vez)."""

    async def __aenter__(self):
        await _slots.acquire()
        return self

    async def __aexit__(self, *_):
        _slots.release()


app = FastAPI(title="PDF jmpvlab", docs_url=None, redoc_url=None, openapi_url=None)
# El orden importa: la última que se agrega es la primera que recibe la petición.
# SecurityHeaders → CORS → Guard → rutas. Así los rechazos de Guard también llevan
# las cabeceras CORS y la web puede leer el mensaje.
app.add_middleware(Guard)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Result-Note"],
    max_age=3600,
)
app.add_middleware(SecurityHeaders)


@app.exception_handler(HTTPException)
async def problem_handler(_request: Request, exc: HTTPException):
    return problem_response(exc)


# ---------- Archivos ----------


def safe_base(name: str) -> str:
    stem = Path(name or "documento").stem
    stem = unicodedata.normalize("NFC", stem)
    stem = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "-", stem).strip(" .-")
    return stem[:80] or "documento"


def extension(name: str) -> str:
    return Path(name or "").suffix.lower().lstrip(".")


def allowed_extensions(kind: str) -> set[str]:
    if kind in OFFICE_KINDS:
        return OFFICE_KINDS[kind]
    if kind == HTML_KIND:
        return {"html", "htm"}
    return {"pdf"}


def wrong_type(kind: str) -> Problem:
    if kind in OFFICE_KINDS:
        return Problem(415, f"Ese tipo de archivo no sirve aquí. Usa: {', '.join(sorted(OFFICE_KINDS[kind]))}.")
    if kind == HTML_KIND:
        return Problem(415, "Elige un archivo .html o escribe una dirección web.")
    return Problem(415, "Elige un archivo PDF.")


@dataclass
class Upload:
    filename: str
    path: Path
    size: int = 0
    complete: bool = False


class FormReader:
    """Lee el formulario (multipart) por partes y guarda el archivo directo en la carpeta de la conversión.

    No hay copia intermedia en /tmp. El tipo de archivo se revisa apenas llega su
    nombre, antes de recibir el contenido.
    """

    def __init__(self, folder: Path, kind: str):
        self.folder = folder
        self.kind = kind
        self.fields: dict[str, str] = {}
        self.upload: Upload | None = None
        self.parts = 0
        self._field = bytearray()
        self._value = bytearray()
        self._headers: dict[bytes, bytes] = {}
        self._target: str | None = None
        self._text = bytearray()
        self._out = None

    def callbacks(self) -> dict:
        return {
            "on_part_begin": self.on_part_begin,
            "on_header_field": lambda data, start, end: self._field.extend(data[start:end]),
            "on_header_value": lambda data, start, end: self._value.extend(data[start:end]),
            "on_header_end": self.on_header_end,
            "on_headers_finished": self.on_headers_finished,
            "on_part_data": self.on_part_data,
            "on_part_end": self.on_part_end,
        }

    def on_part_begin(self):
        self.parts += 1
        if self.parts > 10:
            raise Problem(400, "El formulario trae demasiadas partes.")
        self._headers = {}
        self._target = None
        self._text = bytearray()

    def on_header_end(self):
        self._headers[bytes(self._field).strip().lower()] = bytes(self._value).strip()
        self._field.clear()
        self._value.clear()

    def on_headers_finished(self):
        _, params = parse_options_header(self._headers.get(b"content-disposition", b""))
        name = params.get(b"name", b"").decode("utf-8", "replace")
        if b"filename" in params:
            filename = params[b"filename"].decode("utf-8", "replace")
            if name != "file" or not filename:
                return  # sin archivo elegido, o una parte que no usamos
            if self.upload:
                raise Problem(400, "Envía un solo archivo.")
            ext = extension(filename)
            if ext not in allowed_extensions(self.kind):
                raise wrong_type(self.kind)
            target = self.folder / ("index.html" if self.kind == HTML_KIND else f"documento.{ext}")
            self._out = target.open("wb")
            self.upload = Upload(filename, target)
            self._target = "file"
        elif name in TEXT_FIELDS:
            self._target = name

    def on_part_data(self, data, start, end):
        if self._target == "file":
            self.upload.size += end - start
            if self.upload.size > MAX_BYTES:
                raise Problem(413, f"El archivo pesa más de {MAX_UPLOAD_MB} MB, que es el máximo.")
            self._out.write(data[start:end])
        elif self._target:
            self._text.extend(data[start:end])
            if len(self._text) > MAX_FIELD_BYTES:
                raise Problem(400, "Un dato del formulario es demasiado largo.")

    def on_part_end(self):
        if self._target == "file":
            self._out.close()
            self._out = None
            self.upload.complete = True
        elif self._target:
            self.fields[self._target] = self._text.decode("utf-8", "replace")
        self._target = None

    def close(self):
        if self._out:
            self._out.close()
            self._out = None


async def read_form(request: Request, folder: Path, kind: str) -> tuple[dict[str, str], Upload | None]:
    content_type = request.headers.get("content-type", "")
    ctype, options = parse_options_header(content_type)
    try:
        async with asyncio.timeout(UPLOAD_TIMEOUT):
            if ctype == b"multipart/form-data" and options.get(b"boundary"):
                reader = FormReader(folder, kind)
                parser = MultipartParser(options[b"boundary"], reader.callbacks())
                try:
                    async for chunk in request.stream():
                        parser.write(chunk)
                    parser.finalize()
                finally:
                    reader.close()
                if reader.upload and not reader.upload.complete:
                    raise Problem(400, "El archivo llegó incompleto. Intenta de nuevo.")
                return reader.fields, reader.upload
            if ctype == b"application/x-www-form-urlencoded" or not content_type:
                body = bytearray()
                async for chunk in request.stream():
                    body.extend(chunk)
                    if len(body) > MAX_FIELD_BYTES * 4:
                        raise Problem(400, "El formulario es demasiado grande.")
                parsed = parse_qs(body.decode("utf-8", "replace"))
                return {k: v[0] for k, v in parsed.items() if k in TEXT_FIELDS and v}, None
    except TimeoutError as exc:
        raise Problem(408, "La subida tardó demasiado. Revisa tu conexión e intenta de nuevo.") from exc
    except MultipartParseError as exc:
        raise Problem(400, "No pudimos leer el formulario. Intenta de nuevo desde la página.") from exc
    except ClientDisconnect as exc:
        raise Problem(400, "Se cortó la subida del archivo.") from exc
    raise Problem(415, "Envía el archivo desde el formulario de la página.")


def looks_like(path: Path, ext: str) -> bool:
    """Comprueba el contenido real del archivo, no solo su extensión."""
    with path.open("rb") as fh:
        head = fh.read(4096)
    if ext == "pdf":
        return b"%PDF" in head[:1024]
    if ext in {"docx", "xlsx", "pptx", "odt", "ods", "odp"}:
        return head.startswith(b"PK\x03\x04")
    if ext in {"doc", "xls", "ppt"}:
        return head.startswith(bytes.fromhex("D0CF11E0A1B11AE1"))
    if ext == "rtf":
        return head.lstrip().startswith(b"{\\rtf")
    if ext in {"txt", "csv", "html", "htm"}:
        return b"\x00" not in head
    return False


def too_big_result() -> Problem:
    return Problem(422, f"El archivo convertido pesa más de {MAX_OUTPUT_MB} MB, que es el máximo. Prueba con un archivo más pequeño.")


def attachment(path: Path, filename: str, media_type: str, note: str = "") -> FileResponse:
    """Devuelve el archivo convertido directo desde el disco (sin cargarlo entero en memoria)."""
    if not path.exists() or path.stat().st_size == 0:
        raise Problem(500, "La conversión no produjo ningún archivo. Intenta de nuevo.")
    if path.stat().st_size > MAX_OUTPUT_BYTES:
        raise too_big_result()
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    if note:
        headers["X-Result-Note"] = quote(note)
    return FileResponse(path, media_type=media_type, headers=headers)


# ---------- Gotenberg ----------


def gotenberg_problem(status: int, from_url: bool) -> Problem:
    if status in (429, 503):
        return Problem(503, BUSY)
    if status == 504:
        return Problem(504, TOO_SLOW)
    if from_url:
        if status == 409:
            # Gotenberg responde 409 cuando la página contestó con un error (404, 500…).
            return Problem(422, "La página no cargó: respondió con un error (por ejemplo, «página no encontrada»). Revisa la dirección o prueba más tarde.")
        if status == 403:
            # Gotenberg la bloqueó: es una dirección interna o no existe.
            return Problem(400, "No pudimos abrir esa página: no existe o no es pública. Revisa la dirección.")
        return Problem(422, "No pudimos abrir esa página. Revisa la dirección o prueba más tarde.")
    return Problem(422, "No se pudo convertir el archivo. Puede estar dañado, protegido o en un formato que no reconocemos.")


async def gotenberg(route: str, files: list[tuple[str, Path, str]], data: dict | None, out: Path, *, from_url: bool = False) -> Path:
    """Manda el trabajo a Gotenberg y guarda el PDF en `out`, con un tope de tamaño."""
    handles = []
    status = 0
    try:
        # Todo va como multipart/form-data (Gotenberg no acepta otro formato), también los datos de texto.
        multipart: list = [(name, (None, value)) for name, value in (data or {}).items()]
        for upload_name, path, mime in files:
            fh = path.open("rb")
            handles.append(fh)
            multipart.append(("files", (upload_name, fh, mime)))
        timeout = httpx.Timeout(JOB_TIMEOUT, connect=10)
        async with httpx.AsyncClient(timeout=timeout, transport=_gotenberg_transport) as client:
            async with client.stream("POST", f"{GOTENBERG_URL}{route}", files=multipart) as response:
                status = response.status_code
                if status == 200:
                    declared = response.headers.get("content-length", "")
                    if declared.isdigit() and int(declared) > MAX_OUTPUT_BYTES:
                        raise too_big_result()
                    size = 0
                    with out.open("wb") as result:
                        async for chunk in response.aiter_bytes():
                            size += len(chunk)
                            if size > MAX_OUTPUT_BYTES:
                                raise too_big_result()
                            result.write(chunk)
                    return out
    except httpx.TimeoutException as exc:
        raise Problem(504, TOO_SLOW) from exc
    except httpx.HTTPError as exc:
        raise Problem(503, "El conversor no está disponible ahora. Intenta de nuevo en un rato.") from exc
    finally:
        for fh in handles:
            fh.close()
    raise gotenberg_problem(status, from_url)


# ---------- Trabajos en un proceso aparte (abrir PDF, PDF a Word/Excel/PowerPoint) ----------


async def run_child(task: str, args: tuple, timeout: float) -> tuple:
    """Corre una tarea de converters.py en un proceso hijo con tiempo y memoria limitados.

    Devuelve ("ok", resultado), ("error", motivo, detalle), ("timeout",) o ("crash", código).
    """
    loop = asyncio.get_running_loop()
    receiver, sender = _MP.Pipe(duplex=False)
    # «forkserver»: los hijos nacen de un proceso limpio, sin los hilos del servidor web.
    process = _MP.Process(
        target=converters.child_main,
        args=(task, args, sender, CHILD_MEMORY_MB * 1024 * 1024, MAX_OUTPUT_BYTES),
        daemon=True,
    )
    try:
        await loop.run_in_executor(None, process.start)
        sender.close()
        await loop.run_in_executor(None, process.join, timeout)
        if process.is_alive():
            process.kill()
            await loop.run_in_executor(None, process.join, 5)
            return ("timeout",)
        if receiver.poll():
            try:
                return receiver.recv()
            except (EOFError, OSError):
                pass
        return ("crash", process.exitcode)
    finally:
        sender.close()
        receiver.close()
        if process.exitcode is not None:
            process.close()


async def count_pages(pdf_path: Path) -> int:
    """Abre el PDF en un proceso aparte: un PDF dañado no puede colgar ni tumbar la API."""
    result = await run_child(converters.COUNT_PAGES, (str(pdf_path),), PAGE_COUNT_TIMEOUT)
    if result[0] == "ok":
        return int(result[1])
    if result[0] == "error" and result[1] == "protegido":
        raise Problem(422, "Este PDF tiene contraseña. Quítasela primero con Desbloquear PDF.")
    raise Problem(422, "No se pudo leer el PDF. Prueba primero con Reparar PDF.")


async def run_local(kind: str, pdf_path: Path, out_path: Path) -> str:
    result = await run_child(kind, (str(pdf_path), str(out_path)), JOB_TIMEOUT)
    if result[0] == "ok":
        return result[1]
    if result[0] == "timeout":
        raise Problem(504, "La conversión tardó demasiado. Prueba con menos páginas.")
    if result[0] == "crash":
        raise Problem(500, "La conversión se interrumpió. Intenta de nuevo o prueba con menos páginas.")
    reason = result[1]
    if reason == "demasiadas-paginas":
        raise Problem(413, "El PDF tiene demasiadas páginas para esta conversión.")
    if reason == "sin-texto":
        raise Problem(422, "No encontramos texto ni tablas en este PDF. Si es un escaneo, pásalo primero por OCR.")
    if reason == "memoria":
        raise Problem(422, "Este PDF necesita demasiada memoria para convertirse. Prueba con menos páginas.")
    if reason == "muy-grande":
        raise too_big_result()
    raise Problem(422, "No se pudo convertir este PDF. Puede estar dañado o tener un formato poco común.")


def page_limit(kind: str, pages: int) -> None:
    limit, reason = MAX_PDF_PAGES, ""
    if kind == "pdf-a-word" and MAX_WORD_PAGES < limit:
        limit, reason = MAX_WORD_PAGES, "Word"
    if kind == "pdf-a-powerpoint" and converters.MAX_SLIDE_PAGES < limit:
        limit, reason = converters.MAX_SLIDE_PAGES, "PowerPoint"
    if pages <= limit:
        return
    if reason:
        raise Problem(413, f"El PDF tiene {pages} páginas. Para pasarlo a {reason} el máximo es {limit}. Sepáralo antes con Dividir PDF.")
    raise Problem(413, f"El PDF tiene {pages} páginas y el máximo es {MAX_PDF_PAGES}.")


# ---------- Direcciones web (HTML a PDF) ----------

BLOCKED_SUFFIXES = (".localhost", ".local", ".internal", ".lan", ".home", ".arpa", ".corp", ".intranet")


def is_public_ip(ip: ipaddress.IPv4Address | ipaddress.IPv6Address) -> bool:
    if ip.version == 6:
        # Direcciones IPv6 que llevan una IPv4 adentro (::ffff:127.0.0.1, 2002:7f00:1::).
        embedded = ip.ipv4_mapped or ip.sixtofour
        if embedded:
            return is_public_ip(embedded)
    # is_global ya deja fuera las privadas, loopback, link-local (169.254), CGNAT (100.64/10) y ULA (fc00::/7).
    return ip.is_global and not ip.is_multicast and not ip.is_reserved


async def resolve(host: str, port: int) -> list[str]:
    loop = asyncio.get_running_loop()
    infos = await loop.getaddrinfo(host, port)
    return [info[4][0] for info in infos]


async def check_public_url(url: str) -> str:
    """Solo se aceptan páginas públicas: nada de direcciones internas del servidor.

    Es una primera revisión. La que de verdad protege es la de Gotenberg
    (--chromium-deny-private-ips), que vuelve a resolver la dirección justo al abrirla.
    """
    url = url.strip()
    if len(url) > MAX_URL_LENGTH:
        raise Problem(400, "La dirección es demasiado larga.")
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise Problem(400, "Escribe una dirección completa, que empiece con https://")
    if parsed.username or parsed.password:
        raise Problem(400, "La dirección no puede llevar usuario ni contraseña.")
    try:
        port = parsed.port
    except ValueError as exc:
        raise Problem(400, "Escribe una dirección completa, que empiece con https://") from exc
    if port not in (None, 80, 443):
        raise Problem(400, "Solo podemos abrir páginas en los puertos normales de la web.")
    host = parsed.hostname.lower().rstrip(".")
    try:
        literal = ipaddress.ip_address(host)
    except ValueError:
        literal = None
    if literal is None:
        # Un nombre sin punto (api, gotenberg, localhost) es una máquina de la red interna.
        if "." not in host or host == "localhost" or host.endswith(BLOCKED_SUFFIXES):
            raise Problem(400, NOT_PUBLIC)
    try:
        addresses = await resolve(host, port or (443 if parsed.scheme == "https" else 80))
    except OSError as exc:
        raise Problem(400, "No encontramos esa página. Revisa la dirección.") from exc
    if not addresses:
        raise Problem(400, "No encontramos esa página. Revisa la dirección.")
    for address in addresses:
        try:
            ip = ipaddress.ip_address(address.split("%")[0])
        except ValueError as exc:
            raise Problem(400, NOT_PUBLIC) from exc
        if not is_public_ip(ip):
            raise Problem(400, NOT_PUBLIC)
    return url


# ---------- Rutas ----------


@app.get("/v1/health")
async def health():
    return {"ok": True, "source": SOURCE_URL, "maxUploadMb": MAX_UPLOAD_MB}


@app.post("/v1/convert/{kind}")
async def convert(kind: str, request: Request):
    if kind not in ALL_KINDS:
        raise Problem(404, "Esa conversión no existe.")
    folder = Path(request.state.job_dir)  # la crea y la borra Guard
    fields, upload = await read_form(request, folder, kind)
    url = fields.get("url", "").strip()
    pdfa = fields.get("pdfa", "PDF/A-2b")
    width, height = PAPER.get(fields.get("paper", "a4"), PAPER["a4"])
    out = folder / "resultado.pdf"

    # HTML a PDF desde una dirección web
    if kind == HTML_KIND and upload is None:
        if not url:
            raise Problem(400, "Elige un archivo HTML o escribe la dirección de una página.")
        target = await check_public_url(url)
        async with Turn():
            await gotenberg(
                "/forms/chromium/convert/url",
                [],
                {
                    "url": target,
                    "paperWidth": width,
                    "paperHeight": height,
                    "printBackground": "true",
                    "waitDelay": "1s",
                    "failOnHttpStatusCodes": "[499,599]",
                },
                out,
                from_url=True,
            )
        name = safe_base(urlparse(target).hostname or "pagina")
        return attachment(out, f"{name}.pdf", "application/pdf")

    if upload is None:
        raise Problem(400, "Elige un archivo.")
    if upload.size == 0:
        raise Problem(400, "El archivo está vacío.")
    ext = extension(upload.filename)
    base = safe_base(upload.filename)
    source = upload.path

    if kind in OFFICE_KINDS:
        if not looks_like(source, ext):
            raise Problem(415, f"«{upload.filename}» no parece un archivo .{ext} válido.")
        async with Turn():
            await gotenberg("/forms/libreoffice/convert", [(source.name, source, "application/octet-stream")], None, out)
        return attachment(out, f"{base}.pdf", "application/pdf")

    if kind == HTML_KIND:
        if not looks_like(source, "html"):
            raise Problem(415, f"«{upload.filename}» no parece un archivo HTML.")
        async with Turn():
            await gotenberg(
                "/forms/chromium/convert/html",
                [("index.html", source, "text/html")],
                {"paperWidth": width, "paperHeight": height, "printBackground": "true"},
                out,
            )
        return attachment(out, f"{base}.pdf", "application/pdf")

    # Conversiones que parten de un PDF
    if not looks_like(source, "pdf"):
        raise Problem(415, f"«{upload.filename}» no parece un PDF.")
    async with Turn():
        pages = await count_pages(source)
        page_limit(kind, pages)

        if kind == "pdf-a-pdfa":
            level = pdfa if pdfa in PDFA_LEVELS else "PDF/A-2b"
            await gotenberg("/forms/pdfengines/convert", [("documento.pdf", source, "application/pdf")], {"pdfa": level}, out)
            return attachment(out, f"{base}-pdfa.pdf", "application/pdf")

        _, out_ext, media = LOCAL_CONVERTERS[kind]
        target = folder / f"resultado.{out_ext}"
        note = await run_local(kind, source, target)
    return attachment(target, f"{base}.{out_ext}", media, note)
