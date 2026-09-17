"""Endpoints del motor SmartMatch."""

from typing import Annotated

from fastapi import APIRouter, Depends

from app.config import Settings, get_settings
from app.engine import ENGINE_VERSION
from app.engine.comparison import compare
from app.engine.criteria import build_price_context
from app.engine.learning import learn_profile
from app.engine.ranking import rank
from app.errors import AppError
from app.schemas.engine import (
    CompareRequest,
    CompareResponse,
    LearnRequest,
    LearnResponse,
    RankRequest,
    RankResponse,
)

router = APIRouter(tags=["smartmatch"])


@router.post(
    "/recommendations/rank",
    response_model=RankResponse,
    response_model_by_alias=True,
    summary="Ordena candidatos según el perfil (personalizado) o de forma general (base)",
)
def rank_candidates(
    payload: RankRequest, settings: Annotated[Settings, Depends(get_settings)]
) -> RankResponse:
    if len(payload.candidates) > settings.max_candidates:
        raise AppError(
            413,
            "TOO_MANY_CANDIDATES",
            f"Se permiten como máximo {settings.max_candidates} candidatos por solicitud",
        )
    return rank(payload)


@router.post(
    "/comparisons",
    response_model=CompareResponse,
    response_model_by_alias=True,
    summary="Compara 2 a 4 productos y explica cuál conviene al perfil",
)
def compare_products(payload: CompareRequest) -> CompareResponse:
    return compare(payload)


@router.post(
    "/profiles/learn",
    response_model=LearnResponse,
    response_model_by_alias=True,
    summary="Calcula pesos efectivos y afinidades aprendidas del historial",
)
def learn(payload: LearnRequest) -> LearnResponse:
    context = build_price_context(event.product for event in payload.history)
    learned = learn_profile(payload.weights, payload.history, context)
    return LearnResponse(
        engine_version=ENGINE_VERSION,
        explicit_weights=learned.explicit_weights,
        effective_weights=learned.effective_weights,
        adjustments=learned.adjustments,
        category_affinity=learned.category_affinity,
        brand_affinity=learned.brand_affinity,
        events_used=learned.events_used,
        explanations=learned.explanations(),
    )
