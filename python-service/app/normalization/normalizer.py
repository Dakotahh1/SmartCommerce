"""Transforma registros crudos de Open Food Facts en productos normalizados y trazables."""

import hashlib
import json
import re
import time
import unicodedata
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Any, Literal

from app.normalization.gtin import InvalidGtinError, canonicalize_gtin
from app.normalization.quantity import parse_quantity
from app.normalization.seals import compute_high_in_seals
from app.normalization.tags import BEVERAGE_CATEGORIES, normalize_allergens, normalize_tags
from app.schemas.product import (
    DietFlags,
    NormalizationReport,
    NormalizedProduct,
    Nutriments,
    Rejection,
    SourceInfo,
)

Grade = Literal["a", "b", "c", "d", "e"]

_WHITESPACE = re.compile(r"\s+")
_ALLOWED_IMAGE_PREFIX = "https://images.openfoodfacts.org/"
_GRADES = {"a", "b", "c", "d", "e"}

# Rangos físicamente posibles por 100 g/ml.
_NUTRIENT_LIMITS: dict[str, float] = {
    "energy_kcal": 900.0,
    "sugars": 100.0,
    "saturated_fat": 100.0,
    "salt": 100.0,
    "proteins": 100.0,
    "fiber": 100.0,
    "sodium_mg": 40_000.0,
}

_QUALITY_WEIGHTS: dict[str, float] = {
    "brand": 0.10,
    "category": 0.10,
    "quantity": 0.10,
    "nutriscore": 0.15,
    "nova": 0.15,
    "nutriments": 0.15,
    "allergens_declared": 0.05,
    "image": 0.05,
    "stores": 0.05,
    "name": 0.10,
}


class RejectedProductError(ValueError):
    """El registro no cumple los requisitos mínimos para incorporarse al catálogo."""


@dataclass(frozen=True)
class NormalizationResult:
    products: list[NormalizedProduct]
    report: NormalizationReport


@dataclass
class _Candidate:
    index: int
    product: NormalizedProduct
    last_modified: float = field(default=0.0)


def _clean_text(value: object, max_length: int) -> str | None:
    if not isinstance(value, str):
        return None
    text = "".join(ch for ch in value if unicodedata.category(ch)[0] != "C")
    text = _WHITESPACE.sub(" ", text).strip()
    return text[:max_length] or None


def _grade(value: object) -> Grade | None:
    text = str(value or "").strip().lower()
    return text if text in _GRADES else None  # type: ignore[return-value]


def _nova(value: object) -> int | None:
    try:
        group = int(str(value))
    except (TypeError, ValueError):
        return None
    return group if 1 <= group <= 4 else None


def _number(value: object) -> float | None:
    if isinstance(value, bool) or value is None:
        return None
    try:
        return float(str(value).replace(",", "."))
    except ValueError:
        return None


