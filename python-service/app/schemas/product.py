"""Producto normalizado y reporte de calidad de la normalización."""

from datetime import datetime
from typing import Annotated, Any, Literal

from pydantic import Field

from app.schemas.common import CamelModel

Grade = Literal["a", "b", "c", "d", "e"]
Unit = Literal["g", "ml"]
SealCode = Literal["calories", "sugars", "sodium", "saturated_fat"]
Gtin = Annotated[str, Field(pattern=r"^\d{8}$|^\d{13}$|^\d{14}$", examples=["7802000014130"])]


class Nutriments(CamelModel):
    """Nutrientes por 100 g (sólidos) o 100 ml (líquidos)."""

    energy_kcal: float | None = Field(default=None, ge=0, le=900)
    sugars: float | None = Field(default=None, ge=0, le=100)
    saturated_fat: float | None = Field(default=None, ge=0, le=100)
    sodium_mg: float | None = Field(default=None, ge=0, le=40_000)
    salt: float | None = Field(default=None, ge=0, le=100)
    proteins: float | None = Field(default=None, ge=0, le=100)
    fiber: float | None = Field(default=None, ge=0, le=100)

    @property
    def complete_for_seals(self) -> bool:
        """Hay datos suficientes para afirmar la ausencia de sellos "ALTO EN"."""
        return None not in (self.energy_kcal, self.sugars, self.saturated_fat, self.sodium_mg)


class DietFlags(CamelModel):
    """Aptitud para dietas: `True` verificado, `False` no apto, `None` desconocido."""

    vegan: bool | None = None
    vegetarian: bool | None = None
    gluten_free: bool | None = None
    lactose_free: bool | None = None


class SourceInfo(CamelModel):
    """Procedencia del registro."""

    code: Literal["openfoodfacts"] = "openfoodfacts"
    name: str = "Open Food Facts"
    url: str
    license: str = "ODbL-1.0"
    last_modified_at: datetime | None = None
    fetched_at: datetime


class NormalizedProduct(CamelModel):
    gtin: Gtin
    name: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=120)
    categories: list[str] = Field(default_factory=list, max_length=60)
    main_category: str | None = Field(default=None, max_length=120)
    quantity_text: str | None = Field(default=None, max_length=80)
    net_quantity: float | None = Field(default=None, gt=0)
    unit: Unit | None = None
    is_beverage: bool = False
    image_url: str | None = None
    nutriscore_grade: Grade | None = None
    nova_group: int | None = Field(default=None, ge=1, le=4)
    ecoscore_grade: Grade | None = None
    nutriments: Nutriments = Field(default_factory=Nutriments)
    high_in_seals: list[SealCode] = Field(default_factory=list)
    allergens: list[str] = Field(default_factory=list)
    traces: list[str] = Field(default_factory=list)
    labels: list[str] = Field(default_factory=list, max_length=80)
    diets: DietFlags = Field(default_factory=DietFlags)
    stores: list[str] = Field(default_factory=list, max_length=60)
    countries: list[str] = Field(default_factory=list, max_length=60)
    completeness: float = Field(ge=0, le=1)
    data_quality_score: float = Field(ge=0, le=1)
    warnings: list[str] = Field(default_factory=list)
    source: SourceInfo
    raw_hash: str = Field(pattern=r"^[0-9a-f]{64}$")


class Rejection(CamelModel):
    index: int
    code: str | None = None
    reason: str


class NormalizationReport(CamelModel):
    received: int
    valid: int
    rejected: int
    duplicates: int
    warnings: int
    valid_ratio: float = Field(ge=0, le=1)
    duplicate_ratio: float = Field(ge=0, le=1)
    field_coverage: dict[str, float]
    rejections: list[Rejection]
    took_ms: float


class NormalizeRequest(CamelModel):
    products: list[dict[str, Any]] = Field(min_length=1, max_length=500)


class NormalizeResponse(CamelModel):
    products: list[NormalizedProduct]
    report: NormalizationReport
