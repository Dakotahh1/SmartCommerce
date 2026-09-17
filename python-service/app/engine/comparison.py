"""Comparación de 2 a 4 productos con ganador personalizado y explicación."""

from app.engine import ENGINE_VERSION
from app.engine.criteria import CRITERIA, CRITERION_LABELS_ES
from app.engine.filters import exclusion_reasons
from app.engine.ranking import ScoredProduct, build_context, score_product
from app.schemas.engine import ComparedItem, CompareRequest, CompareResponse

_EPSILON = 1e-9


def _criteria_winners(scored: list[tuple[ScoredProduct, bool]]) -> dict[str, list[str]]:
    winners: dict[str, list[str]] = {}
    eligible = [s for s, ok in scored if ok]
    for criterion in CRITERIA:
        values = [
            (s.candidate.gtin, detail.value)
            for s in eligible
            for detail in s.breakdown
            if detail.criterion == criterion and detail.value is not None and detail.weight > 0
        ]
        if len(values) < 2:
            continue
        best = max(value for _, value in values)
        winners[criterion] = [gtin for gtin, value in values if abs(value - best) < _EPSILON]
    return winners


def _summary(
    ranked: list[tuple[ScoredProduct, bool]], winners: dict[str, list[str]]
) -> tuple[str | None, str]:
    eligible = [s for s, ok in ranked if ok]
    if not eligible:
        return None, "Ningún producto cumple tus restricciones de dieta, alérgenos o sellos."
    top = eligible[0]
    won = [CRITERION_LABELS_ES[c] for c, gtins in winners.items() if top.candidate.gtin in gtins]
    text = f"{top.candidate.name} es la mejor opción para ti ({top.score:.0f}/100)"
    text += f": destaca en {', '.join(won).lower()}." if won else "."
    for other in eligible[1:]:
        better = [
            CRITERION_LABELS_ES[c]
            for c, gtins in winners.items()
            if other.candidate.gtin in gtins and top.candidate.gtin not in gtins
        ]
        if better:
            text += f" {other.candidate.name} es mejor en {', '.join(better).lower()}."
            break
    return top.candidate.gtin, text


def compare(request: CompareRequest) -> CompareResponse:
    ctx = build_context(request.strategy, request.profile, request.history, request.products)
    evaluated: list[tuple[ScoredProduct, bool, list[str]]] = []
    for product in request.products:
        reasons = exclusion_reasons(product, ctx.profile) if ctx.personalized else []
        evaluated.append((score_product(product, ctx), not reasons, reasons))

    evaluated.sort(key=lambda item: (not item[1], *item[0].sort_key()))
    pairs = [(scored, ok) for scored, ok, _ in evaluated]
    winners = _criteria_winners(pairs)
    winner_gtin, summary = _summary(pairs, winners)

    items = [
        ComparedItem(
            product_id=scored.candidate.id,
            gtin=scored.candidate.gtin,
            name=scored.candidate.name,
            rank=position,
            score=scored.score,
            coverage=scored.coverage,
            breakdown=scored.breakdown,
            reasons=scored.reasons,
            warnings=scored.warnings,
            eligible=ok,
            exclusion_reasons=reasons,
        )
        for position, (scored, ok, reasons) in enumerate(evaluated, start=1)
    ]
    return CompareResponse(
        engine_version=ENGINE_VERSION,
        strategy="personalized" if ctx.personalized else "baseline",
        weights_used=ctx.weights,
        items=items,
        winner_gtin=winner_gtin,
        criteria_winners=winners,
        summary=summary,
    )
