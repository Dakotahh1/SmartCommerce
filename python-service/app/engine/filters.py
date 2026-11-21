"""Filtros duros basados en reglas (restricciones del perfil)."""

from app.normalization.seals import SEAL_LABELS_ES
from app.normalization.tags import ALLERGEN_LABELS_ES
from app.schemas.engine import ProductCandidate, Profile

_DIET_LABELS_ES = {
    "vegan": "vegana",
    "vegetarian": "vegetariana",
    "gluten_free": "sin gluten",
    "lactose_free": "sin lactosa",
}


def _allergen_reason(product: ProductCandidate, allergen: str) -> str | None:
    """Motivo si el producto contiene el alérgeno o declara trazas de él.

    Las trazas también excluyen: para una persona alérgica o celíaca "puede contener" es un
    riesgo real, y el motor no puede saber cuánto riesgo acepta cada una.
    """
    label = ALLERGEN_LABELS_ES.get(allergen, allergen)
    if allergen in product.allergens:
        return f"Contiene {label}"
    if allergen in product.traces:
        return f"Puede contener trazas de {label}"
    return None


def exclusion_reasons(product: ProductCandidate, profile: Profile) -> list[str]:
    """Motivos por los que el producto no debe recomendarse a este perfil (vacío = elegible)."""
    reasons: list[str] = []

    for allergen in profile.excluded_allergens:
        reason = _allergen_reason(product, allergen)
        if reason:
            reasons.append(reason)

    for diet in profile.diets:
        if diet == "gluten_free":
            reason = _allergen_reason(product, "gluten")
            if reason and reason not in reasons:
                reasons.append(reason)
        elif diet == "lactose_free" and product.diets.lactose_free is False:
            reasons.append("Contiene lactosa")
        elif diet in ("vegan", "vegetarian") and getattr(product.diets, diet) is False:
            reasons.append(f"No es apto para dieta {_DIET_LABELS_ES[diet]}")

    if profile.avoid_high_in and product.high_in_seals:
        labels = ", ".join(SEAL_LABELS_ES[seal] for seal in product.high_in_seals)
        reasons.append(f"Tiene sellos ALTO EN: {labels}")

    return reasons


def unverified_diets(product: ProductCandidate, profile: Profile) -> list[str]:
    """Dietas declaradas cuya aptitud la fuente no confirma ni descarta (dato desconocido)."""
    return [diet for diet in profile.diets if getattr(product.diets, diet) is None]


def diet_warnings(product: ProductCandidate, profile: Profile) -> list[str]:
    """Advertencias cuando la aptitud para una dieta no pudo verificarse."""
    return [
        f"Aptitud {_DIET_LABELS_ES[diet]} no verificada"
        for diet in unverified_diets(product, profile)
    ]
