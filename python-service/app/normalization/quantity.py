"""Interpretación de cantidades netas ("700 g", "1,5 L", "6 x 30 g") en gramos o mililitros."""

import re
from typing import Literal

Unit = Literal["g", "ml"]

_UNITS: dict[str, tuple[Unit, float]] = {
    "g": ("g", 1.0),
    "gr": ("g", 1.0),
    "grs": ("g", 1.0),
    "gramos": ("g", 1.0),
    "kg": ("g", 1000.0),
    "kilo": ("g", 1000.0),
    "kilos": ("g", 1000.0),
    "mg": ("g", 0.001),
    "ml": ("ml", 1.0),
    "cc": ("ml", 1.0),
    "cl": ("ml", 10.0),
    "dl": ("ml", 100.0),
    "l": ("ml", 1000.0),
    "lt": ("ml", 1000.0),
    "lts": ("ml", 1000.0),
    "litro": ("ml", 1000.0),
    "litros": ("ml", 1000.0),
}

_PATTERN = re.compile(
    r"(?:(?P<count>\d{1,3})\s*[x×]\s*)?(?P<value>\d+(?:[.,]\d+)?)\s*(?P<unit>[a-zA-Z]+)",
    re.IGNORECASE,
)


def _to_float(value: object) -> float | None:
    try:
        number = float(str(value).replace(",", "."))
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def parse_quantity(
    text: str | None,
    product_quantity: object = None,
    product_quantity_unit: object = None,
) -> tuple[float | None, Unit | None]:
    """Devuelve `(cantidad, unidad)` normalizados o `(None, None)` si no es interpretable.

    Se prefiere el valor estructurado de la fuente (`product_quantity` + unidad) y, si falta,
    se interpreta el texto libre.
    """
    structured = _to_float(product_quantity)
    unit_key = str(product_quantity_unit or "").strip().lower()
    if structured is not None and unit_key in _UNITS:
        unit, factor = _UNITS[unit_key]
        return round(structured * factor, 3), unit

    if not text:
        return None, None
    match = _PATTERN.search(text)
    if not match:
        return None, None
    unit_info = _UNITS.get(match.group("unit").lower())
    value = _to_float(match.group("value"))
    if unit_info is None or value is None:
        return None, None
    unit, factor = unit_info
    count = int(match.group("count")) if match.group("count") else 1
    return round(count * value * factor, 3), unit
