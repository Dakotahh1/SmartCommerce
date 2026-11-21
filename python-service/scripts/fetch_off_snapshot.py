"""Guarda una instantánea cruda de Open Food Facts para las pruebas y evaluaciones reproducibles.

Usa el mismo cliente del servicio (User-Agent identificable, límite de solicitudes, reintentos y
solo los campos necesarios) y escribe la respuesta sin procesar en
`tests/fixtures/adaptive/off_<pais>_<categoria>.json`, con la URL, la fecha y la licencia ODbL.
La normalización se hace después con `build_adaptive_corpus.py`, así la evaluación no depende de
la red ni de cambios posteriores en la fuente.

Uso (desde python-service/):  uv run python scripts/fetch_off_snapshot.py [categoria ...]
"""

import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.config import Settings  # noqa: E402
from app.sources.openfoodfacts import OpenFoodFactsClient  # noqa: E402

COUNTRY = "chile"
# Las mismas categorías que la ingesta programada del staging (INGESTION_TARGETS).
DEFAULT_CATEGORIES = ("breakfast-cereals", "dairies", "beverages", "snacks")
PAGE_SIZE = 50
OUTPUT_DIR = ROOT / "tests" / "fixtures" / "adaptive"


async def main(categories: list[str]) -> None:
    # Solo se usa el cliente: el token interno no interviene en las llamadas a la fuente.
    settings = Settings(internal_api_token="x" * 32)
    client = OpenFoodFactsClient.from_settings(settings)
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)
    try:
        for category in categories:
            result = await client.search(country=COUNTRY, category=category, page_size=PAGE_SIZE)
            payload = {
                "source": result.url,
                "fetchedAt": datetime.now(UTC).isoformat(timespec="seconds"),
                "license": "ODbL-1.0 (Open Food Facts)",
                "count": result.count,
                "products": result.products,
            }
            destino = OUTPUT_DIR / f"off_{COUNTRY}_{category}.json"
            destino.write_text(
                json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8"
            )
            print(f"{category}: {len(result.products)} de {result.count} productos")
    finally:
        await client.aclose()


if __name__ == "__main__":
    asyncio.run(main(sys.argv[1:] or list(DEFAULT_CATEGORIES)))
