from __future__ import annotations

import asyncio
from collections.abc import Iterator, MutableMapping
from typing import Any

import httpx
import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from app.core.circuit_breaker import CircuitBreaker
from app.core.dependencies import get_storage
from app.core.storage import TripStorage
from app.main import app
from app.schemas.trips import TripCreateRequest


@pytest.fixture
def storage(tmp_path) -> TripStorage:
    return TripStorage(tmp_path / "viagens.json")


@pytest.fixture
def client(storage: TripStorage) -> Iterator[TestClient]:
    app.dependency_overrides[get_storage] = lambda: storage
    with TestClient(app) as test_client:
        test_client.app.state.trip_storage = storage  # type: ignore[attr-defined]
        yield test_client
    app.dependency_overrides.clear()


def test_session_bootstrap_preserves_existing_frontend_contract(
    client: TestClient,
) -> None:
    response = client.get("/api/v1/auth/session")

    assert response.status_code == 200
    data = response.json()
    assert data["usuario"] is None
    assert data["google_client_id"]
    assert data["ufs"] == sorted(data["ufs"])
    assert len(data["ufs"]) == 27


def test_planejamento_integra_geometria_osrm_no_contrato(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.services.trips as services
    from app.core.dependencies import get_http_client

    async def fake_geocode(client, city, state, states):
        return (-8.0, -34.0, city)

    async def fake_weather(client, lat, lon):
        return {
            "temperatura": "20 °C",
            "sensacao_termica": "20 °C",
            "umidade": "50%",
            "vento": "5 km/h",
            "condicao": "Céu limpo",
        }

    async def fake_guide(destination, *, api_key, timeout_seconds):
        return "guia", {"status": "sucesso", "fallback_utilizado": False}

    async def mock_http_client():
        payload = {
            "code": "Ok",
            "routes": [
                {
                    "distance": 1000,
                    "duration": 120,
                    "geometry": {
                        "type": "LineString",
                        "coordinates": [[-34, -8], [-35, -9]],
                    },
                }
            ],
        }
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(200, json=payload)
            )
        ) as http_client:
            yield http_client

    monkeypatch.setattr(services, "geocode", fake_geocode)
    monkeypatch.setattr(services, "get_weather", fake_weather)
    monkeypatch.setattr(services, "get_guide_with_diagnostics", fake_guide)
    app.dependency_overrides[get_http_client] = mock_http_client
    assert client.post("/api/v1/auth/visitor").status_code == 200
    response = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": "Recife",
            "origem_uf": "PE",
            "destino_cidade": "Salvador",
            "destino_uf": "BA",
        },
    )
    assert response.status_code == 200
    percurso = response.json()["viagem"]["percurso"]
    assert percurso["geometria"] == [[-8, -34], [-9, -35]]
    assert percurso["distancia"] == "1.0 km"
    assert percurso["tempo"] == "0h 2min de carro"
    assert percurso["alternativas"] == []


