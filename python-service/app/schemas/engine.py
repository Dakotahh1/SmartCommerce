"""Contratos del motor SmartMatch: ranking, comparación y aprendizaje de perfil."""

from typing import Literal

from pydantic import Field

from app.schemas.common import CamelModel
from app.schemas.product import DietFlags, Grade, Gtin, Nutriments, SealCode

Criterion = Literal["nutrition", "price", "processing", "environment", "availability"]
Strategy = Literal["personalized", "baseline"]
Diet = Literal["vegan", "vegetarian", "gluten_free", "lactose_free"]
Allergen = Literal[
    "gluten",
    "milk",
    "eggs",
    "tree_nuts",
    "peanuts",
    "soy",
    "fish",
    "crustaceans",
    "celery",
    "mustard",
    "sesame",
    "sulphites",
    "lupin",
    "molluscs",
]
InteractionType = Literal[
    "view",
    "favorite",
    "unfavorite",
    "compare",
    "dismiss",
    "recommendation_click",
    "recommendation_accept",
    "recommendation_reject",
]

Weight = float


class Weights(CamelModel):
    """Importancia de cada criterio (0 a 100). No necesitan sumar 100: se normalizan."""

    nutrition: Weight = Field(default=30, ge=0, le=100)
    price: Weight = Field(default=25, ge=0, le=100)
    processing: Weight = Field(default=20, ge=0, le=100)
    environment: Weight = Field(default=15, ge=0, le=100)
    availability: Weight = Field(default=10, ge=0, le=100)

    def as_dict(self) -> dict[str, float]:
        return {
            "nutrition": self.nutrition,
            "price": self.price,
            "processing": self.processing,
            "environment": self.environment,
            "availability": self.availability,
        }


class Profile(CamelModel):
    weights: Weights = Field(default_factory=Weights)
    diets: list[Diet] = Field(default_factory=list, max_length=4)
    excluded_allergens: list[Allergen] = Field(default_factory=list, max_length=14)
    avoid_high_in: bool = False
    preferred_stores: list[str] = Field(default_factory=list, max_length=20)


class ProductCandidate(CamelModel):
    """Datos mínimos de un producto para evaluarlo (proporcionados por NestJS desde PostgreSQL)."""

    id: str | None = Field(default=None, max_length=64)
    gtin: Gtin
    name: str = Field(min_length=1, max_length=255)
    brand: str | None = Field(default=None, max_length=120)
    main_category: str | None = Field(default=None, max_length=120)
    nutriscore_grade: Grade | None = None
    nova_group: int | None = Field(default=None, ge=1, le=4)
    ecoscore_grade: Grade | None = None
    nutriments: Nutriments | None = None
    high_in_seals: list[SealCode] = Field(default_factory=list)
    allergens: list[str] = Field(default_factory=list, max_length=30)
    labels: list[str] = Field(default_factory=list, max_length=80)
    diets: DietFlags = Field(default_factory=DietFlags)
    stores: list[str] = Field(default_factory=list, max_length=60)
    unit_price: float | None = Field(default=None, gt=0, description="Precio por kg o litro")
    price_unit: Literal["kg", "l"] | None = None
    data_quality_score: float = Field(default=0.5, ge=0, le=1)


class HistoryEvent(CamelModel):
    type: InteractionType
    age_days: float = Field(ge=0, le=3650)
    product: ProductCandidate


class RankRequest(CamelModel):
    strategy: Strategy = "personalized"
    profile: Profile | None = None
    history: list[HistoryEvent] = Field(default_factory=list, max_length=500)
    candidates: list[ProductCandidate] = Field(min_length=1, max_length=1000)
    limit: int = Field(default=10, ge=1, le=50)
    diversify: bool = True


class CriterionScore(CamelModel):
    criterion: Criterion
    label: str
    value: float | None
    weight: float
    contribution: float


class RankedItem(CamelModel):
    product_id: str | None
    gtin: str
    rank: int
    score: float
    coverage: float
    breakdown: list[CriterionScore]
    reasons: list[str]
    warnings: list[str]


class ExcludedItem(CamelModel):
    product_id: str | None
    gtin: str
    reasons: list[str]


class RankStats(CamelModel):
    candidates: int
    excluded: int
    ranked: int
    took_ms: float


class RankResponse(CamelModel):
    engine_version: str
    strategy: Strategy
    weights_used: dict[str, float]
    learned_adjustments: dict[str, float]
    items: list[RankedItem]
    excluded: list[ExcludedItem]
    stats: RankStats


class CompareRequest(CamelModel):
    strategy: Strategy = "personalized"
    profile: Profile | None = None
    history: list[HistoryEvent] = Field(default_factory=list, max_length=500)
    products: list[ProductCandidate] = Field(min_length=2, max_length=4)


class ComparedItem(RankedItem):
    name: str
    eligible: bool
    exclusion_reasons: list[str]


class CompareResponse(CamelModel):
    engine_version: str
    strategy: Strategy
    weights_used: dict[str, float]
    items: list[ComparedItem]
    winner_gtin: str | None
    criteria_winners: dict[str, list[str]]
    summary: str


class LearnRequest(CamelModel):
    weights: Weights = Field(default_factory=Weights)
    history: list[HistoryEvent] = Field(default_factory=list, max_length=500)


class LearnResponse(CamelModel):
    engine_version: str
    explicit_weights: dict[str, float]
    effective_weights: dict[str, float]
    adjustments: dict[str, float]
    category_affinity: dict[str, float]
    brand_affinity: dict[str, float]
    events_used: int
    explanations: list[str]
