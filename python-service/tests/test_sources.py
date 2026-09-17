import asyncio
import time

import httpx
import pytest
import respx
from app.sources.openfoodfacts import RateLimiter, TTLCache

from tests.conftest import OFF_BASE, make_off_client


def test_ttl_cache_expires_and_evicts() -> None:
    cache = TTLCache(ttl_seconds=60, max_entries=2)
    cache.set("a", 1)
    cache.set("b", 2)
    cache.set("c", 3)
    assert cache.get("a") is None
    assert cache.get("c") == 3

    disabled = TTLCache(ttl_seconds=0)
    disabled.set("x", 1)
    assert disabled.get("x") is None


def test_ttl_cache_expiration(monkeypatch: pytest.MonkeyPatch) -> None:
    cache = TTLCache(ttl_seconds=10)
    cache.set("k", "v")
    real = time.monotonic()
    monkeypatch.setattr(time, "monotonic", lambda: real + 11)
    assert cache.get("k") is None


def test_rate_limiter_spaces_requests() -> None:
    async def scenario() -> float:
        limiter = RateLimiter(rate_per_minute=600)  # 1 solicitud cada 0,1 s
        started = time.monotonic()
        for _ in range(3):
            await limiter.acquire()
        return time.monotonic() - started

    assert asyncio.run(scenario()) >= 0.18


@respx.mock(base_url=OFF_BASE)
def test_search_uses_cache(respx_mock: respx.MockRouter) -> None:
    route = respx_mock.get("/api/v2/search").mock(
        return_value=httpx.Response(200, json={"count": 1, "products": [{"code": "7802000014130"}]})
    )

    async def scenario() -> tuple[bool, bool]:
        client = make_off_client()
        client._cache = TTLCache(ttl_seconds=60)
        first = await client.search(country="chile")
        second = await client.search(country="chile")
        await client.aclose()
        return first.from_cache, second.from_cache

    assert asyncio.run(scenario()) == (False, True)
    assert route.call_count == 1


@respx.mock(base_url=OFF_BASE)
def test_ping(respx_mock: respx.MockRouter) -> None:
    respx_mock.get("/api/v2/product/3017620422003").mock(
        return_value=httpx.Response(200, json={"code": "x"})
    )

    async def scenario() -> bool:
        client = make_off_client()
        result = await client.ping()
        await client.aclose()
        return result

    assert asyncio.run(scenario()) is True
