"""Ranking SmartMatch: filtros → puntuación multicriterio → afinidad → diversificación."""

import time
from collections.abc import Sequence
from dataclasses import dataclass, field

from app.engine import ENGINE_VERSION
from app.engine.criteria import (
    CRITERIA,
    CRITERION_LABELS_ES,
    PriceContext,
    build_price_context,
    evaluate,
)
from app.engine.explain import build_reasons, build_warnings
from app.engine.filters import diet_warnings, exclusion_reasons
from app.engine.learning import LearnedProfile, brand_key, learn_profile
from app.schemas.engine import (
    CriterionScore,
    ExcludedItem,
    HistoryEvent,
    ProductCandidate,
    Profile,
    RankedItem,
    RankRequest,
    RankResponse,
    RankStats,
)

BASELINE_WEIGHTS: dict[str, float] = {
    "nutrition": 40.0,
    "price": 0.0,
    "processing": 30.0,
    "environment": 20.0,
    "availability": 10.0,
}
CONFIDENCE_FLOOR = 0.7
AFFINITY_IMPACT = 0.1
CATEGORY_AFFINITY_SHARE = 0.6
DIVERSITY_DECAY = 0.95


@dataclass
class ScoredProduct:
    candidate: ProductCandidate
    score: float
    coverage: float
    breakdown: list[CriterionScore]
    reasons: list[str] = field(default_factory=list)
    warnings: list[str] = field(default_factory=list)

    def sort_key(self, score: float | None = None) -> tuple[float, float, str]:
        return (
            -(self.score if score is None else score),
            -self.candidate.data_quality_score,
            self.candidate.gtin,
        )


@dataclass(frozen=True)
class EngineContext:
    """Todo lo que el motor necesita para puntuar productos de forma coherente."""

    personalized: bool
    profile: Profile
    weights: dict[str, float]
    price_context: PriceContext
    learned: LearnedProfile | None

    def affinity_for(self, product: ProductCandidate) -> float:
        if self.learned is None:
            return 0.0
        category = self.learned.category_affinity.get(product.main_category or "", 0.0)
        brand = self.learned.brand_affinity.get(brand_key(product.brand) or "", 0.0)
        return CATEGORY_AFFINITY_SHARE * category + (1 - CATEGORY_AFFINITY_SHARE) * brand


def build_context(
    strategy: str,
    profile: Profile | None,
    history: Sequence[HistoryEvent],
    products: Sequence[ProductCandidate],
) -> EngineContext:
    """Prepara pesos efectivos, contexto de precios y aprendizaje según la estrategia."""
    price_context = build_price_context([*products, *(event.product for event in history)])
    if strategy == "personalized" and profile is not None:
        learned = learn_profile(profile.weights, history, price_context)
        return EngineContext(True, profile, learned.effective_weights, price_context, learned)
    return EngineContext(False, Profile(), dict(BASELINE_WEIGHTS), price_context, None)


def score_product(product: ProductCandidate, ctx: EngineContext) -> ScoredProduct:
    preferred = ctx.profile.preferred_stores if ctx.personalized else []
    values = evaluate(product, ctx.price_context, preferred)
    weights = ctx.weights
    total_weight = sum(weights[c] for c in CRITERIA)
    available = [c for c in CRITERIA if values[c] is not None and weights[c] > 0]
    available_weight = sum(weights[c] for c in available)

    coverage = available_weight / total_weight if total_weight > 0 else 0.0
    confidence = CONFIDENCE_FLOOR + (1 - CONFIDENCE_FLOOR) * coverage
    base = (
        sum(weights[c] * (values[c] or 0.0) for c in available) / available_weight
        if available_weight
        else 0.0
    )
    affinity = ctx.affinity_for(product) if ctx.personalized else 0.0
    raw_score = base * confidence * (1 + AFFINITY_IMPACT * affinity)
    score = round(100 * min(1.0, max(0.0, raw_score)), 1)

    contributions: dict[str, float] = {}
    breakdown: list[CriterionScore] = []
    for criterion in CRITERIA:
        value = values[criterion]
        contribution = (
            round(100 * confidence * weights[criterion] * value / available_weight, 1)
            if value is not None and criterion in available
            else 0.0
        )
        contributions[criterion] = contribution
        breakdown.append(
            CriterionScore(
                criterion=criterion,  # type: ignore[arg-type]
                label=CRITERION_LABELS_ES[criterion],
                value=round(value, 3) if value is not None else None,
                weight=round(weights[criterion] / total_weight, 3) if total_weight else 0.0,
                contribution=contribution,
            )
        )

    reasons = build_reasons(
        product,
        values=values,
        contributions=contributions,
        context=ctx.price_context,
        preferred_stores=preferred,
        affinity=affinity,
    )
    warnings = build_warnings(product, values, weights)
    if ctx.personalized:
        warnings.extend(diet_warnings(product, ctx.profile))
    return ScoredProduct(product, score, round(coverage, 3), breakdown, reasons, warnings)


def _diversity_key(item: ScoredProduct) -> str:
    return brand_key(item.candidate.brand) or item.candidate.gtin


def diversify(scored: Sequence[ScoredProduct], limit: int) -> list[ScoredProduct]:
    """Selección voraz que penaliza repetir la misma marca (reduce la burbuja de filtro)."""
    remaining = sorted(scored, key=lambda s: s.sort_key())
    selected: list[ScoredProduct] = []
    brand_counts: dict[str, int] = {}
    while remaining and len(selected) < limit:
        best = min(
            remaining,
            key=lambda s: s.sort_key(
                s.score * DIVERSITY_DECAY ** brand_counts.get(_diversity_key(s), 0)
            ),
        )
        remaining.remove(best)
        selected.append(best)
        brand_counts[_diversity_key(best)] = brand_counts.get(_diversity_key(best), 0) + 1
    return selected


def rank(request: RankRequest) -> RankResponse:
    started = time.perf_counter()
    ctx = build_context(request.strategy, request.profile, request.history, request.candidates)

    scored: list[ScoredProduct] = []
    excluded: list[ExcludedItem] = []
    for candidate in request.candidates:
        reasons = exclusion_reasons(candidate, ctx.profile) if ctx.personalized else []
        if reasons:
            excluded.append(
                ExcludedItem(product_id=candidate.id, gtin=candidate.gtin, reasons=reasons)
            )
            continue
        scored.append(score_product(candidate, ctx))

    if request.diversify:
        ordered = diversify(scored, request.limit)
    else:
        ordered = sorted(scored, key=lambda s: s.sort_key())[: request.limit]

    items = [
        RankedItem(
            product_id=s.candidate.id,
            gtin=s.candidate.gtin,
            rank=position,
            score=s.score,
            coverage=s.coverage,
            breakdown=s.breakdown,
            reasons=s.reasons,
            warnings=s.warnings,
        )
        for position, s in enumerate(ordered, start=1)
    ]
    learned = ctx.learned
    return RankResponse(
        engine_version=ENGINE_VERSION,
        strategy="personalized" if ctx.personalized else "baseline",
        weights_used=ctx.weights,
        learned_adjustments=learned.adjustments if learned else dict.fromkeys(CRITERIA, 0.0),
        items=items,
        excluded=excluded,
        stats=RankStats(
            candidates=len(request.candidates),
            excluded=len(excluded),
            ranked=len(items),
            took_ms=round((time.perf_counter() - started) * 1000, 2),
        ),
    )
