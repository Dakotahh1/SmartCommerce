import pytest
from app.normalization.gtin import InvalidGtinError, canonicalize_gtin, gs1_check_digit_is_valid
from app.normalization.quantity import parse_quantity
from app.normalization.seals import compute_high_in_seals
from app.normalization.tags import normalize_allergens, normalize_tags, strip_language
from app.schemas.product import Nutriments


class TestGtin:
    @pytest.mark.parametrize("code", ["7802000014130", "3017620422003", "96385074"])
    def test_valid_check_digit(self, code: str) -> None:
        assert gs1_check_digit_is_valid(code)

    def test_upc_a_is_padded_to_ean13(self) -> None:
        assert canonicalize_gtin("036000291452") == "0036000291452"

    def test_gtin14_with_zero_indicator_is_reduced(self) -> None:
        assert canonicalize_gtin("07802000014130") == "7802000014130"

    def test_separators_are_removed(self) -> None:
        assert canonicalize_gtin("780-2000 014130") == "7802000014130"

    @pytest.mark.parametrize(
        ("raw", "reason"),
        [
            (None, "ausente"),
            ("", "ausente"),
            ("78020ABC14130", "no numéricos"),
            ("12345", "largo inválido"),
            ("7802000014131", "dígito verificador"),
        ],
    )
    def test_invalid_codes_are_rejected_with_reason(self, raw: object, reason: str) -> None:
        with pytest.raises(InvalidGtinError, match=reason):
            canonicalize_gtin(raw)


class TestQuantity:
    @pytest.mark.parametrize(
        ("text", "expected"),
        [
            ("700 g", (700.0, "g")),
            ("1,5 L", (1500.0, "ml")),
            ("6 x 30 g", (180.0, "g")),
            ("1kg", (1000.0, "g")),
            ("750 cc", (750.0, "ml")),
            ("70cl", (700.0, "ml")),
            ("sin dato", (None, None)),
            ("3 manzanas", (None, None)),
            (None, (None, None)),
        ],
    )
    def test_parse_text(self, text: str | None, expected: tuple[float | None, str | None]) -> None:
        assert parse_quantity(text) == expected

    def test_structured_value_takes_precedence(self) -> None:
        assert parse_quantity("1 kg", product_quantity="700", product_quantity_unit="g") == (
            700.0,
            "g",
        )

    def test_invalid_structured_value_falls_back_to_text(self) -> None:
        assert parse_quantity("330 g", product_quantity="-1", product_quantity_unit="g") == (
            330.0,
            "g",
        )


class TestSeals:
    def test_solid_thresholds(self) -> None:
        nutriments = Nutriments(energy_kcal=402, sugars=21.4, saturated_fat=1.9, sodium_mg=180)
        assert compute_high_in_seals(nutriments, is_beverage=False) == ["calories", "sugars"]

    def test_liquid_thresholds_are_stricter(self) -> None:
        nutriments = Nutriments(energy_kcal=45, sugars=6, saturated_fat=0.1, sodium_mg=120)
        assert compute_high_in_seals(nutriments, is_beverage=True) == ["sugars", "sodium"]

    def test_values_at_threshold_do_not_trigger(self) -> None:
        nutriments = Nutriments(energy_kcal=275, sugars=10, saturated_fat=4, sodium_mg=400)
        assert compute_high_in_seals(nutriments, is_beverage=False) == []

    def test_unknown_nutrients_are_not_flagged(self) -> None:
        assert compute_high_in_seals(Nutriments(sugars=None), is_beverage=False) == []


class TestTags:
    def test_strip_language(self) -> None:
        assert strip_language("en:Breakfast-Cereals") == "breakfast-cereals"

    def test_normalize_tags_dedupes_and_cleans(self) -> None:
        assert normalize_tags(["en:gluten", "es:gluten", "Líder Express", 3, ""]) == [
            "gluten",
            "l-der-express",
        ]

    def test_normalize_tags_rejects_non_iterables(self) -> None:
        assert normalize_tags("en:gluten") == []
        assert normalize_tags(None) == []

    def test_allergens_are_mapped_to_controlled_vocabulary(self) -> None:
        assert normalize_allergens(["en:soybeans", "en:gluten", "en:unknown", "en:nuts"]) == [
            "gluten",
            "soy",
            "tree_nuts",
        ]
