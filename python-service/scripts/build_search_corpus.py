"""Genera el corpus de evaluación de la búsqueda desde una instantánea real de Open Food Facts.

Pasa la respuesta cruda guardada en `tests/fixtures/off_search_chile_breakfast_cereals.json`
por el mismo pipeline de normalización del servicio y escribe los productos normalizados en
`evaluation/retrieval/corpus.json`. El backend ingiere ese corpus en sus pruebas e2e y mide la
calidad del ranking (ver `backend/test/retrieval.e2e-spec.ts`).

Uso (desde python-service/):  uv run python scripts/build_search_corpus.py
"""

import json
import sys
from datetime import UTC, datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.normalization.normalizer import normalize_batch  # noqa: E402

SNAPSHOT = ROOT / "tests" / "fixtures" / "off_search_chile_breakfast_cereals.json"
OUTPUT = ROOT.parent / "evaluation" / "retrieval" / "corpus.json"
# Fecha fija: el corpus es reproducible byte a byte.
FETCHED_AT = datetime(2026, 10, 1, 12, 0, tzinfo=UTC)


def main() -> None:
    raw = json.loads(SNAPSHOT.read_text(encoding="utf-8"))["products"]
    result = normalize_batch(raw, fetched_at=FETCHED_AT)
    payload = {
        "source": "Open Food Facts · /api/v2/search?countries_tags_en=chile"
        "&categories_tags_en=breakfast-cereals (instantánea de tests/fixtures)",
        "license": "ODbL-1.0",
        "generatedFrom": SNAPSHOT.name,
        "report": result.report.model_dump(mode="json", by_alias=True),
        "products": [p.model_dump(mode="json", by_alias=True) for p in result.products],
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"{len(result.products)} productos → {OUTPUT.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
