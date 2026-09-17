from typing import Any

import httpx
import pytest
import respx
from app.config import Settings
from app.main import create_app
from fastapi.testclient import TestClient

from tests.conftest import OFF_BASE, candidate, make_off_client


def rank_payload(**overrides: Any) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "strategy": "personalized",
        "profile": {
            "weights": {
                "nutrition": 40,
                "price": 20,
                "processing": 20,
                "environment": 10,
                "availability": 10,
            }
        },
        "candidates": [
            candidate(gtin="7802000014130").model_dump(by_alias=True),
            candidate(gtin="7804000001431", brand="Enlinea", nova_group=4).model_dump(
                by_alias=True
            ),
        ],
        "limit": 5,
    }
    payload.update(overrides)
    return payload


class TestHealthAndSecurity:
    def test_health_is_public(self, client: TestClient) -> None:
        response = client.get("/health")
        body = response.json()
        assert response.status_code == 200
        assert body["status"] == "ok"
        assert body["engineVersion"] == "0.1.0"
        assert response.headers["X-Request-Id"]

    def test_readiness_without_deep_check(self, client: TestClient) -> None:
        body = client.get("/health/ready").json()
        assert body == {
            "status": "ok",
            "checks": {"engine": "up", "openfoodfacts": "skipped"},
            "timestamp": body["timestamp"],
        }

    @respx.mock(base_url=OFF_BASE, assert_all_called=False)
    def test_readiness_deep_reports_source_down(
        self, respx_mock: respx.MockRouter, settings: Settings
    ) -> None:
        respx_mock.get("/api/v2/product/3017620422003").mock(side_effect=httpx.ConnectError("down"))
        app = create_app(settings, off_client=make_off_client())
        with TestClient(app) as local:
            body = local.get("/health/ready", params={"deep": True}).json()
        assert body["status"] == "degraded"
        assert body["checks"]["openfoodfacts"] == "down"

    @pytest.mark.parametrize("headers", [{}, {"X-Internal-Token": "incorrecto"}])
    def test_protected_routes_require_internal_token(
        self, client: TestClient, headers: dict[str, str]
    ) -> None:
        response = client.post("/v1/recommendations/rank", json=rank_payload(), headers=headers)
        assert response.status_code == 401
        assert response.json()["code"] == "UNAUTHORIZED"

    def test_request_id_is_propagated(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = client.post(
            "/v1/recommendations/rank", json=rank_payload(), headers=auth_headers
        )
        assert response.headers["X-Request-Id"] == "test-request-1"

    def test_malicious_request_id_is_replaced(self, client: TestClient) -> None:
        response = client.get("/health", headers={"X-Request-Id": "<script>alert(1)</script>"})
        assert "<" not in response.headers["X-Request-Id"]

    def test_metrics_are_collected(self, client: TestClient, auth_headers: dict[str, str]) -> None:
        client.get("/health")
        body = client.get("/v1/metrics", headers=auth_headers).json()
        assert body["routes"]["GET /health"]["count"] == 1

    def test_docs_disabled_in_production(self, settings: Settings) -> None:
        app = create_app(
            settings.model_copy(update={"app_env": "production"}), off_client=make_off_client()
        )
        with TestClient(app) as local:
            assert local.get("/docs").status_code == 404
            assert local.get("/openapi.json").status_code == 404


class TestEngineEndpoints:
    def test_rank_returns_camel_case_contract(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = client.post(
            "/v1/recommendations/rank", json=rank_payload(), headers=auth_headers
        )
        body = response.json()

        assert response.status_code == 200
        assert body["strategy"] == "personalized"
        assert {
            "engineVersion",
            "weightsUsed",
            "learnedAdjustments",
            "items",
            "excluded",
            "stats",
        } <= body.keys()
        first = body["items"][0]
        assert {
            "productId",
            "gtin",
            "rank",
            "score",
            "coverage",
            "breakdown",
            "reasons",
            "warnings",
        } <= first.keys()
        assert first["gtin"] == "7802000014130"

    def test_invalid_payload_returns_validation_error(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        payload = rank_payload(candidates=[{"gtin": "abc", "name": ""}], limit=500)
        response = client.post("/v1/recommendations/rank", json=payload, headers=auth_headers)
        body = response.json()

        assert response.status_code == 422
        assert body["code"] == "VALIDATION_ERROR"
        assert {d["field"] for d in body["details"]} >= {
            "candidates.0.gtin",
            "candidates.0.name",
            "limit",
        }
        assert "Traceback" not in response.text

    def test_unknown_fields_are_rejected(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = client.post(
            "/v1/recommendations/rank", json=rank_payload(isAdmin=True), headers=auth_headers
        )
        assert response.status_code == 422

    def test_too_many_candidates(self, client: TestClient, auth_headers: dict[str, str]) -> None:
        many = [candidate().model_dump(by_alias=True)] * 51
        response = client.post(
            "/v1/recommendations/rank", json=rank_payload(candidates=many), headers=auth_headers
        )
        assert response.status_code == 413
        assert response.json()["code"] == "TOO_MANY_CANDIDATES"

    def test_compare_endpoint(self, client: TestClient, auth_headers: dict[str, str]) -> None:
        payload = {"profile": {}, "products": rank_payload()["candidates"]}
        body = client.post("/v1/comparisons", json=payload, headers=auth_headers).json()
        assert body["winnerGtin"] == "7802000014130"
        assert body["summary"]

    def test_learn_endpoint(self, client: TestClient, auth_headers: dict[str, str]) -> None:
        payload = {
            "weights": {"nutrition": 30},
            "history": [
                {
                    "type": "favorite",
                    "ageDays": 1,
                    "product": candidate(nova_group=4).model_dump(by_alias=True),
                }
            ],
        }
        body = client.post("/v1/profiles/learn", json=payload, headers=auth_headers).json()
        assert body["eventsUsed"] == 1
        assert body["effectiveWeights"]["nutrition"] != body["explicitWeights"]["nutrition"]

    def test_normalize_endpoint(
        self, client: TestClient, auth_headers: dict[str, str], off_search_payload: dict[str, Any]
    ) -> None:
        response = client.post(
            "/v1/products/normalize",
            json={"products": off_search_payload["products"]},
            headers=auth_headers,
        )
        body = response.json()
        assert response.status_code == 200
        assert body["report"]["received"] == len(off_search_payload["products"])
        assert body["products"][0]["source"]["license"] == "ODbL-1.0"


class TestIngestionEndpoint:
    @respx.mock(base_url=OFF_BASE)
    def test_search_is_normalized_with_provenance(
        self,
        respx_mock: respx.MockRouter,
        settings: Settings,
        auth_headers: dict[str, str],
        off_search_payload: dict[str, Any],
    ) -> None:
        route = respx_mock.get("/api/v2/search").mock(
            return_value=httpx.Response(200, json=off_search_payload)
        )
        app = create_app(settings, off_client=make_off_client())
        with TestClient(app) as local:
            response = local.post(
                "/v1/ingestion/openfoodfacts/search",
                json={"country": "chile", "category": "breakfast-cereals", "pageSize": 24},
                headers=auth_headers,
            )
        body = response.json()

        assert response.status_code == 200
        request = route.calls.last.request
        assert request.headers["User-Agent"] == "SmartCommerce-tests/0.1"
        assert request.url.params["countries_tags_en"] == "chile"
        assert "nutriscore_grade" in request.url.params["fields"]
        assert body["totalAvailable"] == off_search_payload["count"]
        assert body["source"]["license"] == "ODbL-1.0"
        assert body["report"]["validRatio"] >= 0.9

    @respx.mock(base_url=OFF_BASE)
    def test_retries_then_reports_upstream_unavailable(
        self, respx_mock: respx.MockRouter, settings: Settings, auth_headers: dict[str, str]
    ) -> None:
        route = respx_mock.get("/api/v2/search").mock(return_value=httpx.Response(503))
        app = create_app(settings, off_client=make_off_client(retries=2))
        with TestClient(app) as local:
            response = local.post(
                "/v1/ingestion/openfoodfacts/search", json={}, headers=auth_headers
            )

        assert response.status_code == 502
        assert response.json()["code"] == "UPSTREAM_UNAVAILABLE"
        assert route.call_count == 3

    @respx.mock(base_url=OFF_BASE)
    def test_timeout_recovers_on_retry(
        self,
        respx_mock: respx.MockRouter,
        settings: Settings,
        auth_headers: dict[str, str],
        off_search_payload: dict[str, Any],
    ) -> None:
        respx_mock.get("/api/v2/search").mock(
            side_effect=[httpx.ReadTimeout("lento"), httpx.Response(200, json=off_search_payload)]
        )
        app = create_app(settings, off_client=make_off_client())
        with TestClient(app) as local:
            response = local.post(
                "/v1/ingestion/openfoodfacts/search", json={}, headers=auth_headers
            )
        assert response.status_code == 200

    @pytest.mark.parametrize(
        "upstream",
        [
            httpx.Response(200, text="<html>no es json</html>"),
            httpx.Response(200, json={"products": "x"}),
            httpx.Response(404),
        ],
    )
    def test_invalid_upstream_responses(
        self,
        respx_mock: respx.MockRouter,
        settings: Settings,
        auth_headers: dict[str, str],
        upstream: httpx.Response,
    ) -> None:
        respx_mock.get(f"{OFF_BASE}/api/v2/search").mock(return_value=upstream)
        app = create_app(settings, off_client=make_off_client(retries=0))
        with TestClient(app) as local:
            response = local.post(
                "/v1/ingestion/openfoodfacts/search", json={}, headers=auth_headers
            )
        assert response.status_code == 502
        assert response.json()["code"] == "UPSTREAM_INVALID_RESPONSE"

    @respx.mock(base_url=OFF_BASE)
    def test_connection_error_exhausts_retries(
        self, respx_mock: respx.MockRouter, settings: Settings, auth_headers: dict[str, str]
    ) -> None:
        respx_mock.get("/api/v2/search").mock(side_effect=httpx.ConnectError("sin red"))
        app = create_app(settings, off_client=make_off_client(retries=1))
        with TestClient(app) as local:
            response = local.post(
                "/v1/ingestion/openfoodfacts/search", json={}, headers=auth_headers
            )
        assert response.status_code == 502
        assert response.json()["code"] == "UPSTREAM_UNAVAILABLE"

    def test_invalid_search_parameters(
        self, client: TestClient, auth_headers: dict[str, str]
    ) -> None:
        response = client.post(
            "/v1/ingestion/openfoodfacts/search",
            json={"country": "chile; DROP TABLE", "pageSize": 1000},
            headers=auth_headers,
        )
        assert response.status_code == 422
