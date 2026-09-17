"""Cálculo aproximado de sellos "ALTO EN" según los límites finales de la Ley 20.606 (Chile).

Los límites aplican por 100 g (sólidos) o 100 ml (líquidos). La ley rige para alimentos con
azúcares, sodio o grasas saturadas añadidos: el resultado es informativo.
"""

from typing import Literal

from app.schemas.product import Nutriments

SealCode = Literal["calories", "sugars", "sodium", "saturated_fat"]

THRESHOLDS: dict[str, dict[SealCode, float]] = {
    "solid": {"calories": 275.0, "sodium": 400.0, "sugars": 10.0, "saturated_fat": 4.0},
    "liquid": {"calories": 70.0, "sodium": 100.0, "sugars": 5.0, "saturated_fat": 3.0},
}

SEAL_LABELS_ES: dict[str, str] = {
    "calories": "calorías",
    "sugars": "azúcares",
    "sodium": "sodio",
    "saturated_fat": "grasas saturadas",
}


def compute_high_in_seals(nutriments: Nutriments, is_beverage: bool) -> list[SealCode]:
    """Devuelve los sellos que corresponden (solo con nutrientes conocidos)."""
    limits = THRESHOLDS["liquid" if is_beverage else "solid"]
    values: dict[SealCode, float | None] = {
        "calories": nutriments.energy_kcal,
        "sugars": nutriments.sugars,
        "sodium": nutriments.sodium_mg,
        "saturated_fat": nutriments.saturated_fat,
    }
    return [code for code, value in values.items() if value is not None and value > limits[code]]
