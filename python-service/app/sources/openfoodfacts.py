"""Cliente de la API oficial v2 de Open Food Facts con uso responsable.

- User-Agent identificable (exigido por Open Food Facts).
- Límite de solicitudes por minuto, timeouts, reintentos acotados con backoff y caché con TTL.
- Solo se solicitan los campos necesarios (`fields=`) para minimizar datos y carga.
"""

import asyncio
import logging
import random
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any, Protocol

import httpx

from app.config import Settings
from app.errors import UpstreamInvalidResponseError, UpstreamUnavailableError

logger = logging.getLogger("app.sources.openfoodfacts")

PRODUCT_FIELDS: tuple[str, ...] = (
    "code",
    "product_name",
    "product_name_es",
    "generic_name",
    "generic_name_es",
    "brands",
    "categories_tags",
    "quantity",
    "product_quantity",
    "product_quantity_unit",
    "nutriscore_grade",
    "nova_group",
    "ecoscore_grade",
    "nutriments",
    "allergens_tags",
    "traces_tags",
    "labels_tags",
    "ingredients_analysis_tags",
    "stores_tags",
    "countries_tags",
    "image_front_url",
    "completeness",
    "last_modified_t",
)
RETRYABLE_STATUS = frozenset({429, 500, 502, 503, 504})
PING_PRODUCT_CODE = "3017620422003"


class Limiter(Protocol):
    async def acquire(self) -> None: ...


class RateLimiter:
    """Espacia las solicitudes para no superar `rate_per_minute`."""

    def __init__(self, rate_per_minute: int) -> None:
        self._interval = 60.0 / rate_per_minute
        self._lock = asyncio.Lock()
        self._next_allowed = 0.0

    async def acquire(self) -> None:
        async with self._lock:
            now = time.monotonic()
            wait = self._next_allowed - now
            if wait > 0:
                await asyncio.sleep(wait)
                now = time.monotonic()
            self._next_allowed = max(now, self._next_allowed) + self._interval


class NoopLimiter:
    async def acquire(self) -> None:
        return None


class TTLCache:
    """Caché LRU en memoria con expiración."""

    def __init__(self, ttl_seconds: int, max_entries: int = 256) -> None:
        self._ttl = ttl_seconds
        self._max_entries = max_entries
        self._data: OrderedDict[str, tuple[float, Any]] = OrderedDict()

    def get(self, key: str) -> Any | None:
        entry = self._data.get(key)
        if entry is None:
            return None
        expires_at, value = entry
        if time.monotonic() > expires_at:
            self._data.pop(key, None)
            return None
        self._data.move_to_end(key)
        return value

    def set(self, key: str, value: Any) -> None:
        if self._ttl <= 0:
            return
        self._data[key] = (time.monotonic() + self._ttl, value)
        self._data.move_to_end(key)
        while len(self._data) > self._max_entries:
            self._data.popitem(last=False)


@dataclass(frozen=True)
class SearchResult:
    products: list[dict[str, Any]]
    count: int
    page: int
    page_size: int
    url: str
    took_ms: float
    from_cache: bool