def raw_hash(raw: Mapping[str, Any]) -> str:
    """SHA-256 del registro crudo canónico: permite detectar cambios entre ingestas."""
    canonical = json.dumps(
        raw, sort_keys=True, separators=(",", ":"), ensure_ascii=False, default=str
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _extract_nutriments(raw: Mapping[str, Any], warnings: list[str]) -> Nutriments:
    source = raw.get("nutriments")
    data: Mapping[str, Any] = source if isinstance(source, Mapping) else {}

    energy_kcal = _number(data.get("energy-kcal_100g"))
    if energy_kcal is None:
        energy_kj = _number(data.get("energy_100g"))
        energy_kcal = round(energy_kj / 4.184, 1) if energy_kj is not None else None

    sodium_g = _number(data.get("sodium_100g"))
    salt = _number(data.get("salt_100g"))
    sodium_mg = sodium_g * 1000 if sodium_g is not None else None
    if sodium_mg is None and salt is not None:
        sodium_mg = salt / 2.5 * 1000

    values: dict[str, float | None] = {
        "energy_kcal": energy_kcal,
        "sugars": _number(data.get("sugars_100g")),
        "saturated_fat": _number(data.get("saturated-fat_100g")),
        "sodium_mg": round(sodium_mg, 1) if sodium_mg is not None else None,
        "salt": salt,
        "proteins": _number(data.get("proteins_100g")),
        "fiber": _number(data.get("fiber_100g")),
    }
    for key, value in list(values.items()):
        if value is not None and not 0 <= value <= _NUTRIENT_LIMITS[key]:
            warnings.append(f"{key} fuera de rango ({value}); se descarta el valor")
            values[key] = None
    return Nutriments.model_validate(values)


def _diets(analysis: list[str], labels: list[str], allergens: list[str]) -> DietFlags:
    def status(positive: str, negative: str) -> bool | None:
        if positive in analysis or positive in labels:
            return True
        if negative in analysis:
            return False
        return None

    gluten_free: bool | None = None
    if "gluten" in allergens:
        gluten_free = False
    elif {"gluten-free", "no-gluten"} & set(labels):
        gluten_free = True

    lactose_free: bool | None = None
    if {"lactose-free", "no-lactose"} & set(labels):
        lactose_free = True
    elif "milk" in allergens:
        lactose_free = False

    return DietFlags(
        vegan=status("vegan", "non-vegan"),
        vegetarian=status("vegetarian", "non-vegetarian"),
        gluten_free=gluten_free,
        lactose_free=lactose_free,
    )


def _quality_score(
    raw: Mapping[str, Any], product: NormalizedProduct, completeness: float
) -> float:
    present = {
        "name": True,
        "brand": product.brand is not None,
        "category": product.main_category is not None,
        "quantity": product.net_quantity is not None,
        "nutriscore": product.nutriscore_grade is not None,
        "nova": product.nova_group is not None,
        "nutriments": product.nutriments.complete_for_seals,
        "allergens_declared": "allergens_tags" in raw,
        "image": product.image_url is not None,
        "stores": bool(product.stores),
    }
    own = sum(weight for key, weight in _QUALITY_WEIGHTS.items() if present[key])
    return round(min(1.0, 0.8 * own + 0.2 * completeness), 3)


def normalize_product(raw: Mapping[str, Any], *, fetched_at: datetime) -> NormalizedProduct:
    """Normaliza un registro crudo. Lanza `RejectedProductError` si no es utilizable."""
    try:
        gtin = canonicalize_gtin(raw.get("code"))
    except InvalidGtinError as exc:
        raise RejectedProductError(str(exc)) from exc

    name = next(
        (
            cleaned
            for key in ("product_name_es", "product_name", "generic_name_es", "generic_name")
            if (cleaned := _clean_text(raw.get(key), 255))
        ),
        None,
    )
    if name is None:
        raise RejectedProductError("Producto sin nombre")

    warnings: list[str] = []
    brands = _clean_text(raw.get("brands"), 500)
    brand = _clean_text(brands.split(",")[0], 120) if brands else None

    categories = normalize_tags(raw.get("categories_tags"))
    quantity_text = _clean_text(raw.get("quantity"), 80)
    net_quantity, unit = parse_quantity(
        quantity_text, raw.get("product_quantity"), raw.get("product_quantity_unit")
    )
    is_beverage = unit == "ml" or bool(BEVERAGE_CATEGORIES & set(categories))

    labels = normalize_tags(raw.get("labels_tags"), limit=80)
    allergens = normalize_allergens(raw.get("allergens_tags"))
    nutriments = _extract_nutriments(raw, warnings)

    image = raw.get("image_front_url")
    image_url = (
        image if isinstance(image, str) and image.startswith(_ALLOWED_IMAGE_PREFIX) else None
    )

    completeness = _number(raw.get("completeness")) or 0.0
    completeness = min(1.0, max(0.0, completeness))

    last_modified_t = _number(raw.get("last_modified_t"))
    last_modified_at = (
        datetime.fromtimestamp(last_modified_t, UTC)
        if last_modified_t and last_modified_t > 0
        else None
    )

    product = NormalizedProduct(
        gtin=gtin,
        name=name,
        brand=brand,
        categories=categories,
        main_category=categories[-1] if categories else None,
        quantity_text=quantity_text,
        net_quantity=net_quantity,
        unit=unit,
        is_beverage=is_beverage,
        image_url=image_url,
        nutriscore_grade=_grade(raw.get("nutriscore_grade")),
        nova_group=_nova(raw.get("nova_group")),
        ecoscore_grade=_grade(raw.get("ecoscore_grade")),
        nutriments=nutriments,
        high_in_seals=compute_high_in_seals(nutriments, is_beverage),
        allergens=allergens,
        traces=normalize_allergens(raw.get("traces_tags")),
        labels=labels,
        diets=_diets(normalize_tags(raw.get("ingredients_analysis_tags")), labels, allergens),
        stores=normalize_tags(raw.get("stores_tags")),
        countries=normalize_tags(raw.get("countries_tags")),
        completeness=round(completeness, 3),
        data_quality_score=0.0,
        warnings=warnings,
        source=SourceInfo(
            url=f"https://world.openfoodfacts.org/product/{gtin}",
            last_modified_at=last_modified_at,
            fetched_at=fetched_at,
        ),
        raw_hash=raw_hash(raw),
    )
    product.data_quality_score = _quality_score(raw, product, completeness)
    return product


def _coverage(products: Sequence[NormalizedProduct]) -> dict[str, float]:
    if not products:
        return {}
    checks: dict[str, Callable[[NormalizedProduct], bool]] = {
        "brand": lambda p: p.brand is not None,
        "category": lambda p: p.main_category is not None,
        "quantity": lambda p: p.net_quantity is not None,
        "nutriscore": lambda p: p.nutriscore_grade is not None,
        "nova": lambda p: p.nova_group is not None,
        "ecoscore": lambda p: p.ecoscore_grade is not None,
        "nutriments": lambda p: p.nutriments.complete_for_seals,
        "stores": lambda p: bool(p.stores),
        "image": lambda p: p.image_url is not None,
    }
    total = len(products)
    return {
        key: round(sum(1 for p in products if check(p)) / total, 3) for key, check in checks.items()
    }


def normalize_batch(
    raws: Sequence[object], *, fetched_at: datetime | None = None
) -> NormalizationResult:
    """Normaliza, valida y deduplica un lote, devolviendo métricas de calidad."""
    started = time.perf_counter()
    fetched = fetched_at or datetime.now(UTC)
    rejections: list[Rejection] = []
    best_by_gtin: dict[str, _Candidate] = {}
    duplicates = 0

    for index, raw in enumerate(raws):
        if not isinstance(raw, Mapping):
            rejections.append(Rejection(index=index, reason="Registro con formato inválido"))
            continue
        try:
            product = normalize_product(raw, fetched_at=fetched)
        except RejectedProductError as exc:
            code = raw.get("code")
            rejections.append(
                Rejection(index=index, code=str(code)[:32] if code else None, reason=str(exc))
            )
            continue

        candidate = _Candidate(index, product, _number(raw.get("last_modified_t")) or 0.0)
        current = best_by_gtin.get(product.gtin)
        if current is None:
            best_by_gtin[product.gtin] = candidate
            continue
        duplicates += 1
        if (product.completeness, candidate.last_modified) > (
            current.product.completeness,
            current.last_modified,
        ):
            best_by_gtin[product.gtin] = candidate

    products = [c.product for c in sorted(best_by_gtin.values(), key=lambda c: c.index)]
    received = len(raws)
    report = NormalizationReport(
        received=received,
        valid=len(products),
        rejected=len(rejections),
        duplicates=duplicates,
        warnings=sum(len(p.warnings) for p in products),
        valid_ratio=round((received - len(rejections)) / received, 3) if received else 0.0,
        duplicate_ratio=round(duplicates / received, 3) if received else 0.0,
        field_coverage=_coverage(products),
        rejections=rejections,
        took_ms=round((time.perf_counter() - started) * 1000, 2),
    )
    return NormalizationResult(products=products, report=report)
