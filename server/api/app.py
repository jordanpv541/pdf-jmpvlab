"""API de conversiones de PDF jmpvlab.

Recibe un archivo, lo convierte y lo devuelve en la misma respuesta.
Nada se guarda: cada archivo vive en una carpeta temporal que se borra al terminar.

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
import tempfile
import time
import unicodedata
from collections import defaultdict, deque
from pathlib import Path
from urllib.parse import quote, urlparse

import httpx
from fastapi import FastAPI, File, Form, HTTPException, Request, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, Response

from converters import LOCAL_CONVERTERS, page_count, run_in_child

# ---------- Configuración (variables de entorno) ----------

GOTENBERG_URL = os.getenv("GOTENBERG_URL", "http://gotenberg:3000").rstrip("/")
ALLOWED_ORIGINS = [o.strip() for o in os.getenv("ALLOWED_ORIGINS", "https://pdf.jmpvlab.com").split(",") if o.strip()]
SOURCE_URL = os.getenv("SOURCE_URL", "https://github.com/jordanpv541/pdf-jmpvlab")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))
MAX_PDF_PAGES = int(os.getenv("MAX_PDF_PAGES", "300"))
MAX_JOBS = int(os.getenv("MAX_JOBS", "2"))  # conversiones al mismo tiempo
MAX_WAITING = int(os.getenv("MAX_WAITING", "8"))  # conversiones esperando turno
RATE_LIMIT = int(os.getenv("RATE_LIMIT", "30"))  # conversiones por persona…
RATE_WINDOW = int(os.getenv("RATE_WINDOW", "600"))  # …en esta cantidad de segundos
JOB_TIMEOUT = int(os.getenv("JOB_TIMEOUT", "180"))

MAX_BYTES = MAX_UPLOAD_MB * 1024 * 1024

_MP = mp.get_context("forkserver")
_MP.set_forkserver_preload(["converters"])

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


class Problem(HTTPException):
    """Error con un mensaje pensado para mostrarse tal cual en la web."""

    def __init__(self, status: int, message: str):
        super().__init__(status_code=status, detail=message)


app = FastAPI(title="PDF jmpvlab", docs_url=None, redoc_url=None, openapi_url=None)
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition", "X-Result-Note"],
    max_age=3600,
)


@app.exception_handler(HTTPException)
async def problem_handler(_request: Request, exc: HTTPException):
    return JSONResponse({"error": exc.detail}, status_code=exc.status_code, headers={"Cache-Control": "no-store"})


@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["Cache-Control"] = "no-store"
    response.headers["Referrer-Policy"] = "no-referrer"
    return response


# ---------- Límites: ritmo por persona y cola ----------

_hits: dict[str, deque] = defaultdict(deque)
_slots = asyncio.Semaphore(MAX_JOBS)
_waiting = 0


def client_ip(request: Request) -> str:
    # Caddy es el único que habla con la API y agrega la IP real al principio.
    forwarded = request.headers.get("x-forwarded-for", "")
    return forwarded.split(",")[0].strip() or (request.client.host if request.client else "?")


def check_rate(ip: str) -> None:
    now = time.monotonic()
    hits = _hits[ip]
    while hits and now - hits[0] > RATE_WINDOW:
        hits.popleft()
    if len(hits) >= RATE_LIMIT:
        minutes = max(1, int((RATE_WINDOW - (now - hits[0])) // 60) + 1)
        raise Problem(429, f"Hiciste muchas conversiones seguidas. Vuelve a intentarlo en {minutes} min.")
    hits.append(now)
    if len(_hits) > 10000:  # limpieza simple para que la memoria no crezca sin fin
        for key in [k for k, v in _hits.items() if not v or now - v[-1] > RATE_WINDOW]:
            _hits.pop(key, None)


class Turn:
    """Espera turno para convertir. Si la fila es muy larga, avisa en vez de esperar."""

    async def __aenter__(self):
        global _waiting
        if _waiting >= MAX_WAITING:
            raise Problem(503, "Hay mucha gente convirtiendo en este momento. Intenta de nuevo en un minuto.")
        _waiting += 1
        try:
            await _slots.acquire()
        finally:
            _waiting -= 1
        return self

    async def __aexit__(self, *_):
        _slots.release()


# ---------- Archivos ----------


def safe_base(name: str) -> str:
    stem = Path(name or "documento").stem
    stem = unicodedata.normalize("NFC", stem)
    stem = re.sub(r'[\\/:*?"<>|\x00-\x1f]+', "-", stem).strip(" .-")
    return stem[:80] or "documento"


def extension(name: str) -> str:
    return Path(name or "").suffix.lower().lstrip(".")


async def save_upload(upload: UploadFile, folder: Path, name: str) -> Path:
    target = folder / name
    size = 0
    with target.open("wb") as out:
        while chunk := await upload.read(1024 * 1024):
            size += len(chunk)
            if size > MAX_BYTES:
                raise Problem(413, f"El archivo pesa más de {MAX_UPLOAD_MB} MB, que es el máximo.")
            out.write(chunk)
    if size == 0:
        raise Problem(400, "El archivo está vacío.")
    return target


def looks_like(path: Path, ext: str) -> bool:
    """Comprueba el contenido real del archivo, no solo su extensión."""
    head = path.open("rb").read(4096)
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


def attachment(data: bytes, filename: str, media_type: str, note: str = "") -> Response:
    headers = {"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"}
    if note:
        headers["X-Result-Note"] = quote(note)
    return Response(content=data, media_type=media_type, headers=headers)


# ---------- Gotenberg ----------


async def gotenberg(route: str, files: list[tuple[str, Path, str]], data: dict | None = None) -> bytes:
    handles = []
    try:
        multipart = []
        for upload_name, path, mime in files:
            fh = path.open("rb")
            handles.append(fh)
            multipart.append(("files", (upload_name, fh, mime)))
        async with httpx.AsyncClient(timeout=JOB_TIMEOUT + 10) as client:
            response = await client.post(f"{GOTENBERG_URL}{route}", files=multipart, data=data or {})
    except httpx.TimeoutException as exc:
        raise Problem(504, "La conversión tardó demasiado. Prueba con un archivo más pequeño.") from exc
    except httpx.HTTPError as exc:
        raise Problem(503, "El conversor no está disponible ahora. Intenta de nuevo en un rato.") from exc
    finally:
        for fh in handles:
            fh.close()
    if response.status_code == 200:
        return response.content
    if response.status_code in (429, 503):
        raise Problem(503, "Hay mucha gente convirtiendo en este momento. Intenta de nuevo en un minuto.")
    if response.status_code == 504:
        raise Problem(504, "La conversión tardó demasiado. Prueba con un archivo más pequeño.")
    raise Problem(422, "No se pudo convertir el archivo. Puede estar dañado, protegido o en un formato que no reconocemos.")


# ---------- Conversiones locales en un proceso aparte ----------


async def run_local(kind: str, pdf_path: Path, out_path: Path) -> str:
    # «forkserver»: los hijos nacen de un proceso limpio, sin los hilos del servidor web.
    receiver, sender = _MP.Pipe(duplex=False)
    process = _MP.Process(target=run_in_child, args=(kind, str(pdf_path), str(out_path), sender), daemon=True)
    process.start()
    sender.close()
    loop = asyncio.get_running_loop()
    await loop.run_in_executor(None, process.join, JOB_TIMEOUT)
    if process.is_alive():
        process.kill()
        process.join(5)
        raise Problem(504, "La conversión tardó demasiado. Prueba con menos páginas.")
    if not receiver.poll():
        raise Problem(500, "La conversión se interrumpió. Intenta de nuevo.")
    status, message = receiver.recv()
    if status != "ok":
        if "demasiadas páginas" in message:
            raise Problem(413, "El PDF tiene demasiadas páginas para esta conversión.")
        if "sin texto" in message:
            raise Problem(422, "No encontramos texto ni tablas en este PDF. Si es un escaneo, pásalo primero por OCR.")
        raise Problem(422, "No se pudo convertir este PDF. Puede estar dañado o tener un formato poco común.")
    return message


# ---------- Direcciones web (HTML a PDF) ----------


async def check_public_url(url: str) -> str:
    """Solo se aceptan páginas públicas: nada de direcciones internas del servidor."""
    url = url.strip()
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        raise Problem(400, "Escribe una dirección completa, que empiece con https://")
    if parsed.username or parsed.password:
        raise Problem(400, "La dirección no puede llevar usuario ni contraseña.")
    if parsed.port not in (None, 80, 443):
        raise Problem(400, "Solo podemos abrir páginas en los puertos normales de la web.")
    host = parsed.hostname.lower().rstrip(".")
    if host == "localhost" or host.endswith((".localhost", ".local", ".internal", ".lan", ".home")):
        raise Problem(400, "Esa dirección no es una página pública.")
    loop = asyncio.get_running_loop()
    try:
        infos = await loop.getaddrinfo(host, parsed.port or (443 if parsed.scheme == "https" else 80))
    except OSError as exc:
        raise Problem(400, "No encontramos esa página. Revisa la dirección.") from exc
    for info in infos:
        ip = ipaddress.ip_address(info[4][0])
        if not ip.is_global or ip.is_multicast:
            raise Problem(400, "Esa dirección no es una página pública.")
    return url


# ---------- Rutas ----------


@app.get("/v1/health")
async def health():
    return {"ok": True, "source": SOURCE_URL, "maxUploadMb": MAX_UPLOAD_MB}


@app.post("/v1/convert/{kind}")
async def convert(
    kind: str,
    request: Request,
    file: UploadFile | None = File(None),
    url: str = Form(""),
    pdfa: str = Form("PDF/A-2b"),
    paper: str = Form("a4"),
):
    if kind not in ALL_KINDS:
        raise Problem(404, "Esa conversión no existe.")
    check_rate(client_ip(request))

    with tempfile.TemporaryDirectory(prefix="conv-") as tmp:
        folder = Path(tmp)

        # HTML a PDF desde una dirección web
        if kind == HTML_KIND and not file:
            if not url:
                raise Problem(400, "Elige un archivo HTML o escribe la dirección de una página.")
            target = await check_public_url(url)
            width, height = PAPER.get(paper, PAPER["a4"])
            async with Turn():
                pdf = await gotenberg(
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
                )
            name = safe_base(urlparse(target).hostname or "pagina")
            return attachment(pdf, f"{name}.pdf", "application/pdf")

        if not file or not file.filename:
            raise Problem(400, "Elige un archivo.")
        ext = extension(file.filename)
        base = safe_base(file.filename)

        if kind in OFFICE_KINDS:
            if ext not in OFFICE_KINDS[kind]:
                allowed = ", ".join(sorted(OFFICE_KINDS[kind]))
                raise Problem(415, f"Ese tipo de archivo no sirve aquí. Usa: {allowed}.")
            source = await save_upload(file, folder, f"documento.{ext}")
            if not looks_like(source, ext):
                raise Problem(415, f"«{file.filename}» no parece un archivo .{ext} válido.")
            async with Turn():
                pdf = await gotenberg("/forms/libreoffice/convert", [(f"documento.{ext}", source, "application/octet-stream")])
            return attachment(pdf, f"{base}.pdf", "application/pdf")

        if kind == HTML_KIND:
            if ext not in {"html", "htm"}:
                raise Problem(415, "Elige un archivo .html o escribe una dirección web.")
            source = await save_upload(file, folder, "index.html")
            if not looks_like(source, "html"):
                raise Problem(415, f"«{file.filename}» no parece un archivo HTML.")
            width, height = PAPER.get(paper, PAPER["a4"])
            async with Turn():
                pdf = await gotenberg(
                    "/forms/chromium/convert/html",
                    [("index.html", source, "text/html")],
                    {"paperWidth": width, "paperHeight": height, "printBackground": "true"},
                )
            return attachment(pdf, f"{base}.pdf", "application/pdf")

        # Conversiones que parten de un PDF
        if ext != "pdf":
            raise Problem(415, "Elige un archivo PDF.")
        source = await save_upload(file, folder, "documento.pdf")
        if not looks_like(source, "pdf"):
            raise Problem(415, f"«{file.filename}» no parece un PDF.")
        try:
            pages = page_count(str(source))
        except PermissionError as exc:
            raise Problem(422, "Este PDF tiene contraseña. Quítasela primero con Desbloquear PDF.") from exc
        except Exception as exc:  # noqa: BLE001
            raise Problem(422, "No se pudo leer el PDF. Prueba primero con Reparar PDF.") from exc
        if pages > MAX_PDF_PAGES:
            raise Problem(413, f"El PDF tiene {pages} páginas y el máximo es {MAX_PDF_PAGES}.")

        if kind == "pdf-a-pdfa":
            level = pdfa if pdfa in PDFA_LEVELS else "PDF/A-2b"
            async with Turn():
                out = await gotenberg("/forms/pdfengines/convert", [("documento.pdf", source, "application/pdf")], {"pdfa": level})
            return attachment(out, f"{base}-pdfa.pdf", "application/pdf")

        _, out_ext, media = LOCAL_CONVERTERS[kind]
        target = folder / f"resultado.{out_ext}"
        async with Turn():
            note = await run_local(kind, source, target)
        if not target.exists() or target.stat().st_size == 0:
            raise Problem(500, "La conversión no produjo ningún archivo. Intenta de nuevo.")
        return attachment(target.read_bytes(), f"{base}.{out_ext}", media, note)
