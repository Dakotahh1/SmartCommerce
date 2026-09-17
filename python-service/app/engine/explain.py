"""Generación de explicaciones en lenguaje natural fieles al cálculo."""

from collections.abc import Callable

from app.engine.criteria import PriceContext
from app.normalization.seals import SEAL_LABELS_ES
from app.schemas.engine import ProductCandidate

REASON_MIN_VALUE = 0.7
# Un precio al menos 10 % bajo la mediana ya es un motivo relevante para el usuario.
PRICE_REASON_MIN_VALUE = 0.55
MAX_REASONS = 4
AFFINITY_REASON_THRESHOLD = 0.3

NOVA_LABELS_ES: dict[int, str] = {
    1: "NOVA 1: sin procesar o mínimamente procesado",
    2: "NOVA 2: ingrediente culinario procesado",
    3: "NOVA 3: procesado",
    4: "NOVA 4: ultraprocesado",
}

MISSING_WARNINGS_ES: dict[str, str] = {
    "nutrition": "Sin Nutri-Score ni datos nutricionales completos",
    "price": "Precio no disponible",
    "processing": "Sin clasificación NOVA",
    "environment": "Sin Eco-Score",
    "availability": "Sin datos de tiendas",
}


def _price_reason(product: ProductCandidate, context: PriceContext) -> str | None:
    reference = context.reference_for(product.main_category)
    if product.unit_price is None or not reference:
        return None
    unit = "litro" if product.price_unit == "l" else "kg"
    percent = round((reference - product.unit_price) / reference * 100)
    if percent > 0:
        return f"{percent}% más barato por {unit} que la mediana"
    return f"Precio por {unit} en línea con la mediana"


def _nutrition_reason(product: ProductCandidate) -> str:
    if product.nutriscore_grade:
        return f"Nutri-Score {product.nutriscore_grade.upper()}"
    return "Buen perfil nutricional según sus nutrientes"


def _availability_reason(product: ProductCandidate, preferred_stores: list[str]) -> str:
    if preferred_stores and set(product.stores) & set(preferred_stores):
        return "Disponible en tus tiendas preferidas"
    return f"Disponible en {len(product.stores)} tiendas"


def _criterion_reason(
    criterion: str,
    product: ProductCandidate,
    context: PriceContext,
    preferred_stores: list[str],
) -> str | None:
    """Texto explicativo del criterio, construido solo con datos presentes en el producto."""
    builders: dict[str, Callable[[], str | None]] = {
        "nutrition": lambda: _nutrition_reason(product),
        "processing": lambda: NOVA_LABELS_ES[product.nova_group] if product.nova_group else None,
        "environment": lambda: (
            f"Eco-Score {product.ecoscore_grade.upper()}" if product.ecoscore_grade else None
        ),
        "price": lambda: _price_reason(product, context),
        "availability": lambda: _availability_reason(product, preferred_stores),
    }
    builder = builders.get(criterion)
    return builder() if builder else None


def build_reasons(
    product: ProductCandidate,
    *,
    values: dict[str, float | None],
    contributions: dict[str, float],
    context: PriceContext,
    preferred_stores: list[str],
    affinity: float,
) -> list[str]:
    """Razones ordenadas por contribución al puntaje, más señales de sellos y afinidad."""
    extras: list[str] = []
    if affinity >= AFFINITY_REASON_THRESHOLD:
        extras.append("Similar a productos que te interesaron")
    if product.nutriments and product.nutriments.complete_for_seals and not product.high_in_seals:
        extras.append("Sin sellos ALTO EN")

    reasons: list[str] = []
    budget = MAX_REASONS - len(extras)
    for criterion in sorted(contributions, key=lambda c: -contributions[c]):
        value = values.get(criterion)
        threshold = PRICE_REASON_MIN_VALUE if criterion == "price" else REASON_MIN_VALUE
        if len(reasons) >= budget:
            break
        if contributions[criterion] <= 0 or value is None or value < threshold:
            continue
        text = _criterion_reason(criterion, product, context, preferred_stores)
        if text:
            reasons.append(text)
    return [*reasons, *extras]


def build_warnings(
    product: ProductCandidate, values: dict[str, float | None], weights: dict[str, float]
) -> list[str]:
    warnings = [
        MISSING_WARNINGS_ES[criterion]
        for criterion, value in values.items()
        if value is None and weights.get(criterion, 0) > 0
    ]
    if product.high_in_seals:
        labels = ", ".join(SEAL_LABELS_ES[seal] for seal in product.high_in_seals)
        warnings.append(f"Sellos ALTO EN: {labels}")
    return warnings
