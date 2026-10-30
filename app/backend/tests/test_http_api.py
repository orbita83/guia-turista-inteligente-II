from __future__ import annotations

import asyncio
from collections.abc import Iterator, MutableMapping
from typing import Any

import httpx
import pytest
from fastapi import BackgroundTasks, Request
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


def test_cors_permite_patch_de_visitas_para_origem_permitida(client: TestClient) -> None:
    response = client.options(
        "/api/v1/roteiros/trip-1/visitas",
        headers={"Origin": "http://localhost:5173", "Access-Control-Request-Method": "PATCH", "Access-Control-Request-Headers": "content-type"},
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "http://localhost:5173"
    assert "PATCH" in response.headers["access-control-allow-methods"]
    assert response.headers["access-control-allow-credentials"] == "true"


def test_planning_persists_once_in_background_after_response(
    client: TestClient, storage: TripStorage, monkeypatch: pytest.MonkeyPatch
) -> None:
    from app.routers import trips as trips_router

    async def fake_plan_trip(form, user, **kwargs):
        assert kwargs["persist"] is False
        assert storage.list_for_user(user["id"]) == []
        return {
            "id": "background-trip",
            "origem": "Recife - PE",
            "destino": "Olinda - PE",
            "percurso": {"distancia": "10 km", "tempo": "20 min"},
        }

    monkeypatch.setattr(trips_router, "plan_trip", fake_plan_trip)
    assert client.post("/api/v1/auth/visitor").status_code == 200
    response = client.post(
        "/api/v1/roteiros/planejar",
        json={
            "origem_cidade": "Recife",
            "origem_uf": "PE",
            "destino_cidade": "Olinda",
            "destino_uf": "PE",
        },
    )
    assert response.status_code == 200
    assert response.json()["viagem"]["id"] == "background-trip"
    user_id = client.get("/api/v1/auth/session").json()["usuario"]["id"]
    assert [item["id"] for item in storage.list_for_user(user_id)] == ["background-trip"]


def test_fluxo_integrado_planejamento_guia_visitas_e_isolamento(
    client: TestClient, monkeypatch: pytest.MonkeyPatch
) -> None:
    import app.services.trips as services
    from app.core.config import get_settings
    from app.core.dependencies import get_http_client

    async def geocode(_client, city, state, _states):
        return (-8.0, -34.0, f"{city} - {state}")

    async def weather(_client, _lat, _lon):
        return {"temperatura": "28 °C", "sensacao_termica": "29 °C", "umidade": "70%", "vento": "10 km/h"}

    async def http_client():
        def response(request):
            if request.method == "POST":
                return httpx.Response(200, json={"results": [{"elevation": 10}, {"elevation": 20}]})
            return httpx.Response(200, json={"code": "Ok", "routes": [{"distance": 1000, "duration": 60, "geometry": {"type": "LineString", "coordinates": [[-34, -8], [-34.01, -8.01]]}}]})

        async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as mocked:
            yield mocked

    monkeypatch.setattr(services, "geocode", geocode)
    monkeypatch.setattr(services, "get_weather", weather)
    monkeypatch.setattr(get_settings(), "gemini_api_key", "")
    app.dependency_overrides[get_http_client] = http_client
    assert client.post("/api/v1/auth/visitor").status_code == 200
    created = client.post("/api/v1/roteiros/planejar", json={
        "origem_cidade": "Olinda", "origem_uf": "PE", "destino_cidade": "Recife", "destino_uf": "PE",
        "duracao_dias": 3, "perfis": ["cultural", "familia"], "propulsao": "combustao",
        "consumo_km_l": 12, "capacidade_tanque_l": 50, "preco_combustivel_l": 6, "passageiros": 2,
    })
    assert created.status_code == 200
    trip = created.json()["viagem"]
    assert trip["clima"]["sensacao_termica"] == "29 °C"
    assert trip["percurso"]["altimetria"]["sucesso"] is True
    assert trip["percurso"]["custos"]["total_completo"] is False
    assert trip["parametros"]["perfis"] == ["cultural", "familia"]

    stream = client.post("/api/v1/roteiros/stream-guia", json={
        "destino": trip["destino"], "dias_estadia": 3, "estilo_viagem": "cultural, familia",
        "clima_info": trip["clima"],
    })
    assert stream.status_code == 200
    assert stream.headers["content-type"].startswith("text/event-stream")
    assert "event: telemetry" in stream.text
    assert "event: replace" in stream.text
    assert "event: done" in stream.text
    trip_id = trip["id"]
    visit = client.patch(f"/api/v1/roteiros/{trip_id}/visitas", json={"atrativo_id": "atrativo-1", "visitado": True})
    assert visit.json()["atrativos_visitados_ids"] == ["atrativo-1"]
    assert client.patch(f"/api/v1/roteiros/{trip_id}/visitas", json={"atrativo_id": "inexistente", "visitado": True}).status_code == 422
    history = client.get("/api/v1/roteiros/minhas-viagens").json()["viagens"]
    assert history[0]["atrativos_visitados_ids"] == ["atrativo-1"]
    assert history[0]["parametros"]["duracao_dias"] == 3
    assert client.post("/api/v1/auth/logout").status_code == 204
    assert client.post("/api/v1/auth/visitor").status_code == 200
    assert client.get("/api/v1/roteiros/minhas-viagens").json()["viagens"] == []
    assert client.patch(f"/api/v1/roteiros/{trip_id}/visitas", json={"atrativo_id": "atrativo-1", "visitado": False}).status_code == 404


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

    async def fake_guide(destination, *, api_key, timeout_seconds, context):
        assert context["duracao_dias"] == 3
        assert context["perfis"] == ["cultural"]
        assert context["clima"]["temperatura"] == "20 °C"
        assert context["atrativos"] and context["gastronomia"]
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
                },
                {
                    "distance": 1200, "duration": 180,
                    "geometry": {"type": "LineString", "coordinates": [[-34, -8], [-34.5, -9]]},
                },
            ],
        }
        async with httpx.AsyncClient(
            transport=httpx.MockTransport(
                lambda request: httpx.Response(
                    200,
                    json={"results": [{"elevation": 10}, {"elevation": 30}]}
                    if request.method == "POST" else payload,
                )
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
            "duracao_dias": 3,
            "perfis": ["cultural"],
            "propulsao": "combustao",
            "consumo_km_l": 12,
            "capacidade_tanque_l": 10,
            "preco_combustivel_l": 6.19,
            "passageiros": 3,
        },
    )
    assert response.status_code == 200
    percurso = response.json()["viagem"]["percurso"]
    assert percurso["geometria"] == [[-8, -34], [-9, -35]]
    assert percurso["distancia"] == "1.0 km"
    assert percurso["tempo"] == "0h 2min de carro"
    assert len(percurso["alternativas"]) == 1
    alternative = percurso["alternativas"][0]
    assert alternative["altimetria"]["pontos"][-1]["longitude"] == -34.5
    assert alternative["custos"]["custo_propulsao"] == "0.62"
    assert alternative["custos"]["ajuste_relevo"]["status"] == "aplicado"
    assert alternative["custos"]["ajuste_relevo"]["variacao_consumo_percent"] == "0.14"
    assert percurso["altimetria"]["sucesso"] is True
    assert [p["elevacao_m"] for p in percurso["altimetria"]["pontos"]] == [10, 30]
    assert percurso["autonomia"]["sucesso"] is True
    assert percurso["autonomia"]["autonomia_maxima_km"] < 120
    assert percurso["autonomia"]["paradas"]
    assert percurso["autonomia"]["paradas"][0]["origem"] == "projetado"
    assert percurso["autonomia"]["paradas"][0]["estabelecimento_verificado"] is False
    assert percurso["custos"]["custo_propulsao"] == "0.52"
    assert percurso["custos"]["ajuste_relevo"]["status"] == "aplicado"
    assert percurso["custos"]["ajuste_relevo"]["variacao_consumo_percent"] == "0.14"
    assert percurso["custos"]["total_completo"] is False
    assert percurso["custos"]["custo_pedagios"] is None
    assert [c["valor"] for c in percurso["custos"]["rateio"]["cotas"]] == ["0.18", "0.17", "0.17"]
    assert response.json()["viagem"]["telemetria"]["provedores"]["open_elevation"] == "disponivel"
    assert response.json()["viagem"]["parametros"]["duracao_dias"] == 3
    saved = client.get("/api/v1/roteiros/minhas-viagens").json()["viagens"][0]
    assert saved["parametros"]["perfis"] == ["cultural"]
    assert saved["parametros"]["consumo_km_l"] == 12
    assert saved["atrativos_fonte"] == "catalogo_local"
    assert saved["atrativos"][0]["id"] == "atrativo-1"
    assert any(item["categoria"] == "gastronomia" for item in saved["atrativos"])


