"""Endpoints de salud (sin autenticación) y métricas (protegidas)."""

import time
from datetime import UTC, datetime
from typing import Annotated, Any, Literal

from fastapi import APIRouter, Depends, Query

from app.api.deps import OffClient
from app.config import Settings, get_settings
from app.engine import ENGINE_VERSION
from app.metrics import metrics
from app.schemas.health import HealthResponse, ReadinessResponse
from app.security import require_internal_token

router = APIRouter(tags=["salud"])

_PING_CACHE_SECONDS = 60.0
_ping_cache: dict[str, tuple[float, bool]] = {}


@router.get("/health", response_model=HealthResponse, response_model_by_alias=True)
def health(settings: Annotated[Settings, Depends(get_settings)]) -> HealthResponse:
    """Liveness: el proceso está vivo y el motor cargado."""
    return HealthResponse(
        status="ok",
        service=settings.service_name,
        version=settings.service_version,
        engine_version=ENGINE_VERSION,
        uptime_seconds=round(time.time() - metrics.started_at, 1),
        timestamp=datetime.now(UTC),
    )


@router.get("/health/ready", response_model=ReadinessResponse, response_model_by_alias=True)
async def readiness(
    client: OffClient,
    deep: Annotated[bool, Query(description="Verifica también la fuente Open Food Facts")] = False,
) -> ReadinessResponse:
    """Readiness: dependencias necesarias. La fuente web se consulta como máximo cada 60 s."""
    checks: dict[str, Literal["up", "down", "skipped"]] = {
        "engine": "up",
        "openfoodfacts": "skipped",
    }
    if deep:
        cached = _ping_cache.get(client.base_url)
        now = time.monotonic()
        if cached and now - cached[0] < _PING_CACHE_SECONDS:
            reachable = cached[1]
        else:
            reachable = await client.ping()
            _ping_cache[client.base_url] = (now, reachable)
        checks["openfoodfacts"] = "up" if reachable else "down"
    status: Literal["ok", "degraded"] = "degraded" if "down" in checks.values() else "ok"
    return ReadinessResponse(status=status, checks=checks, timestamp=datetime.now(UTC))


@router.get("/v1/metrics", dependencies=[Depends(require_internal_token)])
def read_metrics() -> dict[str, Any]:
    """Conteo, errores 5xx y latencia promedio/p95 por ruta (ventana deslizante)."""
    return metrics.snapshot()
