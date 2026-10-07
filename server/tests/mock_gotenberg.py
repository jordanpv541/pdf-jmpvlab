"""Imitación de Gotenberg para probar la API sin Docker.

Responde en las mismas rutas que Gotenberg 8, usando LibreOffice y Chromium (Playwright)
instalados en la máquina. Solo sirve para pruebas.

    uvicorn mock_gotenberg:app --port 3999
"""

import subprocess
import tempfile
from pathlib import Path

from fastapi import FastAPI, Form, Request, UploadFile
from fastapi.responses import Response

app = FastAPI()


async def _save(files: list[UploadFile], folder: Path) -> list[Path]:
    saved = []
    for f in files:
        target = folder / Path(f.filename).name
        target.write_bytes(await f.read())
        saved.append(target)
    return saved


@app.get("/health")
async def health():
    return {"status": "up"}


@app.post("/forms/libreoffice/convert")
async def libreoffice(request: Request):
    form = await request.form()
    files = form.getlist("files")
    with tempfile.TemporaryDirectory() as tmp:
        folder = Path(tmp)
        (source,) = await _save(files, folder)
        result = subprocess.run(
            ["soffice", "--headless", "--norestore", f"-env:UserInstallation=file://{folder}/profile",
             "--convert-to", "pdf", "--outdir", str(folder), str(source)],
            capture_output=True, timeout=180,
        )
        pdf = folder / (source.stem + ".pdf")
        if result.returncode != 0 or not pdf.exists():
            return Response("conversion failed", status_code=400)
        return Response(pdf.read_bytes(), media_type="application/pdf")


@app.post("/forms/pdfengines/convert")
async def pdfengines(request: Request):
    form = await request.form()
    (upload,) = form.getlist("files")
    if form.get("pdfa") not in {"PDF/A-1b", "PDF/A-2b", "PDF/A-3b"}:
        return Response("bad pdfa", status_code=400)
    # La imitación no convierte a PDF/A de verdad: devuelve el mismo PDF.
    return Response(await upload.read(), media_type="application/pdf")


async def _chromium_pdf(goto):
    from playwright.async_api import async_playwright

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        page = await browser.new_page()
        await goto(page)
        pdf = await page.pdf(format="A4", print_background=True)
        await browser.close()
        return pdf


@app.post("/forms/chromium/convert/html")
async def chromium_html(request: Request):
    form = await request.form()
    (upload,) = form.getlist("files")
    html = (await upload.read()).decode("utf-8", "replace")
    pdf = await _chromium_pdf(lambda page: page.set_content(html))
    return Response(pdf, media_type="application/pdf")


@app.post("/forms/chromium/convert/url")
async def chromium_url(url: str = Form(...)):
    pdf = await _chromium_pdf(lambda page: page.goto(url))
    return Response(pdf, media_type="application/pdf")
