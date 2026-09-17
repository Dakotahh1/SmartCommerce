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


def exclusion_reasons(product: ProductCandidate, profile: Profile) -> list[str]:
    """Motivos por los que el producto no debe recomendarse a este perfil (vacío = elegible)."""
    reasons: list[str] = []
    allergens = set(product.allergens)

    for allergen in profile.excluded_allergens:
        if allergen in allergens:
            reasons.append(f"Contiene {ALLERGEN_LABELS_ES.get(allergen, allergen)}")

    for diet in profile.diets:
        if diet == "gluten_free" and "gluten" in allergens:
            if "Contiene gluten" not in reasons:
                reasons.append("Contiene gluten")
        elif diet == "lactose_free" and product.diets.lactose_free is False:
            reasons.append("Contiene lactosa")
        elif diet in ("vegan", "vegetarian") and getattr(product.diets, diet) is False:
            reasons.append(f"No es apto para dieta {_DIET_LABELS_ES[diet]}")

    if profile.avoid_high_in and product.high_in_seals:
        labels = ", ".join(SEAL_LABELS_ES[seal] for seal in product.high_in_seals)
        reasons.append(f"Tiene sellos ALTO EN: {labels}")

    return reasons


def diet_warnings(product: ProductCandidate, profile: Profile) -> list[str]:
    """Advertencias cuando la aptitud para una dieta no pudo verificarse."""
    warnings: list[str] = []
    for diet in profile.diets:
        if getattr(product.diets, diet) is None and not (
            diet == "gluten_free" and "gluten" in product.allergens
        ):
            warnings.append(f"Aptitud {_DIET_LABELS_ES[diet]} no verificada")
    return warnings
