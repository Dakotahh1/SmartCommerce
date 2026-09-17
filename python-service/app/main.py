"""Punto de entrada FastAPI (fábrica de aplicación).

Ejecutar: `uvicorn --factory app.main:create_app --host 0.0.0.0 --port 8000`
"""

import logging
import re
import time
from collections.abc import AsyncIterator, Awaitable, Callable
from contextlib import asynccontextmanager
from uuid import uuid4

from fastapi import Depends, FastAPI, Request, Response

from app.api import engine, health, ingestion
from app.config import Settings, get_settings
from app.errors import register_exception_handlers
from app.logging_config import configure_logging, request_id_ctx
from app.metrics import metrics
from app.security import require_internal_token
from app.sources.openfoodfacts import OpenFoodFactsClient

logger = logging.getLogger("app.http")
_REQUEST_ID = re.compile(r"^[A-Za-z0-9._-]{1,64}$")
_MAX_BODY_BYTES = 5 * 1024 * 1024

DESCRIPTION = """
Servicio especializado de **SmartCommerce**. Solo es invocado por el backend NestJS
(red interna) usando la cabecera `X-Internal-Token`.

* **Ingesta**: obtiene productos desde Open Food Facts y los normaliza con métricas de calidad.
* **SmartMatch**: ranking multicriterio explicable, comparación y aprendizaje de preferencias.
"""


def create_app(
    settings: Settings | None = None, off_client: OpenFoodFactsClient | None = None
) -> FastAPI:
    settings = settings or get_settings()
    configure_logging(settings.log_level, settings.service_name)

    @asynccontextmanager
    async def lifespan(app: FastAPI) -> AsyncIterator[None]:
        client = off_client or OpenFoodFactsClient.from_settings(settings)
        app.state.off_client = client
        logger.info(
            "service started", extra={"env": settings.app_env, "version": settings.service_version}
        )
        try:
            yield
        finally:
            await client.aclose()
            logger.info("service stopped")

    app = FastAPI(
        title="SmartCommerce · Servicio SmartMatch",
        version=settings.service_version,
        description=DESCRIPTION,
        docs_url="/docs" if settings.docs_enabled else None,
        redoc_url=None,
        openapi_url="/openapi.json" if settings.docs_enabled else None,
        lifespan=lifespan,
    )
    app.dependency_overrides[get_settings] = lambda: settings

    @app.middleware("http")
    async def request_context(
        request: Request, call_next: Callable[[Request], Awaitable[Response]]
    ) -> Response:
        incoming = request.headers.get("x-request-id", "")
        request_id = incoming if _REQUEST_ID.fullmatch(incoming) else uuid4().hex
        token = request_id_ctx.set(request_id)
        started = time.perf_counter()
        status_code = 500
        try:
            content_length = request.headers.get("content-length", "0")
            if content_length.isdigit() and int(content_length) > _MAX_BODY_BYTES:
                status_code = 413
                return Response(status_code=413)
            response = await call_next(request)
            status_code = response.status_code
            response.headers["X-Request-Id"] = request_id
            response.headers["X-Response-Time-Ms"] = f"{(time.perf_counter() - started) * 1000:.1f}"
            return response
        finally:
            duration_ms = round((time.perf_counter() - started) * 1000, 2)
            route = request.scope.get("route")
            template = getattr(route, "path", request.url.path)
            metrics.observe(f"{request.method} {template}", status_code, duration_ms)
            logger.info(
                "request completed",
                extra={
                    "method": request.method,
                    "path": request.url.path,
                    "statusCode": status_code,
                    "durationMs": duration_ms,
                },
            )
            request_id_ctx.reset(token)

    register_exception_handlers(app)
    app.include_router(health.router)
    protected = [Depends(require_internal_token)]
    app.include_router(ingestion.router, prefix="/v1", dependencies=protected)
    app.include_router(engine.router, prefix="/v1", dependencies=protected)
    return app
