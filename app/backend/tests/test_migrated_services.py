from __future__ import annotations

from typing import Any

import httpx
import pytest

from app.core.storage import TripStorage
from app.services.integrations import (
    geocode,
    get_route,
    get_weather,
    state_abbreviation,
    verify_google_token,
)
from app.services.trips import InvalidTripInput, plan_trip, sanitize_input

STATES = {"PE": "Pernambuco", "PI": "Piauí", "BA": "Bahia"}


@pytest.mark.parametrize(
    "key,value,expected",
    [
        ("GEMINI_TIMEOUT_SEGUNDOS", "6", 6.0),
        ("GEMINI_TIMEOUT_SECONDS", "8", 8.0),
        ("GEMINI_TIMEOUT_SEGUNDOS", "invalid", 60.0),
        ("GEMINI_TIMEOUT_SECONDS", "121", 60.0),
    ],
)
def test_settings_preserve_legacy_and_current_timeout_environment(
    monkeypatch: pytest.MonkeyPatch, key: str, value: str, expected: float
) -> None:
    from app.core.config import Settings

    monkeypatch.delenv("GEMINI_TIMEOUT_SEGUNDOS", raising=False)
    monkeypatch.delenv("GEMINI_TIMEOUT_SECONDS", raising=False)
    monkeypatch.setenv(key, value)
    assert Settings(_env_file=None).gemini_timeout_seconds == expected  # type: ignore[call-arg]


def test_settings_copy_legacy_trip_file_without_removing_source(tmp_path) -> None:
    from app.core.config import Settings

    legacy_file = tmp_path / "legacy" / "viagens.json"
    backend_file = tmp_path / "backend" / "static" / "data" / "viagens.json"
    legacy_file.parent.mkdir(parents=True)
    legacy_file.write_text('{"usuarios":{},"total_roteiros":0}', encoding="utf-8")

    settings = Settings(  # type: ignore[call-arg]
        _env_file=None,
        trips_file=backend_file,
        legacy_trips_file=legacy_file,
    )
    settings.migrate_legacy_trips_file()

    assert backend_file.read_text(encoding="utf-8") == legacy_file.read_text(
        encoding="utf-8"
    )
    assert legacy_file.exists()


def test_state_abbreviation_preserves_accent_insensitive_matching() -> None:
    assert state_abbreviation("Piaui", "RJ", STATES) == "PI"
    assert state_abbreviation("PI", "RJ", STATES) == "PI"
    assert state_abbreviation("unknown", "BA", STATES) == "BA"
    assert state_abbreviation("unknown", "XX", STATES) == "XX"


@pytest.mark.asyncio
async def test_verify_google_token_checks_audience_and_maps_legacy_fields() -> None:
    def response(request: httpx.Request) -> httpx.Response:
        assert request.url.params["id_token"] == "valid"
        assert request.extensions["timeout"]["connect"] == 4.0
        return httpx.Response(
            200,
            json={"sub": "user-1", "aud": "client", "name": "Ana", "picture": "photo"},
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        result = await verify_google_token(client, " valid ", "client")
        invalid_audience = await verify_google_token(client, "valid", "other")
    assert result is not None
    assert result["id"] == "user-1"
    assert result["nome"] == "Ana"
    assert result["foto"] == "photo"
    assert invalid_audience is None


@pytest.mark.asyncio
async def test_geocode_prioritizes_brazilian_result_matching_uf() -> None:
    payload = {
        "results": [
            {
                "name": "Recife",
                "latitude": -8.0,
                "longitude": -34.0,
                "country_code": "BR",
                "admin1": "Bahia",
            },
            {
                "name": "Recife",
                "latitude": -8.1,
                "longitude": -34.9,
                "country_code": "BR",
                "admin1": "Pernambuco",
            },
        ]
    }

    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    ) as client:
        assert await geocode(client, "Recife", "PE", STATES) == (
            -8.1,
            -34.9,
            "Recife - PE",
        )
        assert await geocode(client, "", "PE", STATES) == (0.0, 0.0, "PE")


@pytest.mark.asyncio
async def test_weather_and_route_retain_legacy_output_shapes() -> None:
    def response(request: httpx.Request) -> httpx.Response:
        if request.url.host == "api.open-meteo.com":
            return httpx.Response(
                200,
                json={
                    "current": {
                        "temperature_2m": 28.5,
                        "relative_humidity_2m": 35,
                        "wind_speed_10m": 12.0,
                    }
                },
            )
        return httpx.Response(
            200,
            json={
                "code": "Ok",
                "routes": [
                    {
                        "distance": 1674600,
                        "duration": 77880,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[-34.9, -8.05], [-35.2, -9.1]],
                        },
                    }
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        weather = await get_weather(client, -8.05, -34.9)
        route = await get_route(client, -8.05, -34.9, -9.1, -35.2)
        unavailable = await get_weather(client, 0, 0)
    assert weather == {"temperatura": "28.5 °C", "umidade": "35%", "vento": "12.0 km/h"}
    assert route == {
        "distancia": "1674.6 km",
        "tempo": "21h 38min de carro",
        "modal": "carro",
        "geometria": [[-8.05, -34.9], [-9.1, -35.2]],
        "estado": "disponivel",
        "alternativas": [],
    }
    assert unavailable == {"temperatura": "N/D", "umidade": "N/D", "vento": "N/D"}


@pytest.mark.asyncio
async def test_osrm_geometria_e_alternativas_reais() -> None:
    def response(request: httpx.Request) -> httpx.Response:
        assert request.url.params["overview"] == "full"
        assert request.url.params["geometries"] == "geojson"
        assert request.url.params["alternatives"] == "true"
        return httpx.Response(
            200,
            json={
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
                        "distance": 2000,
                        "duration": 180,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[-34, -8], [-36, -10]],
                        },
                    },
                    {
                        "distance": 3000,
                        "duration": 180,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[400, 2], [3, 4]],
                        },
                    },
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        result = await get_route(client, -8, -34, -9, -35)
    assert result["geometria"] == [[-8.0, -34.0], [-9.0, -35.0]]
    assert len(result["alternativas"]) == 1
    assert result["alternativas"][0]["geometria"] == [[-8.0, -34.0], [-10.0, -36.0]]


