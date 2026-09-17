"""Obtención de información desde la Web y normalización de productos."""

import logging
from datetime import UTC, datetime

from fastapi import APIRouter

from app.api.deps import OffClient
from app.normalization.normalizer import normalize_batch
from app.schemas.ingestion import IngestionSearchRequest, IngestionSearchResponse, SourceDescriptor
from app.schemas.product import NormalizeRequest, NormalizeResponse

router = APIRouter(tags=["ingesta"])
logger = logging.getLogger("app.api.ingestion")


@router.post(
    "/ingestion/openfoodfacts/search",
    response_model=IngestionSearchResponse,
    response_model_by_alias=True,
    summary="Busca productos en Open Food Facts y los devuelve normalizados",
)
async def ingest_open_food_facts(
    payload: IngestionSearchRequest, client: OffClient
) -> IngestionSearchResponse:
    result = await client.search(
        country=payload.country,
        category=payload.category,
        brand=payload.brand,
        page=payload.page,
        page_size=payload.page_size,
    )
    fetched_at = datetime.now(UTC)
    normalized = normalize_batch(result.products, fetched_at=fetched_at)
    logger.info(
        "ingestion normalized",
        extra={
            "received": normalized.report.received,
            "valid": normalized.report.valid,
            "rejected": normalized.report.rejected,
            "duplicates": normalized.report.duplicates,
            "fromCache": result.from_cache,
        },
    )
    return IngestionSearchResponse(
        source=SourceDescriptor(api_url=result.url),
        request=payload,
        fetched_at=fetched_at,
        total_available=result.count,
        products=normalized.products,
        report=normalized.report,
    )


@router.post(
    "/products/normalize",
    response_model=NormalizeResponse,
    response_model_by_alias=True,
    summary="Valida, limpia, normaliza y deduplica registros crudos de Open Food Facts",
)
def normalize_products(payload: NormalizeRequest) -> NormalizeResponse:
    result = normalize_batch(payload.products)
    return NormalizeResponse(products=result.products, report=result.report)