class OpenFoodFactsClient:
    def __init__(
        self,
        *,
        base_url: str,
        user_agent: str,
        timeout_seconds: float,
        max_retries: int,
        limiter: Limiter,
        cache_ttl_seconds: int,
        backoff_base_seconds: float = 0.5,
        transport: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._max_retries = max_retries
        self._limiter = limiter
        self._cache = TTLCache(cache_ttl_seconds)
        self._backoff_base = backoff_base_seconds
        self._client = httpx.AsyncClient(
            base_url=self._base_url,
            timeout=httpx.Timeout(timeout_seconds),
            headers={"User-Agent": user_agent, "Accept": "application/json"},
            follow_redirects=False,
            transport=transport,
        )

    @classmethod
    def from_settings(cls, settings: Settings) -> "OpenFoodFactsClient":
        return cls(
            base_url=settings.off_base_url,
            user_agent=settings.off_user_agent,
            timeout_seconds=settings.off_timeout_seconds,
            max_retries=settings.off_max_retries,
            limiter=RateLimiter(settings.off_search_rate_per_minute),
            cache_ttl_seconds=settings.off_cache_ttl_seconds,
        )

    @property
    def base_url(self) -> str:
        return self._base_url

    async def aclose(self) -> None:
        await self._client.aclose()

    def _backoff(self, attempt: int) -> float:
        # Jitter no criptográfico para distribuir reintentos.
        jitter = random.uniform(0, self._backoff_base / 2)  # noqa: S311  # nosec B311
        return float(min(4.0, self._backoff_base * 2 ** (attempt - 1)) + jitter)

    async def _get_json(self, path: str, params: dict[str, str | int]) -> Any:
        attempt = 0
        while True:
            await self._limiter.acquire()
            try:
                response = await self._client.get(path, params=params)
            except httpx.TimeoutException as exc:
                logger.warning("off timeout", extra={"path": path, "attempt": attempt})
                if attempt >= self._max_retries:
                    raise UpstreamUnavailableError("Open Food Facts no respondió a tiempo") from exc
            except httpx.TransportError as exc:
                logger.warning("off transport error", extra={"path": path, "attempt": attempt})
                if attempt >= self._max_retries:
                    raise UpstreamUnavailableError(
                        "No fue posible conectar con Open Food Facts"
                    ) from exc
            else:
                if response.status_code == 200:
                    try:
                        return response.json()
                    except ValueError as exc:
                        raise UpstreamInvalidResponseError() from exc
                logger.warning(
                    "off unexpected status",
                    extra={"path": path, "statusCode": response.status_code, "attempt": attempt},
                )
                if response.status_code not in RETRYABLE_STATUS:
                    raise UpstreamInvalidResponseError(
                        f"Open Food Facts respondió HTTP {response.status_code}"
                    )
                if attempt >= self._max_retries:
                    raise UpstreamUnavailableError(
                        f"Open Food Facts no disponible (HTTP {response.status_code})"
                    )
            attempt += 1
            await asyncio.sleep(self._backoff(attempt))

    async def search(
        self,
        *,
        country: str,
        category: str | None = None,
        brand: str | None = None,
        page: int = 1,
        page_size: int = 50,
    ) -> SearchResult:
        params: dict[str, str | int] = {
            "countries_tags_en": country,
            "fields": ",".join(PRODUCT_FIELDS),
            "page": page,
            "page_size": page_size,
            "sort_by": "last_modified_t",
        }
        if category:
            params["categories_tags_en"] = category
        if brand:
            params["brands_tags"] = brand
        path = "/api/v2/search"
        url = str(httpx.URL(self._base_url + path, params=params))
        started = time.perf_counter()

        cached = self._cache.get(url)
        if cached is not None:
            products, count = cached
            return SearchResult(products, count, page, page_size, url, 0.0, True)

        data = await self._get_json(path, params)
        if not isinstance(data, dict) or not isinstance(data.get("products"), list):
            raise UpstreamInvalidResponseError(
                "La búsqueda de Open Food Facts no incluyó productos"
            )
        products = [item for item in data["products"] if isinstance(item, dict)]
        count = data.get("count")
        total = (
            int(count) if isinstance(count, int | str) and str(count).isdigit() else len(products)
        )
        self._cache.set(url, (products, total))
        took_ms = round((time.perf_counter() - started) * 1000, 2)
        logger.info(
            "off search completed",
            extra={
                "country": country,
                "category": category,
                "page": page,
                "received": len(products),
                "tookMs": took_ms,
            },
        )
        return SearchResult(products, total, page, page_size, url, took_ms, False)

    async def ping(self, timeout_seconds: float = 2.0) -> bool:
        """Verifica disponibilidad de la fuente con una lectura mínima."""
        try:
            response = await self._client.get(
                f"/api/v2/product/{PING_PRODUCT_CODE}",
                params={"fields": "code"},
                timeout=timeout_seconds,
            )
        except httpx.HTTPError:
            return False
        return response.status_code == 200