def test_visitor_session_create_list_delete_and_logout(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    storage: TripStorage,
) -> None:
    import app.routers.trips as trips_router

    login = client.post("/api/v1/auth/visitor")
    assert login.status_code == 200
    login_payload = login.json()
    user = login_payload["usuario"]
    assert user["tipo"] == "visitante"
    assert login_payload["session_started_at"] is not None
    assert isinstance(login_payload["session_duration_ms"], (int, float))
    assert client.cookies

    sess = client.get("/api/v1/auth/session")
    assert sess.status_code == 200
    sess_payload = sess.json()
    assert sess_payload["session_started_at"] == login_payload["session_started_at"]
    assert isinstance(sess_payload["session_duration_ms"], (int, float))

    trip: dict[str, Any] = {
        "id": "trip-1",
        "criado_em": "2026-01-01T00:00:00+00:00",
        "origem": "Recife - PE",
        "destino": "Salvador - BA",
        "clima": {"temperatura": "N/D", "umidade": "N/D", "vento": "N/D"},
        "percurso": {"distancia": "N/D", "tempo": "N/D"},
        "dicas_destino": "Guia legado",
        "diagnostico_ia": {"motivo": "chave_ausente"},
    }

    async def fake_plan_trip(form, active_user, **kwargs):
        assert active_user["id"] == user["id"]
        kwargs["storage"].add_for_user(active_user["id"], trip, active_user)
        return trip

    monkeypatch.setattr(trips_router, "plan_trip", fake_plan_trip)
    created = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": "Recife",
            "origem_uf": "PE",
            "destino_cidade": "Salvador",
            "destino_uf": "BA",
        },
    )
    assert created.status_code == 200
    assert created.json() == {"viagem": trip, "aviso": None}

    listed = client.get("/api/v1/roteiros/minhas-viagens")
    assert listed.status_code == 200
    assert listed.json() == {"viagens": [trip]}

    deleted = client.delete("/api/v1/roteiros/trip-1")
    assert deleted.status_code == 204
    assert client.get("/api/v1/roteiros/minhas-viagens").json() == {"viagens": []}

    logged_out = client.post("/api/v1/auth/logout")
    assert logged_out.status_code == 204
    assert client.get("/api/v1/auth/session").json()["usuario"] is None
    assert storage.list_for_user(user["id"]) == []


def test_trip_endpoints_require_a_backend_session(client: TestClient) -> None:
    assert client.get("/api/v1/roteiros/minhas-viagens").status_code == 401
    assert (
        client.post(
            "/api/v1/roteiros/planejar",
            json={
                "origem_cidade": "Recife",
                "origem_uf": "PE",
                "destino_cidade": "Salvador",
                "destino_uf": "BA",
            },
        ).status_code
        == 401
    )


def test_planning_returns_503_when_circuit_breakers_are_unavailable(
    client: TestClient,
) -> None:
    client.post("/api/v1/auth/visitor")
    breakers = client.app.state.circuit_breakers  # type: ignore[attr-defined]
    del client.app.state.circuit_breakers  # type: ignore[attr-defined]
    try:
        response = client.post(
            "/api/v1/roteiros/planejar",
            json={
                "origem_cidade": "Recife",
                "origem_uf": "PE",
                "destino_cidade": "Salvador",
                "destino_uf": "BA",
            },
        )
    finally:
        client.app.state.circuit_breakers = breakers  # type: ignore[attr-defined]

    assert response.status_code == 503
    assert response.json()["detail"] == "Disjuntores de integração indisponíveis."


def test_planning_endpoint_meets_mocked_latency_target_with_concurrent_stages(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.services.trips as trip_services

    async def delayed_geocode(client, city, state, states):
        await asyncio.sleep(0.3)
        return (-8.0, -34.0, f"{city} - {state}")

    async def delayed_weather(client, latitude, longitude):
        await asyncio.sleep(0.3)
        return {"temperatura": "20 °C", "umidade": "50%", "vento": "5 km/h"}

    async def delayed_route(
        client,
        latitude_origin,
        longitude_origin,
        latitude_destination,
        longitude_destination,
    ):
        await asyncio.sleep(0.3)
        return {
            "distancia": "100 km",
            "tempo": "2h",
            "modal": "carro",
            "status": "disponivel",
            "motivo": None,
            "geometria": [[-8.0, -34.0], [-9.0, -35.0]],
            "alternativas": [],
        }

    async def successful_guide(destination, *, api_key, timeout_seconds):
        return "guia válido", {
            "status": "sucesso",
            "modelo": "gemini-3.6-flash",
            "fallback_utilizado": False,
        }

    monkeypatch.setattr(trip_services, "geocode", delayed_geocode)
    monkeypatch.setattr(trip_services, "get_weather", delayed_weather)
    monkeypatch.setattr(trip_services, "get_route", delayed_route)
    monkeypatch.setattr(
        trip_services,
        "get_guide_with_diagnostics",
        successful_guide,
    )
    client.post("/api/v1/auth/visitor")

    response = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": "Recife",
            "origem_uf": "PE",
            "destino_cidade": "Salvador",
            "destino_uf": "BA",
        },
    )

    assert response.status_code == 200
    assert float(response.headers["X-Process-Time"].removesuffix("ms")) < 1000
    assert response.json()["viagem"]["percurso"] == {
        "distancia": "100 km",
        "tempo": "2h",
        "modal": "carro",
        "status": "disponivel",
        "motivo": None,
        "geometria": [[-8.0, -34.0], [-9.0, -35.0]],
        "alternativas": [],
    }


