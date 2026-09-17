import json
from collections.abc import Iterator
from pathlib import Path
from typing import Any

import httpx
import pytest
from app.config import Settings
from app.main import create_app
from app.metrics import metrics
from app.schemas.engine import ProductCandidate
from app.sources.openfoodfacts import NoopLimiter, OpenFoodFactsClient
from fastapi.testclient import TestClient

FIXTURES = Path(__file__).parent / "fixtures"
TOKEN = "test-internal-token-0123456789abcdef-xyz"
OFF_BASE = "https://off.test"


@pytest.fixture
def settings() -> Settings:
    return Settings(
        app_env="test",
        internal_api_token=TOKEN,
        off_base_url=OFF_BASE,
        off_max_retries=2,
        off_cache_ttl_seconds=0,
        max_candidates=50,
        log_level="WARNING",
    )


@pytest.fixture
def off_search_payload() -> dict[str, Any]:
    data: dict[str, Any] = json.loads(
        (FIXTURES / "off_search_chile_breakfast_cereals.json").read_text(encoding="utf-8")
    )
    return data


def make_off_client(
    transport: httpx.AsyncBaseTransport | None = None, retries: int = 2
) -> OpenFoodFactsClient:
    return OpenFoodFactsClient(
        base_url=OFF_BASE,
        user_agent="SmartCommerce-tests/0.1",
        timeout_seconds=1.0,
        max_retries=retries,
        limiter=NoopLimiter(),
        cache_ttl_seconds=0,
        backoff_base_seconds=0.0,
        transport=transport,
    )


@pytest.fixture
def client(settings: Settings) -> Iterator[TestClient]:
    metrics.reset()
    app = create_app(settings, off_client=make_off_client())
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def auth_headers() -> dict[str, str]:
    return {"X-Internal-Token": TOKEN, "X-Request-Id": "test-request-1"}


def candidate(**overrides: Any) -> ProductCandidate:
    """Producto base razonable para pruebas del motor."""
    data: dict[str, Any] = {
        "id": overrides.pop("id", None),
        "gtin": "7802000014130",
        "name": "Avena Instantánea",
        "brand": "Quaker",
        "main_category": "breakfast-cereals",
        "nutriscore_grade": "b",
        "nova_group": 1,
        "ecoscore_grade": "b",
        "nutriments": {"energy_kcal": 380, "sugars": 1, "saturated_fat": 1.9, "sodium_mg": 4},
        "high_in_seals": [],
        "allergens": ["gluten"],
        "labels": [],
        "diets": {},
        "stores": ["lider", "jumbo", "unimarc"],
        "unit_price": 3557,
        "price_unit": "kg",
        "data_quality_score": 0.8,
    }
    data.update(overrides)
    return ProductCandidate.model_validate(data)
