"""Configuración del servicio a partir de variables de entorno (validadas al arrancar)."""

from functools import lru_cache
from typing import Literal

from pydantic import Field, SecretStr
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """Variables de entorno soportadas. Ver `.env.example`."""

    model_config = SettingsConfigDict(extra="ignore", case_sensitive=False)

    app_env: Literal["development", "test", "staging", "production"] = "development"
    service_name: str = "smartmatch-python-service"
    service_version: str = "0.1.0"
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR"] = "INFO"

    # Autenticación entre servicios (NestJS -> FastAPI).
    internal_api_token: SecretStr = Field(min_length=32)

    # Fuente web: Open Food Facts (API oficial v2).
    off_base_url: str = "https://world.openfoodfacts.org"
    off_user_agent: str = "SmartCommerce/0.1.0 (contacto: equipo@smartcommerce.example)"
    off_timeout_seconds: float = Field(default=10.0, gt=0, le=60)
    off_max_retries: int = Field(default=2, ge=0, le=5)
    # Open Food Facts permite 10 búsquedas/minuto; usamos un límite conservador.
    off_search_rate_per_minute: int = Field(default=8, ge=1, le=10)
    off_cache_ttl_seconds: int = Field(default=300, ge=0, le=86_400)

    # Límites de carga para proteger el servicio.
    max_candidates: int = Field(default=200, ge=1, le=1000)

    @property
    def docs_enabled(self) -> bool:
        """La documentación interactiva no se expone en producción."""
        return self.app_env != "production"


@lru_cache
def get_settings() -> Settings:
    """Devuelve la configuración cacheada (falla al arrancar si falta un valor obligatorio)."""
    return Settings()