@pytest.mark.asyncio
async def test_client_disconnect_cancels_planning_before_persistence(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import trips as trips_router

    started = asyncio.Event()
    cancelled = asyncio.Event()
    incoming_messages: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def receive() -> dict[str, Any]:
        return await incoming_messages.get()

    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/v1/roteiros/planejar",
        "raw_path": b"/api/v1/roteiros/planejar",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 123),
        "server": ("testserver", 80),
        "session": {},
    }
    request = Request(scope, receive)

    class TrackingStorage:
        def __init__(self) -> None:
            self.trips: list[dict[str, Any]] = []

        def add_for_user(
            self, user_id: str, trip: dict[str, Any], profile: dict[str, Any]
        ) -> None:
            self.trips.append(trip)

    async def blocked_plan_trip(form, user, **kwargs):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(trips_router, "plan_trip", blocked_plan_trip)
    storage = TrackingStorage()
    payload = TripCreateRequest(
        origem_cidade="Recife",
        origem_uf="PE",
        destino_cidade="Salvador",
        destino_uf="BA",
    )
    breakers = {
        "weather": CircuitBreaker("weather"),
        "guide": CircuitBreaker("guide"),
    }
    async with httpx.AsyncClient() as client:
        planning = asyncio.create_task(
            trips_router.create_trip(
                payload,
                request=request,
                user={"id": "disconnect-test-user", "tipo": "visitante"},
                client=client,
                storage=storage,
                circuit_breakers=breakers,
            )
        )
        await started.wait()
        await incoming_messages.put({"type": "http.disconnect"})
        with pytest.raises(asyncio.CancelledError):
            await planning

    assert cancelled.is_set()
    assert storage.trips == []
    assert not trips_router._active_requests


@pytest.mark.asyncio
async def test_client_disconnect_through_asgi_middleware_cancels_planning(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.core.dependencies import (
        get_circuit_breakers,
        get_current_user,
        get_http_client,
    )
    from app.routers import trips as trips_router

    started = asyncio.Event()
    cancelled = asyncio.Event()
    incoming_messages: asyncio.Queue[dict[str, Any]] = asyncio.Queue()
    sent_messages: list[dict[str, Any]] = []

    async def receive() -> dict[str, Any]:
        return await incoming_messages.get()

    async def send(message: MutableMapping[str, Any]) -> None:
        sent_messages.append(dict(message))

    async def blocked_plan_trip(form, user, **kwargs):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            cancelled.set()

    monkeypatch.setattr(trips_router, "plan_trip", blocked_plan_trip)
    breakers = {
        "weather": CircuitBreaker("weather"),
        "guide": CircuitBreaker("guide"),
    }
    original_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "asgi-disconnect-user",
        "tipo": "visitante",
    }
    app.dependency_overrides[get_http_client] = lambda: object()
    app.dependency_overrides[get_storage] = lambda: object()
    app.dependency_overrides[get_circuit_breakers] = lambda: breakers
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/v1/roteiros/planejar",
        "raw_path": b"/api/v1/roteiros/planejar",
        "query_string": b"",
        "headers": [(b"content-type", b"application/json")],
        "client": ("testclient", 123),
        "server": ("testserver", 80),
        "root_path": "",
    }
    body = (
        b'{"origem_cidade":"Recife","origem_uf":"PE",'
        b'"destino_cidade":"Salvador","destino_uf":"BA"}'
    )
    await incoming_messages.put(
        {"type": "http.request", "body": body, "more_body": False}
    )
    application = asyncio.create_task(app(scope, receive, send))
    try:
        await asyncio.wait_for(started.wait(), timeout=1)
        await incoming_messages.put({"type": "http.disconnect"})
        with pytest.raises(asyncio.CancelledError):
            await asyncio.wait_for(asyncio.shield(application), timeout=1)
    finally:
        app.dependency_overrides.clear()
        app.dependency_overrides.update(original_overrides)
        if not application.done():
            application.cancel()
            await asyncio.gather(application, return_exceptions=True)

    assert cancelled.is_set()
    assert sent_messages == []
    assert not trips_router._active_requests


