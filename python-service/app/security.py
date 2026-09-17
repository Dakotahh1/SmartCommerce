"""Autenticación entre servicios mediante token compartido."""

import hmac
from typing import Annotated

from fastapi import Depends, Header

from app.config import Settings, get_settings
from app.errors import AppError


def require_internal_token(
    settings: Annotated[Settings, Depends(get_settings)],
    x_internal_token: Annotated[str | None, Header(alias="X-Internal-Token")] = None,
) -> None:
    """Rechaza solicitudes que no provienen del backend NestJS.

    La comparación se hace en tiempo constante para evitar ataques de temporización.
    """
    expected = settings.internal_api_token.get_secret_value().encode()
    provided = (x_internal_token or "").encode()
    if not provided or not hmac.compare_digest(provided, expected):
        raise AppError(401, "UNAUTHORIZED", "Token interno ausente o inválido")
