import json
from datetime import UTC, datetime
from pathlib import Path

import pytest
from app.normalization.normalizer import normalize_batch
from app.normalization.text import build_search_fields, fold, stem, tokenize

FIXTURES = Path(__file__).parent / "fixtures"
CASES = json.loads((FIXTURES / "text_normalization_cases.json").read_text(encoding="utf-8"))[
    "cases"
]


@pytest.mark.parametrize("case", CASES, ids=[c["input"] or "vacío" for c in CASES])
def test_tokenize_shared_cases(case: dict[str, object]) -> None:
    """Los mismos casos se verifican en el backend: consulta e índice usan reglas idénticas."""
    assert tokenize(str(case["input"])) == case["tokens"]


def test_fold_removes_diacritics_and_symbols() -> None:
    assert fold("Ñandú CAFÉ-con_Leche!") == "nandu cafe con leche"


@pytest.mark.parametrize(
    ("word", "expected"),
    [
        ("cereales", "cereal"),
        ("panes", "pan"),
        ("semillas", "semilla"),
        ("chocolates", "chocolate"),
        ("cross", "cross"),
        ("gas", "gas"),
        ("avena", "avena"),
    ],
)
def test_stem_reduces_regular_plurals(word: str, expected: str) -> None:
    assert stem(word) == expected


def test_tokenize_none_returns_empty() -> None:
    assert tokenize(None) == []


def test_build_search_fields_separates_primary_and_secondary() -> None:
    primary, secondary = build_search_fields(
        name="Avena Instantánea",
        brand="Quaker, PepsiCo",
        generic_name="Hojuelas de avena",
        categories=["plant-based-foods", "breakfast-cereals"],
        labels=["no-added-sugar"],
    )
    assert primary == "avena instantanea quaker pepsico"
    # "avena" ya está en el primario; las categorías aportan términos en español.
    assert secondary.split()[:3] == ["hojuela", "cereal", "desayuno"]
    assert "avena" not in secondary.split()
    assert "sugar" in secondary.split()


def test_build_search_fields_truncates_on_token_boundary() -> None:
    primary, _ = build_search_fields(
        name=" ".join(f"palabra{i}" for i in range(80)),
        brand=None,
        generic_name=None,
        categories=[],
        labels=[],
    )
    assert len(primary) <= 500
    assert all(token.startswith("palabra") for token in primary.split())


def test_normalized_fixture_products_are_searchable() -> None:
    raw = json.loads(
        (FIXTURES / "off_search_chile_breakfast_cereals.json").read_text(encoding="utf-8")
    )["products"]
    result = normalize_batch(raw, fetched_at=datetime(2026, 10, 1, tzinfo=UTC))
    assert result.products
    for product in result.products:
        assert product.search_primary, product.name
        assert set(tokenize(product.name)) <= set(product.search_primary.split())
    cereal = [p for p in result.products if "cereal" in p.search_secondary.split()]
    assert len(cereal) >= len(result.products) // 2
