"""Genera los PDF de prueba de prueba_fuga.py y prueba_sitio.py (ya están en fixtures/).

Cada fuga-*.pdf esconde un texto SECRETO en la página 2 de una forma distinta. Al quitar
o censurar esa página, el secreto no debe quedar en ninguna parte del archivo.

Uso: python3 tests/e2e/generar_fuga.py   (necesita pikepdf y LibreOffice)
"""
import pathlib
import subprocess
import tempfile

import pikepdf
from pikepdf import Array, Dictionary, Name, Pdf, Stream, String

FX = pathlib.Path(__file__).resolve().parent / "fixtures"


def font(pdf):
    return pdf.make_indirect(Dictionary(Type=Name.Font, Subtype=Name.Type1, BaseFont=Name.Helvetica, Encoding=Name.WinAnsiEncoding))


def page_with(pdf, f, txt):
    s = pdf.make_indirect(Stream(pdf, f"BT /F1 30 Tf 72 500 Td ({txt}) Tj ET".encode()))
    return pikepdf.Page(Dictionary(Type=Name.Page, MediaBox=[0, 0, 612, 792], Resources=Dictionary(Font=Dictionary(F1=f)), Contents=s))


def three(texts):
    pdf = Pdf.new()
    f = font(pdf)
    for t in texts:
        pdf.pages.append(page_with(pdf, f, t))
    return pdf


# 1) Enlace de la página 1 a la 2 (como un índice)
pdf = three(["Indice: ver pagina 2", "SECRETO-LINK-222", "Pagina tres"])
link = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Link, Rect=[72, 490, 400, 540], Border=[0, 0, 0], Dest=Array([pdf.pages[1].obj, Name.Fit])))
pdf.pages[0].obj.Annots = Array([link])
pdf.save(FX / "fuga-links.pdf", compress_streams=False)

# 2) Recursos compartidos, heredados del nodo /Pages
pdf = Pdf.new()
f = font(pdf)
fx = []
for txt in ["Pagina uno", "SECRETO-RES-333", "Pagina tres"]:
    s = Stream(pdf, f"BT /F1 36 Tf 72 500 Td ({txt}) Tj ET".encode())
    s.Type = Name.XObject
    s.Subtype = Name.Form
    s.BBox = [0, 0, 612, 792]
    s.Resources = Dictionary(Font=Dictionary(F1=f))
    fx.append(pdf.make_indirect(s))
for i in range(3):
    pdf.pages.append(pikepdf.Page(Dictionary(Type=Name.Page, MediaBox=[0, 0, 612, 792], Contents=pdf.make_indirect(Stream(pdf, f"/Fx{i + 1} Do".encode())))))
for i in range(3):
    if Name.Resources in pdf.pages[i].obj:
        del pdf.pages[i].obj[Name.Resources]
pdf.Root.Pages.Resources = Dictionary(XObject=Dictionary(Fx1=fx[0], Fx2=fx[1], Fx3=fx[2]), Font=Dictionary(F1=f))
pdf.save(FX / "fuga-shared.pdf", compress_streams=False)

# 3) Enlaces con nombre (árbol /Names /Dests) y acción GoTo con nombre
pdf = three(["Indice con nombres", "SECRETO-NAMED-666", "Pagina tres"])
p2, p3 = pdf.pages[1].obj, pdf.pages[2].obj
pdf.Root.Names = Dictionary(Dests=Dictionary(Names=Array([String("cap2"), Array([p2, Name.Fit]), String("cap3"), Dictionary(D=Array([p3, Name.Fit]))])))
l1 = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Link, Rect=[72, 490, 400, 540], Dest=String("cap2")))
l2 = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Link, Rect=[72, 400, 400, 450], A=Dictionary(S=Name.GoTo, D=String("cap3"))))
l3 = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Link, Rect=[72, 300, 400, 350], A=Dictionary(S=Name.URI, URI=String("https://example.com"))))
pdf.pages[0].obj.Annots = Array([l1, l2, l3])
pdf.save(FX / "fuga-named.pdf", compress_streams=False)

# 4) Formulario: un campo padre con hijos en las páginas 1 y 2
pdf = three(["Formulario", "Pagina dos del formulario", "Pagina tres"])
parent = pdf.make_indirect(Dictionary(T=String("persona"), Kids=Array([])))
w1 = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Widget, FT=Name.Tx, T=String("nombre"), V=String("Juan"), Rect=[72, 600, 300, 620], Parent=parent, P=pdf.pages[0].obj))
w2 = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Widget, FT=Name.Tx, T=String("dni"), V=String("SECRETO-CAMPO-444"), Rect=[72, 600, 300, 620], Parent=parent, P=pdf.pages[1].obj))
parent.Kids = Array([w1, w2])
pdf.pages[0].obj.Annots = Array([w1])
pdf.pages[1].obj.Annots = Array([w2])
pdf.Root.AcroForm = Dictionary(Fields=Array([parent]))
pdf.save(FX / "fuga-form.pdf", compress_streams=False)

# 5) Nota que responde (/IRT) a una nota de la página 2
pdf = three(["Con notas", "Pagina dos", "Pagina tres"])
n2 = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Text, Rect=[72, 700, 92, 720], Contents=String("SECRETO-NOTA-555"), P=pdf.pages[1].obj))
n1 = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Text, Rect=[72, 700, 92, 720], Contents=String("respuesta"), IRT=n2, P=pdf.pages[0].obj))
pdf.pages[0].obj.Annots = Array([n1])
pdf.pages[1].obj.Annots = Array([n2])
pdf.save(FX / "fuga-irt.pdf", compress_streams=False)

# 6) Documento real con índice: HTML con anclas convertido con LibreOffice
html = """<html><body>
<h1>Indice</h1><p><a href="#c2">Capitulo dos</a></p><p><a href="#c3">Capitulo tres</a></p>
<h1 id="c2" style="page-break-before:always">Capitulo dos</h1><p>SECRETO-WORD-777 texto privado.</p>
<h1 id="c3" style="page-break-before:always">Capitulo tres</h1><p>Final.</p>
</body></html>"""
with tempfile.TemporaryDirectory() as tmp:
    src = pathlib.Path(tmp) / "fuga-indice.html"
    src.write_text(html)
    subprocess.run(["soffice", "--headless", "--convert-to", "pdf:writer_pdf_Export", "--outdir", str(FX), str(src)], check=True, capture_output=True)

# 7) PDF con firma digital (un campo de firma con valor): las herramientas deben avisar
pdf = three(["Contrato firmado", "Pagina dos", "Pagina tres"])
sig_value = pdf.make_indirect(Dictionary(Type=Name.Sig, Filter=Name("/Adobe.PPKLite"), SubFilter=Name("/adbe.pkcs7.detached"), ByteRange=Array([0, 0, 0, 0]), Contents=pikepdf.String(b"\x00" * 16)))
widget = pdf.make_indirect(Dictionary(Type=Name.Annot, Subtype=Name.Widget, FT=Name.Sig, T=String("Firma1"), V=sig_value, Rect=[0, 0, 0, 0], P=pdf.pages[0].obj, F=132))
pdf.pages[0].obj.Annots = Array([widget])
pdf.Root.AcroForm = Dictionary(Fields=Array([widget]), SigFlags=3)
pdf.save(FX / "firmado.pdf")
print("listo")
