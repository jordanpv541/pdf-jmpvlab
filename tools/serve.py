"""Servidor local para probar el sitio con las mismas cabeceras que .htaccess.

Uso: python3 tools/serve.py [carpeta] [puerto]
"""
import functools
import http.server
import os
import sys
from urllib.parse import urlsplit

# Para probar las conversiones con la API local: PDF_API_URL=http://127.0.0.1:8800
_api = urlsplit(os.environ.get("PDF_API_URL", ""))
API_ORIGIN = f" {_api.scheme}://{_api.netloc}" if _api.netloc else ""

CSP = (
    "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; "
    "img-src 'self' blob: data:; font-src 'self' data:; "
    f"connect-src 'self'{API_ORIGIN} blob: data:; "
    "worker-src 'self' blob:; manifest-src 'self'; object-src 'none'; base-uri 'self'; "
    "form-action 'none'; frame-ancestors 'none'"
)


class Handler(http.server.SimpleHTTPRequestHandler):
    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".js": "text/javascript",
        ".mjs": "text/javascript",
        ".wasm": "application/wasm",
        ".webmanifest": "application/manifest+json",
        ".woff2": "font/woff2",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Content-Security-Policy", CSP)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Cache-Control", "no-cache")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "public"
    port = int(sys.argv[2]) if len(sys.argv) > 2 else 8765
    handler = functools.partial(Handler, directory=folder)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), handler).serve_forever()
