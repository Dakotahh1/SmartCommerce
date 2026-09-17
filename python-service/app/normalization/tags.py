"""Normalización de etiquetas multilingües de Open Food Facts a un vocabulario controlado."""

import re
from collections.abc import Iterable

_LANG_PREFIX = re.compile(r"^[a-z]{2}:")
_SLUG_INVALID = re.compile(r"[^a-z0-9-]+")

# Alérgenos de declaración obligatoria (vocabulario UE usado por Open Food Facts).
ALLERGEN_MAP: dict[str, str] = {
    "gluten": "gluten",
    "milk": "milk",
    "eggs": "eggs",
    "nuts": "tree_nuts",
    "peanuts": "peanuts",
    "soybeans": "soy",
    "fish": "fish",
    "crustaceans": "crustaceans",
    "celery": "celery",
    "mustard": "mustard",
    "sesame-seeds": "sesame",
    "sulphur-dioxide-and-sulphites": "sulphites",
    "lupin": "lupin",
    "molluscs": "molluscs",
}

ALLERGEN_LABELS_ES: dict[str, str] = {
    "gluten": "gluten",
    "milk": "leche",
    "eggs": "huevo",
    "tree_nuts": "frutos secos",
    "peanuts": "maní",
    "soy": "soya",
    "fish": "pescado",
    "crustaceans": "crustáceos",
    "celery": "apio",
    "mustard": "mostaza",
    "sesame": "sésamo",
    "sulphites": "sulfitos",
    "lupin": "lupino",
    "molluscs": "moluscos",
}

BEVERAGE_CATEGORIES = frozenset(
    {
        "beverages",
        "plant-based-beverages",
        "dairy-drinks",
        "milks",
        "juices",
        "fruit-juices",
        "waters",
        "sodas",
        "carbonated-drinks",
        "soft-drinks",
    }
)


def strip_language(tag: str) -> str:
    """`en:breakfast-cereals` → `breakfast-cereals`."""
    return _LANG_PREFIX.sub("", tag.strip().lower())


def normalize_tags(tags: object, limit: int = 60) -> list[str]:
    """Quita prefijos de idioma, limpia caracteres y elimina duplicados conservando el orden."""
    if not isinstance(tags, Iterable) or isinstance(tags, (str, bytes)):
        return []
    result: list[str] = []
    seen: set[str] = set()
    for tag in tags:
        if not isinstance(tag, str):
            continue
        slug = _SLUG_INVALID.sub("-", strip_language(tag)).strip("-")[:80]
        if slug and slug not in seen:
            seen.add(slug)
            result.append(slug)
        if len(result) >= limit:
            break
    return result


def normalize_allergens(tags: object) -> list[str]:
    """Mapea etiquetas de alérgenos al vocabulario controlado (ignora las desconocidas)."""
    codes = {ALLERGEN_MAP[tag] for tag in normalize_tags(tags) if tag in ALLERGEN_MAP}
    return sorted(codes)