@pytest.mark.parametrize(
    "payload,reason",
    [
        ({"code": "NoRoute"}, "sem_rota"),
        ({"code": "Ok", "routes": []}, "sem_rota"),
        (
            {
                "code": "Ok",
                "routes": [
                    {
                        "distance": 10,
                        "duration": 10,
                        "geometry": {"type": "LineString", "coordinates": [[1, 2]]},
                    }
                ],
            },
            "dados_rota_invalidos",
        ),
    ],
)
@pytest.mark.asyncio
async def test_osrm_indisponivel_sem_geometria_fabricada(payload, reason) -> None:
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    ) as client:
        result = await get_route(client, -8, -34, -9, -35)
    assert result["estado"] == "indisponivel"
    assert result["motivo"] == reason
    assert "geometria" not in result


@pytest.mark.asyncio
async def test_osrm_erro_http_fica_indisponivel() -> None:
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(503))
    ) as client:
        result = await get_route(client, -8, -34, -9, -35)
    assert result["motivo"] == "erro_provedor"
    assert "geometria" not in result


def test_sanitize_input_matches_legacy_cleanup_and_limit() -> None:
    assert sanitize_input("  <b>Recife</b>\n  PE\x00") == "Recife PE"
    assert len(sanitize_input("x" * 100)) == 80


def test_storage_keeps_visitor_in_memory_and_persistent_user_isolated(tmp_path) -> None:
    storage = TripStorage(tmp_path / "viagens.json")
    visitor = {"id": "v-1", "origem": "A", "destino": "B"}
    google = {"id": "g-1", "origem": "C", "destino": "D"}
    storage.ensure_visitor("visitante_123")
    storage.add_for_user("visitante_123", visitor, {"tipo": "visitante"})
    storage.add_for_user("google-1", google, {"id": "google-1", "tipo": "google"})

    assert storage.list_for_user("visitante_123") == [visitor]
    assert storage.list_for_user("google-1") == [google]
    assert storage.list_for_user("other-user") == []
    assert storage.all_data()["total_roteiros"] == 1

    storage.forget_visitor("visitante_123")
    assert storage.list_for_user("visitante_123") == []


class MemoryStorage:
    def __init__(self) -> None:
        self.trips: list[dict[str, Any]] = []

    def add_for_user(
        self, user_id: str, trip: dict[str, Any], profile: dict[str, Any]
    ) -> None:
        self.trips.insert(0, trip)


@pytest.mark.asyncio
async def test_plan_trip_keeps_trip_fields_and_persists_result(monkeypatch) -> None:
    from app.services import trips

    async def fake_geocode(client, city, state, states):
        return (-8.0, -34.0, f"{city} - {state}")

    async def fake_weather(client, lat, lon):
        return {"temperatura": "N/D", "umidade": "N/D", "vento": "N/D"}

    async def fake_route(client, lat_o, lon_o, lat_d, lon_d):
        return {"distancia": "N/D", "tempo": "N/D"}

    async def fake_guide(destination, *, api_key, timeout_seconds):
        return "guia legado", {
            "status": "fallback",
            "modelo": "gemini-3.6-flash",
            "fallback_utilizado": True,
            "motivo": "chave_ausente",
        }

    monkeypatch.setattr(trips, "geocode", fake_geocode)
    monkeypatch.setattr(trips, "get_weather", fake_weather)
    monkeypatch.setattr(trips, "get_route", fake_route)
    monkeypatch.setattr(trips, "get_guide_with_diagnostics", fake_guide)
    storage = MemoryStorage()
    async with httpx.AsyncClient() as client:
        trip = await plan_trip(
            {
                "origem_cidade": "Recife",
                "origem_uf": "PE",
                "destino_cidade": "Salvador",
                "destino_uf": "BA",
            },
            {"id": "visitor", "tipo": "visitante"},
            client=client,
            storage=storage,  # type: ignore[arg-type]
            states=STATES,
            gemini_api_key="",
            gemini_timeout_seconds=1,
        )
    assert trip["origem"] == "Recife - PE"
    assert trip["destino"] == "Salvador - BA"
    assert trip["dicas_destino"] == "guia legado"
    assert trip["diagnostico_ia"]["motivo"] == "chave_ausente"
    assert storage.trips == [trip]


@pytest.mark.asyncio
async def test_plan_trip_rejects_empty_city_before_network_call() -> None:
    async with httpx.AsyncClient() as client:
        with pytest.raises(InvalidTripInput):
            await plan_trip(
                {"origem_cidade": "", "destino_cidade": "Salvador"},
                {"id": "u1"},
                client=client,
                storage=MemoryStorage(),  # type: ignore[arg-type]
                states=STATES,
                gemini_api_key="",
                gemini_timeout_seconds=1,
            )
