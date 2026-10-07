"""Pruebas de la API sin Gotenberg real (se reemplaza por una función falsa).

    cd server && python -m pytest tests -q
"""

import io
import sys
import zipfile
from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "api"))

import app as api  # noqa: E402

ORIGIN = "https://pdf.jmpvlab.com"


def make_pdf(pages=2, table=False, password=None) -> bytes:
    doc = pymupdf.open()
    for n in range(pages):
        page = doc.new_page()
        page.insert_text((72, 72), f"Página de prueba {n + 1}", fontsize=18)
        if table:
            x0, y0, w, h = 72, 120, 120, 24
            rows = [["Producto", "Cantidad", "Precio"], ["Lápiz", "12", "1,50"], ["Cuaderno", "3", "1.234,90"], ["Código", "00123", "7"]]
            for r, row in enumerate(rows):
                for c, value in enumerate(row):
                    rect = pymupdf.Rect(x0 + c * w, y0 + r * h, x0 + (c + 1) * w, y0 + (r + 1) * h)
                    page.draw_rect(rect, color=(0, 0, 0), width=0.8)
                    page.insert_text((rect.x0 + 4, rect.y1 - 7), value, fontsize=11)
    kwargs = {}
    if password:
        kwargs = {"encryption": pymupdf.PDF_ENCRYPT_AES_256, "user_pw": password, "owner_pw": password + "x"}
    data = doc.tobytes(**kwargs)
    doc.close()
    return data


@pytest.fixture(autouse=True)
def reset_limits(monkeypatch):
    api._hits.clear()
    monkeypatch.setattr(api, "RATE_LIMIT", 30)


@pytest.fixture
def client():
    return TestClient(api.app)


@pytest.fixture
def fake_gotenberg(monkeypatch):
    calls = []

    async def fake(route, files, data=None):
        calls.append((route, [f[0] for f in files], data or {}))
        return make_pdf(1)

    monkeypatch.setattr(api, "gotenberg", fake)
    return calls


def post(client, kind, name, content, **fields):
    return client.post(
        f"/v1/convert/{kind}",
        files={"file": (name, content, "application/octet-stream")},
        data=fields,
        headers={"Origin": ORIGIN},
    )


def test_health(client):
    r = client.get("/v1/health")
    assert r.status_code == 200 and r.json()["ok"] is True
    assert "github.com" in r.json()["source"]


def test_cors_only_for_our_site(client):
    ok = client.options("/v1/convert/pdf-a-word", headers={"Origin": ORIGIN, "Access-Control-Request-Method": "POST"})
    bad = client.options("/v1/convert/pdf-a-word", headers={"Origin": "https://otro.com", "Access-Control-Request-Method": "POST"})
    assert ok.headers.get("access-control-allow-origin") == ORIGIN
    assert bad.headers.get("access-control-allow-origin") is None


def test_unknown_kind(client):
    assert post(client, "nada", "a.pdf", make_pdf()).status_code == 404


def test_word_to_pdf_uses_libreoffice(client, fake_gotenberg):
    docx = io.BytesIO()
    with zipfile.ZipFile(docx, "w") as z:
        z.writestr("word/document.xml", "<x/>")
    r = post(client, "word-a-pdf", "Mi informe.docx", docx.getvalue())
    assert r.status_code == 200, r.text
    assert r.headers["content-type"] == "application/pdf"
    assert "Mi%20informe.pdf" in r.headers["content-disposition"]
    assert fake_gotenberg[0][0] == "/forms/libreoffice/convert"


def test_rejects_wrong_extension_and_fake_content(client, fake_gotenberg):
    assert post(client, "word-a-pdf", "foto.jpg", b"\xff\xd8\xff").status_code == 415
    r = post(client, "word-a-pdf", "falso.docx", b"esto no es un docx")
    assert r.status_code == 415 and "no parece" in r.json()["error"]


def test_empty_file(client, fake_gotenberg):
    assert post(client, "pdf-a-word", "vacio.pdf", b"").status_code == 400


def test_too_big(client, fake_gotenberg, monkeypatch):
    monkeypatch.setattr(api, "MAX_BYTES", 1000)
    r = post(client, "pdf-a-pdfa", "grande.pdf", b"%PDF-1.7\n" + b"0" * 5000)
    assert r.status_code == 413


def test_pdfa_level(client, fake_gotenberg):
    r = post(client, "pdf-a-pdfa", "a.pdf", make_pdf(), pdfa="PDF/A-1b")
    assert r.status_code == 200
    assert fake_gotenberg[0][2]["pdfa"] == "PDF/A-1b"
    post(client, "pdf-a-pdfa", "a.pdf", make_pdf(), pdfa="cualquier cosa")
    assert fake_gotenberg[1][2]["pdfa"] == "PDF/A-2b"


