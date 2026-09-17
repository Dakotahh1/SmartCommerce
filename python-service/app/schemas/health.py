from datetime import datetime
from typing import Literal

from app.schemas.common import CamelModel


class HealthResponse(CamelModel):
    status: Literal["ok"]
    service: str
    version: str
    engine_version: str
    uptime_seconds: float
    timestamp: datetime


class ReadinessResponse(CamelModel):
    status: Literal["ok", "degraded"]
    checks: dict[str, Literal["up", "down", "skipped"]]
    timestamp: datetime
