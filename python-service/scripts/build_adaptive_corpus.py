"""Genera el catálogo de evaluación del motor adaptativo desde una instantánea real de la fuente.

Pasa cada respuesta cruda de `tests/fixtures/adaptive/` por el mismo pipeline de normalización
del servicio y escribe `evaluation/adaptive/catalog.json`: una lista de candidatos por categoría,
con los mismos campos que NestJS envía al motor. La fecha de recuperación sale de la instantánea,
así el archivo es reproducible byte a byte.

Uso (desde python-service/):  uv run python scripts/build_adaptive_corpus.py
"""

import json
import sys
from datetime import datetime
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.normalization.normalizer import normalize_batch  # noqa: E402

SNAPSHOTS = ROOT / "tests" / "fixtures" / "adaptive"
OUTPUT = ROOT.parent / "evaluation" / "adaptive" / "catalog.json"
CANDIDATE_FIELDS = (
    "gtin",
    "name",
    "brand",
    "mainCategory",
    "nutriscoreGrade",
    "novaGroup",
    "ecoscoreGrade",
    "nutriments",
    "highInSeals",
    "allergens",
    "traces",
    "labels",
    "diets",
    "stores",
    "dataQualityScore",
)


def main() -> None:
    queries: dict[str, list[dict[str, object]]] = {}
    reports: dict[str, dict[str, object]] = {}
    sources: dict[str, str] = {}
    for snapshot in sorted(SNAPSHOTS.glob("off_chile_*.json")):
        category = snapshot.stem.removeprefix("off_chile_")
        data = json.loads(snapshot.read_text(encoding="utf-8"))
        result = normalize_batch(
            data["products"], fetched_at=datetime.fromisoformat(data["fetchedAt"])
        )
        queries[category] = [
            {
                key: value
                for key, value in product.model_dump(mode="json", by_alias=True).items()
                if key in CANDIDATE_FIELDS
            }
            for product in result.products
        ]
        reports[category] = result.report.model_dump(mode="json", by_alias=True)
        sources[category] = f"{data['source']} (recuperado {data['fetchedAt']})"

    payload = {
        "description": "Productos reales de Open Food Facts Chile por categoría, normalizados por "
        "el servicio Python. Candidatos de la evaluación del motor adaptativo.",
        "license": "ODbL-1.0 (Open Food Facts)",
        "sources": sources,
        "reports": reports,
        "queries": queries,
    }
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(payload, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    total = sum(len(items) for items in queries.values())
    print(f"{total} candidatos en {len(queries)} categorías → {OUTPUT.relative_to(ROOT.parent)}")


if __name__ == "__main__":
    main()
