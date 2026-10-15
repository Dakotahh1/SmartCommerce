"""Normalización y tokenización de texto para el índice de búsqueda del catálogo.

El backend (NestJS) aplica **exactamente** las mismas reglas a la consulta del usuario
(`backend/src/common/text-normalization.ts`); ambos lados se verifican con los mismos casos
(`tests/fixtures/text_normalization_cases.json`). Reglas, en orden:

1. Plegado: minúsculas, sin tildes ni diéresis (NFKD sin marcas combinantes), `ñ` → `n`.
2. Todo carácter que no sea `a-z0-9` separa tokens.
3. Se descartan palabras vacías del español y tokens de una letra.
4. Lematización ligera de plurales: `-es` tras l/r/n/d (`cereales` → `cereal`) o `-s` final.
5. Prefijo `multi` en palabras compuestas: `multisemillas` aporta también `semilla`.
"""

import re
import unicodedata
from collections.abc import Iterable

_NON_ALNUM = re.compile(r"[^a-z0-9]+")

STOPWORDS_ES = frozenset(
    {
        "a", "al", "con", "de", "del", "el", "en", "es", "la", "las", "lo", "los", "o",
        "para", "por", "su", "un", "una", "y", "the", "and", "of", "x",
    }
)  # fmt: skip

_PLURAL_ES_AFTER = frozenset("lrnd")

# Vocabulario controlado: categorías de Open Food Facts (inglés) → términos en español,
# para que una consulta como "cereal" o "lácteos" encuentre productos por su categoría.
CATEGORY_TERMS_ES: dict[str, str] = {
    "breakfast-cereals": "cereal desayuno",
    "cereals-and-potatoes": "cereal",
    "cereals-and-their-products": "cereal",
    "mueslis": "muesli",
    "granolas": "granola",
    "oat-flakes": "avena",
    "rolled-oats": "avena",
    "dairies": "lacteo",
    "milks": "leche",
    "yogurts": "yogur",
    "cheeses": "queso",
    "beverages": "bebida",
    "plant-based-beverages": "bebida vegetal",
    "juices": "jugo",
    "fruit-juices": "jugo fruta",
    "waters": "agua",
    "sodas": "bebida gaseosa",
    "snacks": "snack colacion",
    "sweet-snacks": "snack dulce",
    "salty-snacks": "snack salado",
    "biscuits-and-cakes": "galleta",
    "biscuits": "galleta",
    "chocolates": "chocolate",
    "cocoa-and-its-products": "chocolate cacao",
}


def fold(text: str) -> str:
    """Minúsculas y sin diacríticos; deja solo `a-z0-9` separados por un espacio."""
    decomposed = unicodedata.normalize("NFKD", text.lower())
    plain = "".join(ch for ch in decomposed if not unicodedata.combining(ch))
    return _NON_ALNUM.sub(" ", plain).strip()


def stem(token: str) -> str:
    """Reduce plurales regulares del español a singular."""
    if len(token) > 4 and token.endswith("es") and token[-3] in _PLURAL_ES_AFTER:
        return token[:-2]
    if len(token) > 3 and token.endswith("s") and not token.endswith("ss"):
        return token[:-1]
    return token


def tokenize(text: str | None) -> list[str]:
    """Tokens normalizados, en orden y sin repetir."""
    if not text:
        return []
    result: list[str] = []
    for raw in fold(text).split():
        if len(raw) < 2 or raw in STOPWORDS_ES:
            continue
        token = stem(raw)
        variants = [token]
        if token.startswith("multi") and len(token) > 8:
            variants.append(token[5:])
        for item in variants:
            if item not in result:
                result.append(item)
    return result


def _join(parts: Iterable[str | None], exclude: set[str] | None = None) -> str:
    seen: list[str] = []
    for part in parts:
        for token in tokenize(part):
            if token not in seen and (exclude is None or token not in exclude):
                seen.append(token)
    return " ".join(seen)


def build_search_fields(
    *,
    name: str,
    brand: str | None,
    generic_name: str | None,
    categories: list[str],
    labels: list[str],
) -> tuple[str, str]:
    """Campos del índice: primario (nombre y marca, peso A) y secundario (resto, peso B)."""
    primary = _join([name, brand])
    category_terms = [CATEGORY_TERMS_ES.get(slug) for slug in categories]
    category_words = [slug.replace("-", " ") for slug in categories]
    secondary = _join(
        [
            generic_name,
            *category_terms,
            *category_words,
            *(lbl.replace("-", " ") for lbl in labels),
        ],
        exclude=set(primary.split()),
    )
    return _truncate(primary, 500), _truncate(secondary, 1000)


def _truncate(text: str, limit: int) -> str:
    """Recorta sin partir un token."""
    if len(text) <= limit:
        return text
    return text[: limit + 1].rsplit(" ", 1)[0]
