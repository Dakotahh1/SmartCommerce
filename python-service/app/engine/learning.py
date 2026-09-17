"""Aprendizaje de preferencias a partir del comportamiento.

Calcula afinidades por categoría y marca, y un ajuste acotado de los pesos explícitos.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from app.engine.criteria import CRITERIA, CRITERION_LABELS_ES, PriceContext, evaluate
from app.schemas.engine import HistoryEvent, Weights

SIGNALS: dict[str, float] = {
    "favorite": 1.0,
    "recommendation_accept": 0.8,
    "compare": 0.3,
    "recommendation_click": 0.2,
    "view": 0.1,
    "unfavorite": -0.5,
    "dismiss": -0.8,
    "recommendation_reject": -1.0,
}
HALF_LIFE_DAYS = 14.0
LEARNING_RATE = 8.0
MAX_ADJUSTMENT = 15.0
AFFINITY_SCALE = 3.0
MIN_CRITERIA_FOR_LEARNING = 2


@dataclass(frozen=True)
class LearnedProfile:
    explicit_weights: dict[str, float]
    effective_weights: dict[str, float]
    adjustments: dict[str, float]
    category_affinity: dict[str, float]
    brand_affinity: dict[str, float]
    events_used: int

    def explanations(self) -> list[str]:
        lines = []
        for criterion, delta in sorted(self.adjustments.items(), key=lambda kv: -abs(kv[1])):
            if abs(delta) < 1.0:
                continue
            label = CRITERION_LABELS_ES[criterion]
            if delta > 0:
                lines.append(
                    f"{label} +{delta:.0f}: interactuaste positivamente con productos "
                    "que destacan en este criterio"
                )
            else:
                lines.append(
                    f"{label} {delta:.0f}: este criterio pesó menos en tus elecciones recientes"
                )
        return lines


def decay(age_days: float) -> float:
    """Peso temporal con vida media de 14 días."""
    return float(0.5 ** (age_days / HALF_LIFE_DAYS))


def brand_key(brand: str | None) -> str | None:
    return brand.strip().lower() if brand else None


def learn_profile(
    weights: Weights, history: Sequence[HistoryEvent], context: PriceContext
) -> LearnedProfile:
    explicit = weights.as_dict()
    raw_adjustments = dict.fromkeys(CRITERIA, 0.0)
    category_totals: dict[str, float] = {}
    brand_totals: dict[str, float] = {}
    used = 0

    for event in history:
        signal = SIGNALS.get(event.type, 0.0)
        if signal == 0.0:
            continue
        strength = signal * decay(event.age_days)
        product = event.product
        used += 1

        if product.main_category:
            category_totals[product.main_category] = (
                category_totals.get(product.main_category, 0.0) + strength
            )
        key = brand_key(product.brand)
        if key:
            brand_totals[key] = brand_totals.get(key, 0.0) + strength

        values = {c: v for c, v in evaluate(product, context).items() if v is not None}
        if len(values) < MIN_CRITERIA_FOR_LEARNING:
            continue
        mean_value = sum(values.values()) / len(values)
        for criterion, value in values.items():
            raw_adjustments[criterion] += LEARNING_RATE * strength * (value - mean_value)

    adjustments = {
        c: round(max(-MAX_ADJUSTMENT, min(MAX_ADJUSTMENT, delta)), 2)
        for c, delta in raw_adjustments.items()
    }
    effective = {c: round(max(0.0, min(100.0, explicit[c] + adjustments[c])), 2) for c in CRITERIA}
    return LearnedProfile(
        explicit_weights=explicit,
        effective_weights=effective,
        adjustments=adjustments,
        category_affinity={
            k: round(math.tanh(v / AFFINITY_SCALE), 3) for k, v in category_totals.items()
        },
        brand_affinity={
            k: round(math.tanh(v / AFFINITY_SCALE), 3) for k, v in brand_totals.items()
        },
        events_used=used,
    )
