"""Fuente Open Food Facts simulada para las pruebas de integración del pipeline.

Sirve la instantánea real `tests/fixtures/off_search_chile_breakfast_cereals.json` con el
mismo contrato que la API v2 (`/api/v2/search` paginado y `/api/v2/product/<código>`), de modo
que el flujo NestJS → FastAPI → PostgreSQL se prueba de forma determinista y sin depender de la
disponibilidad de la fuente real. Detener el contenedor simula la caída de la fuente.

Uso: python off_mock_server.py [puerto]   (variable FIXTURE para otra instantánea)
Solo biblioteca estándar: se ejecuta con la imagen del propio servicio Python.
"""

import json
import os
import sys
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

FIXTURE = Path(
    os.environ.get(
        "FIXTURE",
        Path(__file__).resolve().parents[1]
        / "tests"
        / "fixtures"
        / "off_search_chile_breakfast_cereals.json",
    )
)
PRODUCTS: list[dict[str, object]] = json.loads(FIXTURE.read_text(encoding="utf-8"))["products"]


def _int(values: dict[str, list[str]], key: str, default: int) -> int:
    try:
        return max(1, int(values.get(key, [str(default)])[0]))
    except ValueError:
        return default


class Handler(BaseHTTPRequestHandler):
    server_version = "off-mock/1.0"

    def _send(self, status: int, payload: object) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_GET(self) -> None:
        url = urlparse(self.path)
        if url.path == "/api/v2/search":
            query = parse_qs(url.query)
            page, size = _int(query, "page", 1), _int(query, "page_size", 50)
            start = (page - 1) * size
            self._send(
                200,
                {
                    "count": len(PRODUCTS),
                    "page": page,
                    "page_size": size,
                    "products": PRODUCTS[start : start + size],
                },
            )
        elif url.path.startswith("/api/v2/product/"):
            self._send(200, {"status": 1, "product": {"code": url.path.rsplit("/", 1)[-1]}})
        elif url.path == "/health":
            self._send(200, {"status": "ok", "products": len(PRODUCTS)})
        else:
            self._send(404, {"status": 0})

    def log_message(self, format: str, *args: object) -> None:
        sys.stderr.write(f"off-mock {self.address_string()} {format % args}\n")


if __name__ == "__main__":
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8080
    print(f"off-mock: {len(PRODUCTS)} productos en :{port}", flush=True)
    ThreadingHTTPServer(("0.0.0.0", port), Handler).serve_forever()  # noqa: S104  # nosec B104
