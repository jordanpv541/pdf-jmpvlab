"""Conversiones que se hacen dentro de la API (sin Gotenberg).

Cada función recibe la ruta de un PDF y escribe el resultado en `out_path`.
Se ejecutan en un proceso aparte (ver app.py) para poder cortarlas si tardan demasiado.
"""

from __future__ import annotations

import io
import re

import pymupdf

# Límites para que una sola conversión no acapare el servidor.
MAX_SLIDE_PAGES = 150
SLIDE_DPI = 150


def pdf_to_word(pdf_path: str, out_path: str) -> str:
    """PDF a Word con pdf2docx (rehace párrafos, tablas e imágenes)."""
    import logging

    from pdf2docx import Converter

    logging.disable(logging.INFO)  # pdf2docx escribe mucho en el registro
    converter = Converter(pdf_path)
    try:
        converter.convert(out_path, multi_processing=False)
    finally:
        converter.close()
    return "Revisa el documento: los PDF con diseños complejos pueden necesitar algunos ajustes."


def _clean(value) -> str:
    if value is None:
        return ""
    text = str(value).replace("\r", " ").strip()
    # Excel no acepta caracteres de control.
    return re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", text)


def _as_number(text: str):
    """Convierte '1.234,50' o '1,234.50' o '25' en número si se puede."""
    t = text.replace(" ", "").replace(" ", "")
    if not re.fullmatch(r"-?[\d.,]+", t) or not re.search(r"\d", t):
        return text
    if re.fullmatch(r"0\d+", t):
        return text  # códigos con ceros a la izquierda (DNI, cuentas) se dejan como texto
    if "," in t and "." in t:
        if t.rfind(",") > t.rfind("."):
            t = t.replace(".", "").replace(",", ".")
        else:
            t = t.replace(",", "")
    elif "," in t:
        parts = t.split(",")
        t = t.replace(",", ".") if len(parts) == 2 and len(parts[1]) != 3 else t.replace(",", "")
    try:
        number = float(t)
        return int(number) if number.is_integer() and "." not in t else number
    except ValueError:
        return text


def pdf_to_excel(pdf_path: str, out_path: str) -> str:
    """Busca tablas con PyMuPDF y las pasa a una hoja por página."""
    from openpyxl import Workbook
    from openpyxl.styles import Font

    doc = pymupdf.open(pdf_path)
    wb = Workbook()
    wb.remove(wb.active)
    tables_found = 0
    try:
        for index, page in enumerate(doc):
            try:
                tables = page.find_tables().tables
            except Exception:  # noqa: BLE001 - una página rara no debe tumbar todo
                tables = []
            if not tables:
                continue
            ws = wb.create_sheet(title=f"Página {index + 1}"[:31])
            row = 1
            for table in tables:
                data = table.extract()
                for r, cells in enumerate(data):
                    for c, value in enumerate(cells):
                        text = _clean(value)
                        cell = ws.cell(row=row, column=c + 1, value=_as_number(text) if text else None)
                        if r == 0:
                            cell.font = Font(bold=True)
                    row += 1
                row += 1  # una fila vacía entre tablas
                tables_found += 1
            for column in ws.columns:
                width = max((len(str(c.value)) for c in column if c.value is not None), default=8)
                ws.column_dimensions[column[0].column_letter].width = min(60, max(8, width + 2))

        if tables_found:
            wb.save(out_path)
            return f"Encontramos {tables_found} {'tabla' if tables_found == 1 else 'tablas'}."

        # Sin tablas: se copia el texto línea por línea para no devolver un archivo vacío.
        ws = wb.create_sheet(title="Texto")
        row = 1
        for index, page in enumerate(doc):
            for line in page.get_text("text").splitlines():
                line = _clean(line)
                if line:
                    ws.cell(row=row, column=1, value=line)
                    row += 1
        if row == 1:
            raise ValueError("sin texto")
        ws.column_dimensions["A"].width = 100
        wb.save(out_path)
        return "No encontramos tablas, así que copiamos el texto línea por línea."
    finally:
        doc.close()


def pdf_to_powerpoint(pdf_path: str, out_path: str) -> str:
    """Una diapositiva por página, con la página como imagen y su texto en las notas."""
    from pptx import Presentation
    from pptx.util import Emu

    doc = pymupdf.open(pdf_path)
    try:
        if doc.page_count > MAX_SLIDE_PAGES:
            raise ValueError(f"demasiadas páginas ({doc.page_count})")
        prs = Presentation()
        first = doc[0].rect
        # 1 punto = 12 700 EMU. PowerPoint acepta de 1 a 56 pulgadas por lado.
        scale = min(1.0, 56 * 72 / max(first.width, first.height))
        prs.slide_width = Emu(int(first.width * scale * 12700))
        prs.slide_height = Emu(int(first.height * scale * 12700))
        blank = prs.slide_layouts[6]
        for page in doc:
            pix = page.get_pixmap(dpi=SLIDE_DPI, alpha=False)
            image = io.BytesIO(pix.tobytes("png"))
            slide = prs.slides.add_slide(blank)
            slide.shapes.add_picture(image, 0, 0, width=prs.slide_width, height=prs.slide_height)
            text = page.get_text("text").strip()
            if text:
                slide.notes_slide.notes_text_frame.text = text[:5000]
        prs.save(out_path)
        return "Cada página quedó como imagen en su diapositiva, con su texto en las notas."
    finally:
        doc.close()


def page_count(pdf_path: str) -> int:
    with pymupdf.open(pdf_path) as doc:
        if doc.needs_pass:
            raise PermissionError("protegido")
        return doc.page_count


LOCAL_CONVERTERS = {
    "pdf-a-word": (pdf_to_word, "docx", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
    "pdf-a-excel": (pdf_to_excel, "xlsx", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"),
    "pdf-a-powerpoint": (
        pdf_to_powerpoint,
        "pptx",
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
    ),
}


def run_in_child(kind: str, pdf_path: str, out_path: str, conn) -> None:
    """Punto de entrada del proceso hijo: convierte y avisa el resultado por la tubería."""
    try:
        note = LOCAL_CONVERTERS[kind][0](pdf_path, out_path)
        conn.send(("ok", note or ""))
    except Exception as exc:  # noqa: BLE001
        conn.send(("error", f"{type(exc).__name__}: {exc}"[:300]))
    finally:
        conn.close()
