# API de conversiones de PDF jmpvlab (AGPL-3.0-or-later)
FROM python:3.12-slim

# El disco del contenedor es de solo lectura: HOME=/tmp para que las librerías guarden sus cachés ahí.
# Un solo hilo para numpy/OpenCV en cada conversión: con 2 conversiones a la vez en 2 CPU
# alcanza, y así cada proceso usa menos memoria (tiene un tope, CHILD_MEMORY_MB).
ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    HOME=/tmp \
    OMP_NUM_THREADS=1 \
    OPENBLAS_NUM_THREADS=1 \
    MALLOC_ARENA_MAX=2

# libglib2.0-0: algunas versiones de OpenCV (que usa pdf2docx) la piden al importarse.
RUN apt-get update \
    && apt-get install -y --no-install-recommends libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/* \
    && useradd --create-home --uid 10001 app

WORKDIR /app
COPY requirements.txt .
RUN pip install -r requirements.txt
COPY app.py converters.py ./

USER app
EXPOSE 8000
# Sin registro de visitas (--no-access-log): no guardamos IP ni nombres de archivo.
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000", "--no-access-log", "--proxy-headers", "--forwarded-allow-ips", "*"]