@pytest.mark.asyncio
async def test_external_route_cancellation_cleans_planning_and_disconnect_tasks(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from app.routers import trips as trips_router

    started = asyncio.Event()
    planning_cancelled = asyncio.Event()
    observer_finished = asyncio.Event()
    incoming_messages: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def receive() -> dict[str, Any]:
        return await incoming_messages.get()

    original_wait_for_disconnect = trips_router._wait_for_disconnect

    async def tracked_wait_for_disconnect(request: Request) -> None:
        try:
            await original_wait_for_disconnect(request)
        finally:
            observer_finished.set()

    async def blocked_plan_trip(form, user, **kwargs):
        started.set()
        try:
            await asyncio.Event().wait()
        finally:
            planning_cancelled.set()

    monkeypatch.setattr(
        trips_router, "_wait_for_disconnect", tracked_wait_for_disconnect
    )
    monkeypatch.setattr(trips_router, "plan_trip", blocked_plan_trip)
    scope = {
        "type": "http",
        "asgi": {"version": "3.0"},
        "http_version": "1.1",
        "method": "POST",
        "scheme": "http",
        "path": "/api/v1/roteiros/planejar",
        "raw_path": b"/api/v1/roteiros/planejar",
        "query_string": b"",
        "headers": [],
        "client": ("testclient", 123),
        "server": ("testserver", 80),
        "session": {},
    }
    request = Request(scope, receive)
    payload = TripCreateRequest(
        origem_cidade="Recife",
        origem_uf="PE",
        destino_cidade="Salvador",
        destino_uf="BA",
    )
    breakers = {
        "weather": CircuitBreaker("weather"),
        "guide": CircuitBreaker("guide"),
    }
    async with httpx.AsyncClient() as client:
        endpoint = asyncio.create_task(
            trips_router.create_trip(
                payload,
                request=request,
                user={"id": "external-cancel-user", "tipo": "visitante"},
                client=client,
                storage=object(),
                circuit_breakers=breakers,
            )
        )
        await asyncio.wait_for(started.wait(), timeout=1)
        endpoint.cancel()
        with pytest.raises(asyncio.CancelledError):
            await endpoint

    assert planning_cancelled.is_set()
    assert observer_finished.is_set()
    assert not trips_router._active_requests


def test_spoofed_user_header_does_not_authenticate(client: TestClient) -> None:
    response = client.get(
        "/api/v1/roteiros/minhas-viagens", headers={"X-User-Id": "another-user"}
    )
    assert response.status_code == 401


def test_operational_endpoints_and_request_headers(client: TestClient) -> None:
    response = client.get("/healthz", headers={"X-Request-ID": "request-test-1"})
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
    assert response.headers["X-Request-ID"] == "request-test-1"
    assert response.headers["X-Process-Time"].endswith("ms")

    assert client.get("/readyz").json() == {"status": "ready"}


def test_old_json_file_is_read_without_changing_its_user_shape(tmp_path) -> None:
    import json

    legacy_trip = {"id": "old-trip", "origem": "Recife - PE", "destino": "Natal - RN"}
    path = tmp_path / "viagens.json"
    path.write_text(
        json.dumps(
            {
                "versao_schema": "1.0",
                "total_usuarios": 1,
                "total_roteiros": 1,
                "usuarios": {
                    "google-sub": {
                        "perfil": {"nome": "Ana", "tipo": "google"},
                        "roteiros": [legacy_trip],
                    }
                },
            }
        ),
        encoding="utf-8",
    )
    storage = TripStorage(path)
    assert storage.list_for_user("google-sub") == [legacy_trip]
    assert storage.list_for_user("other-sub") == []


def test_google_auth_maps_verified_profile_to_session(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.routers.auth as auth_router

    async def fake_verify(client, credential, *, google_client_id):
        assert credential == "valid-credential"
        assert google_client_id
        return {
            "sub": "google-user-1",
            "name": "Ana",
            "email": "ana@example.test",
            "picture": "https://example.test/ana.png",
        }

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    response = client.post(
        "/api/v1/auth/google", json={"credential": "valid-credential"}
    )
    assert response.status_code == 200
    assert response.json()["usuario"] == {
        "id": "google-user-1",
        "nome": "Ana",
        "email": "ana@example.test",
        "foto": "https://example.test/ana.png",
        "tipo": "google",
    }
    assert client.get("/api/v1/auth/session").json()["usuario"]["id"] == (
        "google-user-1"
    )


def test_google_session_can_be_restored_after_visitor_mode(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    storage: TripStorage,
) -> None:
    import app.routers.auth as auth_router

    async def fake_verify(client, credential, *, google_client_id):
        return {
            "sub": "google-user-restore",
            "name": "Ana",
            "email": "ana@example.test",
        }

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    google_trip = {"id": "google-trip", "origem": "Recife"}
    storage.add_for_user(
        "google-user-restore",
        google_trip,
        {"id": "google-user-restore", "nome": "Ana", "tipo": "google"},
    )
    assert (
        client.post("/api/v1/auth/google", json={"credential": "verified"}).status_code
        == 200
    )

    visitor = client.post("/api/v1/auth/visitor").json()["usuario"]
    visitor_trip = {"id": "visitor-trip", "origem": "Natal"}
    storage.add_for_user(visitor["id"], visitor_trip, visitor)
    assert client.get("/api/v1/roteiros/minhas-viagens").json() == {
        "viagens": [visitor_trip]
    }

    reloaded_session = client.get("/api/v1/auth/session")
    assert reloaded_session.json()["usuario"]["tipo"] == "visitante"
    restored = client.post("/api/v1/auth/restore-google")

    assert restored.status_code == 200
    assert restored.json()["usuario"]["id"] == "google-user-restore"
    assert client.get("/api/v1/roteiros/minhas-viagens").json() == {
        "viagens": [google_trip]
    }
    assert storage.list_for_user(visitor["id"]) == []


def test_google_restore_requires_an_unexpired_signed_session(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.routers.auth as auth_router

    async def fake_verify(client, credential, *, google_client_id):
        return {"sub": "google-user-expiring", "name": "Ana"}

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    client.post("/api/v1/auth/google", json={"credential": "verified"})
    client.post("/api/v1/auth/visitor")
    monkeypatch.setattr(auth_router, "_session_expiration", lambda value: 0.0)

    expired = client.post("/api/v1/auth/restore-google")
    assert expired.status_code == 401
    assert client.get("/api/v1/auth/session").json()["usuario"] is None


def test_google_restore_is_revoked_by_account_switch_and_logout(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.routers.auth as auth_router

    async def fake_verify(client, credential, *, google_client_id):
        return {"sub": f"google-{credential}", "name": credential}

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    client.post("/api/v1/auth/google", json={"credential": "one"})
    client.post("/api/v1/auth/visitor")
    client.post("/api/v1/auth/google", json={"credential": "two"})
    assert client.post("/api/v1/auth/restore-google").status_code == 401
    assert client.get("/api/v1/auth/session").json()["usuario"]["id"] == "google-two"

    client.post("/api/v1/auth/visitor")
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.post("/api/v1/auth/restore-google").status_code == 401


@pytest.mark.parametrize("transition", ["logout", "troca", "restauracao"])
def test_cookies_anteriores_nao_restauram_sessao(
    client: TestClient, monkeypatch: pytest.MonkeyPatch, transition: str
) -> None:
    import app.routers.auth as auth_router

    async def fake_verify(client, credential, *, google_client_id):
        return {"sub": f"google-{credential}", "name": "Usuário"}

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    assert (
        client.post("/api/v1/auth/google", json={"credential": "one"}).status_code
        == 200
    )
    google_cookie = client.cookies.get("guia_turista_session")
    assert client.post("/api/v1/auth/visitor").status_code == 200
    visitor_cookie = client.cookies.get("guia_turista_session")
    if transition == "logout":
        assert client.post("/api/v1/auth/logout").status_code == 204
    elif transition == "troca":
        assert (
            client.post("/api/v1/auth/google", json={"credential": "two"}).status_code
            == 200
        )
    else:
        assert client.post("/api/v1/auth/restore-google").status_code == 200
    client.cookies.clear()
    client.cookies.set("guia_turista_session", visitor_cookie)
    assert client.post("/api/v1/auth/restore-google").status_code == 401
    client.cookies.clear()
    client.cookies.set("guia_turista_session", google_cookie)
    assert client.get("/api/v1/roteiros/minhas-viagens").status_code == 401


def test_attraction_visit_patch_persists_only_for_active_users(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    storage: TripStorage,
) -> None:
    import app.routers.auth as auth_router

    async def fake_verify(client, credential, *, google_client_id):
        return {"sub": f"google-{credential}", "name": credential}

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    storage.add_for_user(
        "google-owner",
        {"id": "owner-trip"},
        {"id": "google-owner", "tipo": "google"},
    )
    storage.add_for_user(
        "google-other",
        {"id": "other-trip"},
        {"id": "google-other", "tipo": "google"},
    )

    unauthorized = client.patch(
        "/api/v1/roteiros/owner-trip/visitas",
        json={"atrativo_id": "poi-1", "visitado": True},
    )
    assert unauthorized.status_code == 401
    client.post("/api/v1/auth/google", json={"credential": "owner"})

    updated = client.patch(
        "/api/v1/roteiros/owner-trip/visitas",
        json={"atrativo_id": "poi-1", "visitado": True},
    )
    assert updated.status_code == 200
    assert updated.json()["atrativos_visitados_ids"] == ["poi-1"]
    assert storage.list_for_user("google-owner")[0]["atrativos_visitados_ids"] == [
        "poi-1"
    ]
    assert storage.list_for_user("google-other") == [{"id": "other-trip"}]
    assert (
        client.patch(
            "/api/v1/roteiros/other-trip/visitas",
            json={"atrativo_id": "poi-1", "visitado": True},
        ).status_code
        == 404
    )
    assert (
        client.patch(
            "/api/v1/roteiros/owner-trip/visitas",
            json={"atrativo_id": "  ", "visitado": True},
        ).status_code
        == 422
    )


def test_visitas_sao_idempotentes_e_recarregadas_no_historico(
    client: TestClient, storage: TripStorage
) -> None:
    visitor = client.post("/api/v1/auth/visitor").json()["usuario"]
    storage.add_for_user(visitor["id"], {"id": "trip-visits"}, visitor)
    path = "/api/v1/roteiros/trip-visits/visitas"
    for _ in range(2):
        response = client.patch(path, json={"atrativo_id": "poi-1", "visitado": True})
        assert response.json()["atrativos_visitados_ids"] == ["poi-1"]
    assert client.get("/api/v1/roteiros/minhas-viagens").json()["viagens"][0][
        "atrativos_visitados_ids"
    ] == ["poi-1"]
    for _ in range(2):
        response = client.patch(path, json={"atrativo_id": "poi-1", "visitado": False})
        assert response.json()["atrativos_visitados_ids"] == []
    assert (
        client.get("/api/v1/roteiros/minhas-viagens").json()["viagens"][0][
            "atrativos_visitados_ids"
        ]
        == []
    )


def test_expired_visitor_session_is_cleared(
    client: TestClient,
    monkeypatch: pytest.MonkeyPatch,
    storage: TripStorage,
) -> None:
    import app.routers.auth as auth_router

    monkeypatch.setattr(auth_router, "VISITOR_TTL_SECONDS", 0)
    login = client.post("/api/v1/auth/visitor")
    visitor_id = login.json()["usuario"]["id"]
    assert storage.list_for_user(visitor_id) == []

    session = client.get("/api/v1/auth/session")
    assert session.json()["usuario"] is None
    assert client.get("/api/v1/roteiros/minhas-viagens").status_code == 401


def test_json_export_preserves_metadata_and_only_exposes_active_user(
    client: TestClient,
    storage: TripStorage,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    import app.routers.auth as auth_router

    storage.add_for_user(
        "google-user-1",
        {"id": "trip-a", "origem": "Recife", "destino": "Natal"},
        {"id": "google-user-1", "nome": "Ana", "tipo": "google"},
    )
    storage.add_for_user(
        "google-user-2",
        {"id": "trip-private", "origem": "Privado", "destino": "Privado"},
        {"id": "google-user-2", "nome": "Outra pessoa", "tipo": "google"},
    )

    async def fake_verify(client, credential, *, google_client_id):
        return {
            "sub": "google-user-1",
            "name": "Ana",
            "email": "ana@example.test",
        }

    monkeypatch.setattr(auth_router, "verify_google_token", fake_verify)
    client.post("/api/v1/auth/google", json={"credential": "credential"})
    response = client.get("/api/v1/roteiros/minhas-viagens/json")

    assert response.status_code == 200
    exported = response.json()
    assert exported["versao_schema"] == "1.0"
    assert exported["total_usuarios"] == 1
    assert exported["total_roteiros"] == 1
    assert set(exported["usuarios"]) == {"google-user-1"}
    assert exported["usuarios"]["google-user-1"]["roteiros"][0]["id"] == "trip-a"
    assert "google-user-2" not in response.text


def test_plan_trip_empty_city_returns_validation_error(client: TestClient) -> None:
    client.post("/api/v1/auth/visitor")
    response = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": " ",
            "origem_uf": "PE",
            "destino_cidade": "Salvador",
            "destino_uf": "BA",
        },
    )
    assert response.status_code == 422
    detalhes = response.json()["detail"]
    assert isinstance(detalhes, list)
    assert any(item.get("loc") == ["body", "origem_cidade"] for item in detalhes)


def test_plan_trip_rejects_unknown_uf(client: TestClient) -> None:
    client.post("/api/v1/auth/visitor")
    response = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": "Recife",
            "origem_uf": "ZZ",
            "destino_cidade": "Salvador",
            "destino_uf": "BA",
        },
    )
    assert response.status_code == 422
    detalhes = response.json()["detail"]
    assert isinstance(detalhes, list)
    assert any(item.get("loc") == ["body", "origem_uf"] for item in detalhes)


def test_plan_trip_normalizes_uf_case_and_spacing(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.routers.trips as trips_router

    capturado: dict[str, Any] = {}

    async def fake_plan_trip(form, active_user, **kwargs):
        capturado.update(form)
        return {
            "id": "trip-uf",
            "origem": form["origem_cidade"],
            "destino": form["destino_cidade"],
        }

    monkeypatch.setattr(trips_router, "plan_trip", fake_plan_trip)
    client.post("/api/v1/auth/visitor")
    response = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": "Recife",
            "origem_uf": "pe",
            "destino_cidade": "Salvador",
            "destino_uf": " ba ",
        },
    )
    assert response.status_code == 200
    assert capturado["origem_uf"] == "PE"
    assert capturado["destino_uf"] == "BA"


def test_duplicate_trip_planning_returns_conflict(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.routers.trips as trips_router

    async def fake_plan_trip(form, active_user, **kwargs):
        return {
            "id": "trip-duplicate",
            "origem": form["origem_cidade"],
            "destino": form["destino_cidade"],
        }

    monkeypatch.setattr(trips_router, "plan_trip", fake_plan_trip)
    client.post("/api/v1/auth/visitor")
    payload = {
        "origem_cidade": "Cidade-X",
        "origem_uf": "PE",
        "destino_cidade": "Cidade-Y",
        "destino_uf": "BA",
    }
    assert client.post("/api/v1/roteiros/planejar", json=payload).status_code == 200
    duplicate = client.post("/api/v1/roteiros/planejar", json=payload)
    assert duplicate.status_code == 409
