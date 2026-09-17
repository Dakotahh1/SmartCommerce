from datetime import UTC, datetime
from typing import Any

import pytest
from app.normalization.normalizer import (
    RejectedProductError,
    normalize_batch,
    normalize_product,
    raw_hash,
)

FETCHED = datetime(2026, 9, 17, 12, 0, tzinfo=UTC)


def raw_product(**overrides: Any) -> dict[str, Any]:
    data: dict[str, Any] = {
        "code": "7804000001431",
        "product_name": "  Hojuelas   sabor chocolate ",
        "brands": "Enlinea, Otra",
        "categories_tags": ["en:plant-based-foods", "en:breakfast-cereals"],
        "quantity": "330 g",
        "nutriscore_grade": "A",
        "nova_group": "4",
        "ecoscore_grade": "c",
        "nutriments": {
            "energy-kcal_100g": 380,
            "sugars_100g": 21.4,
            "saturated-fat_100g": 1.2,
            "sodium_100g": 0.18,
            "proteins_100g": 8,
        },
        "allergens_tags": ["en:gluten", "en:milk", "en:soybeans"],
        "traces_tags": ["en:nuts"],
        "labels_tags": ["en:no-added-sugar", "en:vegetarian"],
        "ingredients_analysis_tags": ["en:non-vegan", "en:vegetarian"],
        "stores_tags": ["lider", "jumbo"],
        "countries_tags": ["en:chile"],
        "image_front_url": "https://images.openfoodfacts.org/images/products/780/400/000/1431/front_es.27.400.jpg",
        "completeness": 0.8875,
        "last_modified_t": 1775566699,
    }
    data.update(overrides)
    return data


class TestNormalizeProduct:
    def test_full_record_is_normalized(self) -> None:
        product = normalize_product(raw_product(), fetched_at=FETCHED)

        assert product.gtin == "7804000001431"
        assert product.name == "Hojuelas sabor chocolate"
        assert product.brand == "Enlinea"
        assert product.main_category == "breakfast-cereals"
        assert (product.net_quantity, product.unit, product.is_beverage) == (330.0, "g", False)
        assert (product.nutriscore_grade, product.nova_group, product.ecoscore_grade) == (
            "a",
            4,
            "c",
        )
        assert product.nutriments.sodium_mg == 180.0
        assert product.high_in_seals == ["calories", "sugars"]
        assert product.allergens == ["gluten", "milk", "soy"]
        assert product.traces == ["tree_nuts"]
        assert product.diets.vegan is False
        assert product.diets.vegetarian is True
        assert product.diets.gluten_free is False
        assert product.diets.lactose_free is False
        assert product.source.url == "https://world.openfoodfacts.org/product/7804000001431"
        assert product.source.fetched_at == FETCHED
        assert product.source.last_modified_at is not None
        assert product.raw_hash == raw_hash(raw_product())
        assert 0.8 <= product.data_quality_score <= 1.0

    def test_spanish_name_is_preferred(self) -> None:
        product = normalize_product(
            raw_product(product_name_es="Hojuelas chocolate"), fetched_at=FETCHED
        )
        assert product.name == "Hojuelas chocolate"

    def test_unknown_grades_become_null(self) -> None:
        product = normalize_product(
            raw_product(
                nutriscore_grade="unknown", ecoscore_grade="not-applicable", nova_group="9"
            ),
            fetched_at=FETCHED,
        )
        assert (product.nutriscore_grade, product.ecoscore_grade, product.nova_group) == (
            None,
            None,
            None,
        )

    def test_sodium_is_derived_from_salt_and_energy_from_kj(self) -> None:
        product = normalize_product(
            raw_product(nutriments={"salt_100g": 1.0, "energy_100g": 1674, "sugars_100g": 1}),
            fetched_at=FETCHED,
        )
        assert product.nutriments.sodium_mg == 400.0
        assert product.nutriments.energy_kcal == 400.1

    def test_out_of_range_nutrient_is_dropped_with_warning(self) -> None:
        product = normalize_product(
            raw_product(nutriments={"sugars_100g": 150}), fetched_at=FETCHED
        )
        assert product.nutriments.sugars is None
        assert any("sugars fuera de rango" in warning for warning in product.warnings)

    def test_untrusted_image_domain_is_discarded(self) -> None:
        product = normalize_product(
            raw_product(image_front_url="https://evil.example/x.jpg"), fetched_at=FETCHED
        )
        assert product.image_url is None

    def test_control_characters_are_removed_from_names(self) -> None:
        product = normalize_product(
            raw_product(product_name="Avena\x00\u200b Quaker"), fetched_at=FETCHED
        )
        assert product.name == "Avena Quaker"

    def test_beverage_detection_uses_categories(self) -> None:
        product = normalize_product(
            raw_product(
                categories_tags=["en:beverages"], quantity="1 L", nutriments={"sugars_100g": 6}
            ),
            fetched_at=FETCHED,
        )
        assert product.is_beverage is True
        assert product.high_in_seals == ["sugars"]

    @pytest.mark.parametrize(
        ("overrides", "reason"),
        [
            ({"code": None}, "GTIN ausente"),
            ({"code": "123"}, "largo inválido"),
            ({"product_name": " ", "brands": "X"}, "sin nombre"),
        ],
    )
    def test_rejections(self, overrides: dict[str, Any], reason: str) -> None:
        with pytest.raises(RejectedProductError, match=reason):
            normalize_product(raw_product(**overrides), fetched_at=FETCHED)


class TestNormalizeBatch:
    def test_duplicates_keep_most_complete_record(self) -> None:
        older = raw_product(completeness=0.5, product_name="Versión incompleta")
        newer = raw_product(completeness=0.9, product_name="Versión completa")
        result = normalize_batch(
            [older, newer, raw_product(code="7802000014130")], fetched_at=FETCHED
        )

        assert result.report.duplicates == 1
        assert result.report.valid == 2
        assert result.products[0].name == "Versión completa"

    def test_report_counts_rejections_and_coverage(self) -> None:
        batch = [
            raw_product(),
            raw_product(code="bad"),
            "no es un objeto",
            raw_product(code="7802000014130", brands=None),
        ]
        result = normalize_batch(batch, fetched_at=FETCHED)  # type: ignore[arg-type]
        report = result.report

        assert (report.received, report.valid, report.rejected, report.duplicates) == (4, 2, 2, 0)
        assert report.valid_ratio == 0.5
        assert report.field_coverage["brand"] == 0.5
        assert {r.reason for r in report.rejections} == {
            "GTIN con caracteres no numéricos",
            "Registro con formato inválido",
        }

    def test_real_open_food_facts_sample(self, off_search_payload: dict[str, Any]) -> None:
        result = normalize_batch(off_search_payload["products"], fetched_at=FETCHED)
        report = result.report

        assert report.received == len(off_search_payload["products"])
        assert report.valid + report.rejected + report.duplicates == report.received
        assert report.valid_ratio >= 0.9
        assert all(p.source.url.endswith(p.gtin) for p in result.products)
        assert len({p.gtin for p in result.products}) == len(result.products)

    def test_empty_batch(self) -> None:
        result = normalize_batch([])
        assert result.report.received == 0
        assert result.report.valid_ratio == 0.0
        assert result.report.field_coverage == {}
