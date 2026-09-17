"""Errores de aplicación y respuestas de error consistentes (sin trazas internas)."""

import logging
from datetime import UTC, datetime
from typing import Any

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException

from app.logging_config import request_id_ctx

logger = logging.getLogger("app.errors")

_HTTP_CODES = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    413: "PAYLOAD_TOO_LARGE",
    429: "TOO_MANY_REQUESTS",
}


class AppError(Exception):
    """Error controlado que se traduce a una respuesta HTTP con código estable."""

    def __init__(
        self,
        status_code: int,
        code: str,
        message: str,
        details: list[dict[str, Any]] | None = None,
    ) -> None:
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


class UpstreamUnavailableError(AppError):
    """La fuente web externa no respondió a tiempo o devolvió errores transitorios."""

    def __init__(self, message: str = "La fuente de datos externa no está disponible") -> None:
        super().__init__(502, "UPSTREAM_UNAVAILABLE", message)


class UpstreamInvalidResponseError(AppError):
    """La fuente web externa respondió con un formato inesperado."""

    def __init__(
        self, message: str = "La fuente de datos externa respondió en un formato inválido"
    ) -> None:
        super().__init__(502, "UPSTREAM_INVALID_RESPONSE", message)


def error_body(
    status_code: int,
    code: str,
    message: str,
    path: str,
    details: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "statusCode": status_code,
        "code": code,
        "message": message,
        "details": details or [],
        "path": path,
        "timestamp": datetime.now(UTC).isoformat(),
        "requestId": request_id_ctx.get(),
    }


def register_exception_handlers(app: FastAPI) -> None:
    """Registra manejadores globales para devolver siempre el mismo formato de error."""

    @app.exception_handler(AppError)
    async def handle_app_error(request: Request, exc: AppError) -> JSONResponse:
        log = logger.warning if exc.status_code < 500 else logger.error
        log("application error", extra={"code": exc.code, "statusCode": exc.status_code})
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(
                exc.status_code, exc.code, exc.message, request.url.path, exc.details
            ),
        )

    @app.exception_handler(RequestValidationError)
    async def handle_validation_error(
        request: Request, exc: RequestValidationError
    ) -> JSONResponse:
        details = [
            {
                "field": ".".join(str(part) for part in err.get("loc", ()) if part != "body"),
                "message": err.get("msg", "valor inválido"),
                "type": err.get("type", "value_error"),
            }
            for err in exc.errors()[:50]
        ]
        return JSONResponse(
            status_code=422,
            content=error_body(
                422, "VALIDATION_ERROR", "Solicitud inválida", request.url.path, details
            ),
        )

    @app.exception_handler(StarletteHTTPException)
    async def handle_http_error(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        code = _HTTP_CODES.get(exc.status_code, "HTTP_ERROR")
        message = exc.detail if isinstance(exc.detail, str) else code
        return JSONResponse(
            status_code=exc.status_code,
            content=error_body(exc.status_code, code, message, request.url.path),
        )

    @app.exception_handler(Exception)
    async def handle_unexpected(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("unhandled error", extra={"errorType": type(exc).__name__})
        return JSONResponse(
            status_code=500,
            content=error_body(
                500, "INTERNAL_ERROR", "Error interno del servicio", request.url.path
            ),
        )
