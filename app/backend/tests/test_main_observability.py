import httpx
import pytest
from fastapi.testclient import TestClient

from app import main
from app.core.circuit_breaker import CircuitState
from app.main import app


def test_lifespan_creates_circuit_breakers() -> None:
    with TestClient(app) as client:
        breakers = client.app.state.circuit_breakers  # type: ignore[attr-defined]
        assert set(breakers) == {"weather", "guide"}
        assert all(b.state == CircuitState.CLOSED for b in breakers.values())


def test_circuits_endpoint_reports_state() -> None:
    with TestClient(app) as client:
        body = client.get("/circuits").json()
    names = {item["name"] for item in body["circuit_breakers"]}
    assert names == {"weather", "guide"}
    assert all(item["state"] == "closed" for item in body["circuit_breakers"])


def test_metrics_endpoint_exposes_requests_and_breakers() -> None:
    with TestClient(app) as client:
        client.get("/healthz")
        response = client.get("/metrics")
    assert response.status_code == 200
    assert (
        'http_requests_total{method="GET",path="/healthz",status="200"}'
        in response.text
    )
    assert 'circuit_breaker_open{name="weather"} 0.0' in response.text


def test_valid_request_id_is_preserved_and_unsafe_one_is_replaced() -> None:
    with TestClient(app) as client:
        ok = client.get("/healthz", headers={"X-Request-ID": "abc-123"})
        long = client.get("/healthz", headers={"X-Request-ID": "x" * 500})
        weird = client.get("/healthz", headers={"X-Request-ID": "a b<script>"})
    assert ok.headers["X-Request-ID"] == "abc-123"
    assert long.headers["X-Request-ID"] != "x" * 500
    assert len(long.headers["X-Request-ID"]) <= 64
    assert weird.headers["X-Request-ID"] != "a b<script>"


def test_http_client_is_closed_when_startup_fails(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    created: list[httpx.AsyncClient] = []

    class SpyClient(httpx.AsyncClient):
        def __init__(self, *args, **kwargs) -> None:
            super().__init__(*args, **kwargs)
            created.append(self)

    def broken_storage(*args, **kwargs):
        raise RuntimeError("storage indisponível")

    monkeypatch.setattr(main.httpx, "AsyncClient", SpyClient)
    monkeypatch.setattr(main, "TripStorage", broken_storage)

    with pytest.raises(RuntimeError, match="storage indisponível"), TestClient(app):
        pass

    assert created and created[0].is_closed


def test_http_client_is_closed_after_successful_lifespan() -> None:
    with TestClient(app) as client:
        http_client = client.app.state.http_client  # type: ignore[attr-defined]
        assert not http_client.is_closed

    assert http_client.is_closed
