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

# Escalas no lineales: el salto A→B importa menos que C→D, porque la diferencia real de calidad
# se concentra en la cola baja. Se usan para Nutri-Score y Eco-Score (mismas letras A–E).
GRADE_VALUES: dict[str, float] = {"a": 1.0, "b": 0.8, "c": 0.55, "d": 0.3, "e": 0.1}
# NOVA 4 (ultraprocesado) queda muy castigado; NOVA 1 y 2 son casi equivalentes para decidir.
NOVA_VALUES: dict[int, float] = {1: 1.0, 2: 0.8, 3: 0.5, 4: 0.15}
# Estar en 5 o más tiendas ya se considera "fácil de encontrar".
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
    """Nutri-Score si existe; si no, una estimación a partir de los sellos ALTO EN."""
    if product.nutriscore_grade:
        return GRADE_VALUES[product.nutriscore_grade]
    # Respaldo cuando Open Food Facts no trae Nutri-Score pero sí los nutrientes: se parte de 0,9
    # y cada sello resta 0,2 (cuatro sellos ⇒ 0,1). Nunca llega a 0 porque es una estimación.
    if product.nutriments is not None and product.nutriments.complete_for_seals:
        return max(0.1, 0.9 - 0.2 * len(product.high_in_seals))
    return None


def processing_value(product: ProductCandidate) -> float | None:
    return NOVA_VALUES.get(product.nova_group) if product.nova_group else None


def environment_value(product: ProductCandidate) -> float | None:
    return GRADE_VALUES[product.ecoscore_grade] if product.ecoscore_grade else None


def price_value(product: ProductCandidate, context: PriceContext) -> float | None:
    """Precio por unidad comparado con la mediana de su categoría, no en pesos absolutos.

    Escala: igual a la mediana ⇒ 0,5; gratis ⇒ 1,0; el doble de la mediana o más ⇒ 0,0.
    Así un aceite caro no compite contra unos fideos baratos, sino contra su propia categoría.
    """
    if product.unit_price is None:
        return None
    reference = context.reference_for(product.main_category)
    # Sin mediana de referencia (pocos precios conocidos) se devuelve el punto neutro.
    if reference is None or reference <= 0:
        return 0.5
    return min(1.0, max(0.0, 0.5 + 0.5 * (reference - product.unit_price) / reference))


def availability_value(product: ProductCandidate, preferred_stores: Sequence[str]) -> float | None:
    """Cuántas tiendas lo venden; estar en una tienda preferida vale casi lo máximo."""
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
