"""Lo común a las pruebas del sitio en el navegador (ver tests/e2e/README.md)."""
import os
from pathlib import Path

AQUI = Path(__file__).resolve().parent
# Dirección del sitio que se prueba. run.py levanta uno local en el puerto 8765.
BASE = os.environ.get('E2E_BASE', 'http://127.0.0.1:8765/')
# Servidor de conversiones local (solo para las pruebas «con servidor»).
API = os.environ.get('E2E_API', 'http://127.0.0.1:8800')
FX = AQUI / 'fixtures'
_SALIDAS = Path(os.environ.get('E2E_OUT', AQUI / '.salidas'))


def salida(nombre):
    """Carpeta para los archivos que descarga una prueba."""
    carpeta = _SALIDAS / nombre
    carpeta.mkdir(parents=True, exist_ok=True)
    return carpeta
