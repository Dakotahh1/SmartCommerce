"""Aprendizaje de preferencias a partir del comportamiento.

Calcula afinidades por categoría y marca, y un ajuste acotado de los pesos explícitos.
"""

import math
from collections.abc import Sequence
from dataclasses import dataclass

from app.engine.criteria import CRITERIA, CRITERION_LABELS_ES, PriceContext, evaluate
from app.schemas.engine import HistoryEvent, Weights

# Intensidad de cada interacción: positiva si el usuario acercó el producto (favorito, aceptar)
# y negativa si lo alejó (descartar, rechazar). Una vista pesa poco porque puede ser casual.
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
# A los 14 días una interacción vale la mitad: los gustos recientes mandan sobre los antiguos.
HALF_LIFE_DAYS = 14.0
# Cuánto mueve los pesos una interacción de intensidad 1 sobre un criterio muy destacado.
LEARNING_RATE = 8.0
# Tope duro del ajuste por criterio (en puntos de peso): lo declarado por el usuario siempre
# pesa más que lo inferido, y el ajuste es explicable ("nutrición +15"), nunca una caja negra.
MAX_ADJUSTMENT = 15.0
# Escala del tanh que satura la afinidad: con ~3 puntos de señal acumulada se llega a ~0,9.
AFFINITY_SCALE = 3.0
# Con un solo criterio conocido no hay con qué comparar: el producto no enseña nada.
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
        # Lo que enseña un producto no es cuán bueno es, sino en qué DESTACA respecto de sí
        # mismo: cada criterio se compara con el promedio del propio producto. Así uno bueno en
        # todo no mueve ningún peso, y marcar como favorito uno con Nutri-Score A pero caro sube
        # nutrición y baja precio, que es la preferencia que ese gesto revela.
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