def test_catalogo_atrativos_nao_confunde_destinos_homonimos() -> None:
    from app.services.atrativos import atrativos_por_destino

    assert atrativos_por_destino("São Paulo", "SP")
    assert atrativos_por_destino("São Paulo", "MG") == []
    assert atrativos_por_destino("São Paulo do Potengi", "RN") == []


def test_historico_legado_recebe_catalogo_sem_alterar_dados(
    client: TestClient, storage: TripStorage
) -> None:
    user = client.post("/api/v1/auth/visitor").json()["usuario"]
    legacy = {"id": "antiga", "destino": "Recife - PE", "atrativos_visitados_ids": ["atrativo-1"]}
    storage.add_for_user(user["id"], legacy, user)
    trip = client.get("/api/v1/roteiros/minhas-viagens").json()["viagens"][0]
    assert trip["atrativos"][0]["id"] == "atrativo-1"
    assert trip["atrativos_visitados_ids"] == ["atrativo-1"]
    assert trip["atrativos_fonte"] == "catalogo_local"
    assert "atrativos" not in storage.list_for_user(user["id"])[0]


def test_parametros_de_planejamento_rejeitam_veiculo_incompativel(client: TestClient) -> None:
    client.post("/api/v1/auth/visitor")
    response = client.post("/api/v1/roteiros/planejar", json={
        "origem_cidade": "Recife", "destino_cidade": "Salvador",
        "propulsao": "eletrico", "consumo_km_l": 12,
        "capacidade_bateria_kwh": 60, "eficiencia_km_kwh": 6,
    })
    assert response.status_code == 422


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
    assert 0 < sess_payload["visitor_remaining_ms"] <= 2 * 60 * 60 * 1000
    sess_again = client.get("/api/v1/auth/session").json()
    assert sess_again["visitor_remaining_ms"] <= sess_payload["visitor_remaining_ms"]

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
    listed_trip = listed.json()["viagens"][0]
    assert {key: listed_trip[key] for key in trip} == trip
    assert listed_trip["atrativos_fonte"] == "catalogo_local"
    assert listed_trip["atrativos"]

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
    from app.schemas.roteiros import PerfilTopografico, StatusAltimetria

    async def delayed_elevation(geometry, client):
        await asyncio.sleep(0.1)
        return PerfilTopografico(sucesso=False, status=StatusAltimetria.INDISPONIVEL)

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
    monkeypatch.setattr(trip_services, "obter_perfil_topografico", delayed_elevation)
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
    durations = response.json()["viagem"]["telemetria"]["duracoes_etapas_ms"]
    assert 0 <= durations["processamento_interno_ms"] < durations["total_servicos_ms"]
    saved = client.get("/api/v1/roteiros/minhas-viagens").json()["viagens"][0]
    assert saved["telemetria"]["duracoes_etapas_ms"] == durations
    percurso = response.json()["viagem"]["percurso"]
    assert percurso.pop("altimetria")["sucesso"] is False
    assert percurso == {
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
                background_tasks=BackgroundTasks(),
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
                background_tasks=BackgroundTasks(),
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


def test_operational_telemetry_requires_session_and_returns_real_numbers(
    client: TestClient,
) -> None:
    unauthorized = client.get("/api/v1/operacao/telemetria")
    assert unauthorized.status_code == 401

    assert client.post("/api/v1/auth/visitor").status_code == 200
    response = client.get("/api/v1/operacao/telemetria")
    assert response.status_code == 200
    payload = response.json()
    assert isinstance(payload["uptime_seconds"], (int, float))
    assert payload["uptime_seconds"] >= 0
    assert isinstance(payload["total_roteiros_persistidos"], int)
    assert payload["total_roteiros_persistidos"] >= 0
    assert payload["requisicoes_http_ativas"] >= 1


def test_session_includes_operational_metrics_for_authenticated_visitor(
    client: TestClient, storage: TripStorage
) -> None:
    no_session = client.get("/api/v1/auth/session")
    assert no_session.status_code == 200
    assert no_session.json()["telemetria_operacional"] is None

    storage.add_for_user(
        "persisted-google-user",
        {"id": "saved-1", "origem": "Recife", "destino": "Natal"},
        {"id": "persisted-google-user", "tipo": "google"},
    )
    assert client.post("/api/v1/auth/visitor").status_code == 200
    session = client.get("/api/v1/auth/session")
    assert session.status_code == 200
    metrics = session.json()["telemetria_operacional"]
    assert isinstance(metrics["uptime_seconds"], (int, float))
    assert metrics["uptime_seconds"] >= 0
    assert metrics["total_roteiros_persistidos"] == 1
    operational = client.get("/api/v1/operacao/telemetria")
    assert operational.status_code == 200
    assert operational.json()["total_roteiros_persistidos"] == 1


def test_global_counter_is_read_only_and_excludes_temporary_trips(tmp_path) -> None:
    path = tmp_path / "trips.json"
    storage = TripStorage(path)
    assert storage.count_all_persisted() == 0
    assert not path.exists()

    storage.ensure_visitor("visitante_demo")
    storage.add_for_user(
        "visitante_demo",
        {"id": "temporary"},
        {"id": "visitante_demo", "tipo": "visitante"},
    )
    assert storage.count_all_persisted() == 0
    assert not path.exists()

    storage.add_for_user(
        "google-demo",
        {"id": "persisted"},
        {"id": "google-demo", "tipo": "google"},
    )
    assert storage.count_all_persisted() == 1


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