def test_password_pdf(client):
    r = post(client, "pdf-a-word", "clave.pdf", make_pdf(password="abc"))
    assert r.status_code == 422 and "contraseña" in r.json()["error"]


def test_pdf_to_word(client):
    r = post(client, "pdf-a-word", "doc.pdf", make_pdf(2))
    assert r.status_code == 200, r.text
    assert r.headers["content-disposition"].endswith("doc.docx")
    from docx import Document

    text = "\n".join(p.text for p in Document(io.BytesIO(r.content)).paragraphs)
    assert "Página de prueba 1" in text


def test_pdf_to_excel_tables(client):
    r = post(client, "pdf-a-excel", "tabla.pdf", make_pdf(1, table=True))
    assert r.status_code == 200, r.text
    from openpyxl import load_workbook

    ws = load_workbook(io.BytesIO(r.content)).worksheets[0]
    values = [[c.value for c in row] for row in ws.iter_rows()]
    flat = [v for row in values for v in row if v is not None]
    assert "Producto" in flat and "Lápiz" in flat
    assert 1.5 in flat and 1234.9 in flat  # números en formato español
    assert "00123" in flat  # los códigos con ceros se quedan como texto
    from urllib.parse import unquote

    assert "1 tabla" in unquote(r.headers["x-result-note"])


def test_pdf_to_excel_without_tables(client):
    r = post(client, "pdf-a-excel", "texto.pdf", make_pdf(2))
    assert r.status_code == 200
    from urllib.parse import unquote

    assert "No encontramos tablas" in unquote(r.headers["x-result-note"])


def test_pdf_to_powerpoint(client):
    r = post(client, "pdf-a-powerpoint", "presentacion.pdf", make_pdf(3))
    assert r.status_code == 200, r.text
    from pptx import Presentation

    prs = Presentation(io.BytesIO(r.content))
    assert len(prs.slides) == 3
    assert "Página de prueba 2" in prs.slides[1].notes_slide.notes_text_frame.text


def test_page_limit(client, monkeypatch):
    monkeypatch.setattr(api, "MAX_PDF_PAGES", 2)
    r = post(client, "pdf-a-word", "largo.pdf", make_pdf(3))
    assert r.status_code == 413 and "3 páginas" in r.json()["error"]


def test_rate_limit(client, fake_gotenberg, monkeypatch):
    monkeypatch.setattr(api, "RATE_LIMIT", 2)
    for _ in range(2):
        assert post(client, "pdf-a-pdfa", "a.pdf", make_pdf()).status_code == 200
    r = post(client, "pdf-a-pdfa", "a.pdf", make_pdf())
    assert r.status_code == 429 and "Vuelve a intentarlo" in r.json()["error"]


def test_html_file(client, fake_gotenberg):
    r = post(client, "html-a-pdf", "pagina.html", b"<h1>Hola</h1>", paper="carta")
    assert r.status_code == 200
    route, names, data = fake_gotenberg[0]
    assert route == "/forms/chromium/convert/html" and names == ["index.html"]
    assert data["paperWidth"] == "8.5"


@pytest.mark.parametrize(
    "url",
    [
        "http://127.0.0.1/",
        "http://localhost:3000/",
        "http://169.254.169.254/latest/meta-data/",
        "http://10.0.0.5/",
        "http://192.168.1.1/admin",
        "http://[::1]/",
        "file:///etc/passwd",
        "ftp://example.com/",
        "https://user:pw@example.com/",
        "https://example.com:8443/",
        "http://gotenberg.internal/",
    ],
)
def test_html_url_blocks_internal_addresses(client, fake_gotenberg, url):
    r = client.post("/v1/convert/html-a-pdf", data={"url": url}, headers={"Origin": ORIGIN})
    assert r.status_code == 400, (url, r.text)
    assert not fake_gotenberg


def test_html_url_public_ip(client, fake_gotenberg):
    r = client.post("/v1/convert/html-a-pdf", data={"url": "http://1.1.1.1/"}, headers={"Origin": ORIGIN})
    assert r.status_code == 200, r.text
    assert fake_gotenberg[0][0] == "/forms/chromium/convert/url"


def test_busy_queue(client, fake_gotenberg, monkeypatch):
    monkeypatch.setattr(api, "_waiting", api.MAX_WAITING)
    r = post(client, "pdf-a-pdfa", "a.pdf", make_pdf())
    assert r.status_code == 503
