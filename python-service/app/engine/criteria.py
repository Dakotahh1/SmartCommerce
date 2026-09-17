"""Funciones de valor (0 a 1) para cada criterio de decisión."""

from collections.abc import Iterable, Sequence
from dataclasses import dataclass
from statistics import median

from app.schemas.engine import ProductCandidate

CRITERIA: tuple[str, ...] = ("nutrition", "price", "processing", "environment", "availability")

CRITERION_LABELS_ES: dict[str, str] = {
    "nutrition": "Nutrición",
    "price": "Precio por unidad",
    "processing": "Procesamiento",
    "environment": "Impacto ambiental",
    "availability": "Disponibilidad",
}

GRADE_VALUES: dict[str, float] = {"a": 1.0, "b": 0.8, "c": 0.55, "d": 0.3, "e": 0.1}
NOVA_VALUES: dict[int, float] = {1: 1.0, 2: 0.8, 3: 0.5, 4: 0.15}
STORES_FOR_FULL_AVAILABILITY = 5


@dataclass(frozen=True)
class PriceContext:
    """Medianas de precio por unidad usadas como referencia del criterio precio."""

    by_category: dict[str, float]
    global_median: float | None

    def reference_for(self, category: str | None) -> float | None:
        if category and category in self.by_category:
            return self.by_category[category]
        return self.global_median


def build_price_context(products: Iterable[ProductCandidate]) -> PriceContext:
    prices_by_category: dict[str, list[float]] = {}
    all_prices: list[float] = []
    for product in products:
        if product.unit_price is None:
            continue
        all_prices.append(product.unit_price)
        if product.main_category:
            prices_by_category.setdefault(product.main_category, []).append(product.unit_price)
    return PriceContext(
        by_category={
            cat: median(values) for cat, values in prices_by_category.items() if len(values) >= 2
        },
        global_median=median(all_prices) if len(all_prices) >= 2 else None,
    )


def nutrition_value(product: ProductCandidate) -> float | None:
    if product.nutriscore_grade:
        return GRADE_VALUES[product.nutriscore_grade]
    if product.nutriments is not None and product.nutriments.complete_for_seals:
        return max(0.1, 0.9 - 0.2 * len(product.high_in_seals))
    return None


def processing_value(product: ProductCandidate) -> float | None:
    return NOVA_VALUES.get(product.nova_group) if product.nova_group else None


def environment_value(product: ProductCandidate) -> float | None:
    return GRADE_VALUES[product.ecoscore_grade] if product.ecoscore_grade else None


def price_value(product: ProductCandidate, context: PriceContext) -> float | None:
    if product.unit_price is None:
        return None
    reference = context.reference_for(product.main_category)
    if reference is None or reference <= 0:
        return 0.5
    return min(1.0, max(0.0, 0.5 + 0.5 * (reference - product.unit_price) / reference))


def availability_value(product: ProductCandidate, preferred_stores: Sequence[str]) -> float | None:
    if not product.stores:
        return None
    value = min(1.0, len(product.stores) / STORES_FOR_FULL_AVAILABILITY)
    if preferred_stores and set(product.stores) & set(preferred_stores):
        value = max(value, 0.9)
    return value


def evaluate(
    product: ProductCandidate, context: PriceContext, preferred_stores: Sequence[str] = ()
) -> dict[str, float | None]:
    """Valor de cada criterio; `None` significa dato faltante (no se inventa)."""
    return {
        "nutrition": nutrition_value(product),
        "price": price_value(product, context),
        "processing": processing_value(product),
        "environment": environment_value(product),
        "availability": availability_value(product, preferred_stores),
    }
