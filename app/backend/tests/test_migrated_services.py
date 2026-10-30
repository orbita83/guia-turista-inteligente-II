from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest

from app.core.circuit_breaker import CircuitBreaker, CircuitState
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
                        "apparent_temperature": 29.0,
                        "relative_humidity_2m": 35,
                        "wind_speed_10m": 12.0,
                        "weather_code": 2,
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
                            "coordinates": [
                                [-34.9, -8.05],
                                [-35.2, -9.1],
                            ],
                        },
                    }
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        weather = await get_weather(client, -8.05, -34.9)
        route = await get_route(client, -8.05, -34.9, -9.1, -35.2)
        unavailable = await get_weather(client, 0, 0)
    assert weather == {
        "temperatura": "28.5 °C",
        "sensacao_termica": "29.0 °C",
        "umidade": "35%",
        "vento": "12.0 km/h",
        "condicao": "Parcialmente nublado",
    }
    assert route == {
        "distancia": "1674.6 km",
        "distancia_km": 1674.6,
        "tempo": "21h 38min de carro",
        "modal": "carro",
        "status": "disponivel",
        "motivo": None,
        "geometria": [[-8.05, -34.9], [-9.1, -35.2]],
        "alternativas": [],
    }
    assert unavailable == {
        "temperatura": "N/D",
        "sensacao_termica": "N/D",
        "umidade": "N/D",
        "vento": "N/D",
        "condicao": "N/D",
    }


@pytest.mark.asyncio
async def test_clima_parcial_preserva_medicoes_validas() -> None:
    payload = {
        "current": {
            "temperature_2m": 25,
            "relative_humidity_2m": 101,
            "wind_speed_10m": 12,
            "weather_code": 999,
        }
    }
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(lambda request: httpx.Response(200, json=payload))
    ) as client:
        weather = await get_weather(client, -8.05, -34.9)
    assert weather == {
        "temperatura": "25.0 °C",
        "sensacao_termica": "N/D",
        "umidade": "N/D",
        "vento": "12.0 km/h",
        "condicao": "N/D",
    }


@pytest.mark.asyncio
async def test_route_requests_full_geojson_geometry_and_real_alternatives() -> None:
    def response(request: httpx.Request) -> httpx.Response:
        assert request.url.params["overview"] == "full"
        assert request.url.params["geometries"] == "geojson"
        assert request.url.params["alternatives"] == "true"
        assert request.url.path.endswith("driving/-34.9,-8.05;-35.2,-9.1")
        return httpx.Response(
            200,
            json={
                "code": "Ok",
                "routes": [
                    {
                        "distance": 1_000,
                        "duration": 60,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[-34.9, -8.05], [-35.0, -8.5]],
                        },
                    },
                    {
                        "distance": 1_200,
                        "duration": 90,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[-34.9, -8.05], [-35.2, -9.1]],
                        },
                    },
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        route = await get_route(client, -8.05, -34.9, -9.1, -35.2)

    assert route == {
        "distancia": "1.0 km",
        "distancia_km": 1.0,
        "tempo": "0h 1min de carro",
        "modal": "carro",
        "status": "disponivel",
        "motivo": None,
        "geometria": [[-8.05, -34.9], [-8.5, -35.0]],
        "alternativas": [
            {
                "geometria": [[-8.05, -34.9], [-9.1, -35.2]],
                "distancia": "1.2 km",
                "distancia_km": 1.2,
                "tempo": "0h 2min de carro",
            }
        ],
    }


@pytest.mark.asyncio
async def test_route_without_osrm_alternatives_returns_empty_list() -> None:
    def response(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            200,
            json={
                "code": "Ok",
                "routes": [
                    {
                        "distance": 1000,
                        "duration": 60,
                        "geometry": {
                            "type": "LineString",
                            "coordinates": [[-34.9, -8.05], [-35.0, -8.5]],
                        },
                    }
                ],
            },
        )

    async with httpx.AsyncClient(transport=httpx.MockTransport(response)) as client:
        route = await get_route(client, -8.05, -34.9, -9.1, -35.2)

    assert route["status"] == "disponivel"
    assert route["alternativas"] == []


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("handler", "expected_reason"),
    [
        (
            lambda request: httpx.Response(200, json={"code": "NoRoute", "routes": []}),
            "sem_rota",
        ),
        (
            lambda request: httpx.Response(
                503, json={"code": "ServiceUnavailable", "routes": []}
            ),
            "falha_http",
        ),
        (
            lambda request: (_ for _ in ()).throw(
                httpx.ReadTimeout("OSRM timeout", request=request)
            ),
            "timeout",
        ),
        (
            lambda request: httpx.Response(200, content=b"not-json"),
            "resposta_malformada",
        ),
        (
            lambda request: httpx.Response(
                200,
                json={
                    "code": "Ok",
                    "routes": [
                        {
                            "distance": 1000,
                            "duration": 60,
                            "geometry": {
                                "type": "LineString",
                                "coordinates": [[-34.9, -8.05], [181, -8.5]],
                            },
                        }
                    ],
                },
            ),
            "geometria_invalida",
        ),
    ],
)
async def test_route_failures_return_explicit_fallback(
    handler, expected_reason: str
) -> None:
    async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as client:
        route = await get_route(client, -8.05, -34.9, -9.1, -35.2)

    assert route == {
        "distancia": "Sem rota direta"
        if expected_reason == "sem_rota"
        else "Rota indisponível",
        "tempo": "Considere voos ou barcos" if expected_reason == "sem_rota" else "N/D",
        "modal": "alternativo",
        "status": "indisponivel",
        "motivo": expected_reason,
        "geometria": [],
        "alternativas": [],
    }


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


def test_storage_updates_visits_atomically_without_cross_user_access(tmp_path) -> None:
    storage_path = tmp_path / "viagens.json"
    storage = TripStorage(storage_path)
    trip = {"id": "trip-1", "atrativos_visitados_ids": []}
    other_trip = {"id": "private-trip", "atrativos_visitados_ids": []}
    storage.add_for_user("google-1", trip, {"id": "google-1", "tipo": "google"})
    storage.add_for_user("google-2", other_trip, {"id": "google-2", "tipo": "google"})

    assert storage.update_attraction_visit("google-1", "trip-1", "poi-1", True) == [
        "poi-1"
    ]
    assert storage.update_attraction_visit("google-1", "trip-1", "poi-1", True) == [
        "poi-1"
    ]
    assert storage.update_attraction_visit("google-1", "trip-1", "poi-1", False) == []
    assert (
        storage.update_attraction_visit("google-1", "private-trip", "poi-2", True)
        is None
    )
    assert storage.list_for_user("google-2") == [other_trip]
    assert TripStorage(storage_path).list_for_user("google-1") == [
        {"id": "trip-1", "atrativos_visitados_ids": []}
    ]

    storage.ensure_visitor("visitante_1")
    storage.add_for_user(
        "visitante_1",
        {"id": "visitor-trip"},
        {"tipo": "visitante"},
    )
    assert storage.update_attraction_visit(
        "visitante_1", "visitor-trip", "poi-visitor", True
    ) == ["poi-visitor"]
    assert storage.list_for_user("visitante_1")[0]["atrativos_visitados_ids"] == [
        "poi-visitor"
    ]


class MemoryStorage:
    def __init__(self) -> None:
        self.trips: list[dict[str, Any]] = []

    def add_for_user(
        self, user_id: str, trip: dict[str, Any], profile: dict[str, Any]
    ) -> None:
        self.trips.insert(0, trip)


def make_breakers(
    weather_threshold: int = 3,
    guide_threshold: int = 2,
    recovery_timeout: float = 30,
) -> dict[str, CircuitBreaker]:
    return {
        "weather": CircuitBreaker(
            "weather",
            failure_threshold=weather_threshold,
            recovery_timeout=recovery_timeout,
        ),
        "guide": CircuitBreaker(
            "guide",
            failure_threshold=guide_threshold,
            recovery_timeout=recovery_timeout,
        ),
    }


def plan_form() -> dict[str, str]:
    return {
        "origem_cidade": "Recife",
        "origem_uf": "PE",
        "destino_cidade": "Salvador",
        "destino_uf": "BA",
    }


async def fixed_geocode(client, city, state, states):
    return (-8.0, -34.0, f"{city} - {state}")


async def fixed_route(
    client,
    latitude_origin,
    longitude_origin,
    latitude_destination,
    longitude_destination,
):
    return {"distancia": "N/D", "tempo": "N/D"}


async def successful_guide(destination, *, api_key, timeout_seconds):
    return "guia válido", {
        "status": "sucesso",
        "modelo": "gemini-3.6-flash",
        "fallback_utilizado": False,
    }


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
            circuit_breakers=make_breakers(),
        )
    assert trip["origem"] == "Recife - PE"
    assert trip["destino"] == "Salvador - BA"
    assert trip["dicas_destino"] == "guia legado"
    assert trip["diagnostico_ia"]["motivo"] == "chave_ausente"
    assert set(trip["telemetria"]["duracoes_etapas_ms"]) == {
        "geocodificacao_origem_ms",
        "geocodificacao_destino_ms",
        "clima_ms",
        "roteamento_ms",
        "guia_ms",
        "total_servicos_ms",
        "processamento_interno_ms",
    }
    assert all(
        duration >= 0 for duration in trip["telemetria"]["duracoes_etapas_ms"].values()
    )
    assert trip["telemetria"]["provedores"]["open_elevation"] == "nao_consultado"
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
                circuit_breakers=make_breakers(),
            )


@pytest.mark.asyncio
async def test_weather_breaker_opens_skips_provider_and_recovers(
    monkeypatch,
) -> None:
    from app.core import circuit_breaker as breaker_module
    from app.services import trips

    now = [100.0]
    monkeypatch.setattr(breaker_module, "monotonic", lambda: now[0])
    monkeypatch.setattr(trips, "geocode", fixed_geocode)
    monkeypatch.setattr(trips, "get_route", fixed_route)
    monkeypatch.setattr(trips, "get_guide_with_diagnostics", successful_guide)
    calls = 0

    def weather_response(request: httpx.Request) -> httpx.Response:
        nonlocal calls
        calls += 1
        if calls < 3:
            return httpx.Response(503)
        return httpx.Response(
            200,
            json={
                "current": {
                    "temperature_2m": 22,
                    "apparent_temperature": 21,
                    "relative_humidity_2m": 60,
                    "wind_speed_10m": 8,
                    "weather_code": 1,
                }
            },
        )

    breakers = make_breakers(weather_threshold=2, recovery_timeout=5)
    storage = MemoryStorage()
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(weather_response)
    ) as client:

        async def make_trip() -> dict[str, Any]:
            return await trips.plan_trip(
                plan_form(),
                {"id": "weather-user"},
                client=client,
                storage=storage,  # type: ignore[arg-type]
                states=STATES,
                gemini_api_key="test-key",
                gemini_timeout_seconds=1,
                circuit_breakers=breakers,
            )

        first = await make_trip()
        second = await make_trip()
        opened_fallback = await make_trip()
        assert calls == 2
        assert breakers["weather"].state == CircuitState.OPEN
        assert first["telemetria"]["provedores"]["open_meteo_weather"] == "indisponivel"
        assert (
            opened_fallback["telemetria"]["provedores"]["open_meteo_weather"]
            == "nao_consultado"
        )
        assert first["clima"] == second["clima"] == opened_fallback["clima"]
        assert opened_fallback["clima"] == {
            "temperatura": "N/D",
            "sensacao_termica": "N/D",
            "umidade": "N/D",
            "vento": "N/D",
            "condicao": "N/D",
        }

        now[0] += 5
        recovered = await make_trip()

    assert calls == 3
    assert recovered["clima"] == {
        "temperatura": "22.0 °C",
        "sensacao_termica": "21.0 °C",
        "umidade": "60%",
        "vento": "8.0 km/h",
        "condicao": "Predominantemente limpo",
    }
    assert breakers["weather"].state == CircuitState.CLOSED
    assert breakers["weather"].failure_count == 0


@pytest.mark.asyncio
async def test_invalid_weather_coordinates_do_not_open_breaker(monkeypatch) -> None:
    from app.services import trips

    async def invalid_geocode(client, city, state, states):
        return (0.0, 0.0, f"{city} - {state}")

    monkeypatch.setattr(trips, "geocode", invalid_geocode)
    monkeypatch.setattr(trips, "get_route", fixed_route)
    monkeypatch.setattr(trips, "get_guide_with_diagnostics", successful_guide)

    def unexpected_weather_request(request: httpx.Request) -> httpx.Response:
        raise AssertionError("Invalid coordinates must not call Open-Meteo")

    breakers = make_breakers()
    async with httpx.AsyncClient(
        transport=httpx.MockTransport(unexpected_weather_request)
    ) as client:
        trip = await trips.plan_trip(
            plan_form(),
            {"id": "invalid-weather-user"},
            client=client,
            storage=MemoryStorage(),  # type: ignore[arg-type]
            states=STATES,
            gemini_api_key="test-key",
            gemini_timeout_seconds=1,
            circuit_breakers=breakers,
        )

    assert trip["clima"] == {
        "temperatura": "N/D",
        "sensacao_termica": "N/D",
        "umidade": "N/D",
        "vento": "N/D",
        "condicao": "N/D",
    }
    assert trip["telemetria"]["provedores"]["open_meteo_weather"] == "nao_consultado"
    assert trip["telemetria"]["provedores"]["osrm"] == "nao_consultado"
    assert breakers["weather"].state == CircuitState.CLOSED
    assert breakers["weather"].failure_count == 0


@pytest.mark.asyncio
async def test_guide_breaker_opens_uses_fallback_and_recovers(monkeypatch) -> None:
    from app.core import circuit_breaker as breaker_module
    from app.services import guide, trips

    now = [100.0]
    monkeypatch.setattr(breaker_module, "monotonic", lambda: now[0])
    monkeypatch.setattr(trips, "geocode", fixed_geocode)
    monkeypatch.setattr(trips, "get_weather", lambda *args: _weather_success())
    monkeypatch.setattr(trips, "get_route", fixed_route)
    calls = 0

    def guide_request(destination: str, api_key: str, timeout_seconds: float) -> str:
        nonlocal calls
        calls += 1
        if calls < 3:
            raise httpx.ConnectError("provider unavailable")
        return (
            "📍 Pontos turísticos\nPraça e museu.\n\n"
            "🍽️ Culinária\nPrato regional.\n\n"
            "💡 Dica de ouro\nConfirme informações locais."
        )

    monkeypatch.setattr(guide, "_request_guide", guide_request)
    breakers = make_breakers(guide_threshold=2, recovery_timeout=5)
    storage = MemoryStorage()

    async with httpx.AsyncClient() as client:

        async def make_trip() -> dict[str, Any]:
            return await trips.plan_trip(
                plan_form(),
                {"id": "guide-user"},
                client=client,
                storage=storage,  # type: ignore[arg-type]
                states=STATES,
                gemini_api_key="test-key",
                gemini_timeout_seconds=1,
                circuit_breakers=breakers,
            )

        first = await make_trip()
        second = await make_trip()
        opened_fallback = await make_trip()

        assert calls == 2
        assert breakers["guide"].state == CircuitState.OPEN
        assert first["diagnostico_ia"]["motivo"] == "falha_rede"
        assert second["diagnostico_ia"]["motivo"] == "falha_rede"
        assert opened_fallback["diagnostico_ia"]["motivo"] == "circuito_aberto"
        assert first["telemetria"]["provedores"]["gemini"] == "indisponivel"
        assert opened_fallback["telemetria"]["provedores"]["gemini"] == "nao_consultado"
        assert opened_fallback["dicas_destino"].startswith("🧭 Guia de contingência")

        now[0] += 5
        recovered = await make_trip()

    assert calls == 3
    assert recovered["diagnostico_ia"] == {
        "status": "sucesso",
        "modelo": "gemini-3.6-flash",
        "fallback_utilizado": False,
    }
    assert breakers["guide"].state == CircuitState.CLOSED
    assert breakers["guide"].failure_count == 0


async def _weather_success() -> dict[str, str]:
    return {
        "temperatura": "20 °C",
        "sensacao_termica": "19 °C",
        "umidade": "50%",
        "vento": "5 km/h",
        "condicao": "Céu limpo",
    }


@pytest.mark.asyncio
async def test_missing_guide_key_does_not_count_as_provider_failure(
    monkeypatch,
) -> None:
    from app.services import guide, trips

    def unexpected_guide_request(
        destination: str, api_key: str, timeout_seconds: float
    ) -> str:
        raise AssertionError("Gemini must not be called without an API key")

    monkeypatch.setattr(guide, "_request_guide", unexpected_guide_request)
    monkeypatch.setattr(trips, "geocode", fixed_geocode)
    monkeypatch.setattr(trips, "get_weather", lambda *args: _weather_success())
    monkeypatch.setattr(trips, "get_route", fixed_route)
    breakers = make_breakers()

    async with httpx.AsyncClient() as client:
        for _ in range(3):
            trip = await trips.plan_trip(
                plan_form(),
                {"id": "missing-key-user"},
                client=client,
                storage=MemoryStorage(),  # type: ignore[arg-type]
                states=STATES,
                gemini_api_key=" ",
                gemini_timeout_seconds=1,
                circuit_breakers=breakers,
            )

    assert trip["diagnostico_ia"]["motivo"] == "chave_ausente"
    assert trip["telemetria"]["provedores"]["gemini"] == "nao_consultado"
    assert breakers["guide"].state == CircuitState.CLOSED
    assert breakers["guide"].failure_count == 0


@pytest.mark.asyncio
async def test_cancelled_weather_call_does_not_count_as_breaker_failure(
    monkeypatch,
) -> None:
    from app.services import trips

    started = asyncio.Event()
    never_release = asyncio.Event()
    stored = MemoryStorage()

    async def slow_weather(client, latitude, longitude):
        started.set()
        await never_release.wait()
        return {"temperatura": "20 °C", "umidade": "50%", "vento": "5 km/h"}

    monkeypatch.setattr(trips, "geocode", fixed_geocode)
    monkeypatch.setattr(trips, "get_weather", slow_weather)
    monkeypatch.setattr(trips, "get_route", fixed_route)
    breakers = make_breakers()

    async with httpx.AsyncClient() as client:
        planning = asyncio.create_task(
            trips.plan_trip(
                plan_form(),
                {"id": "cancelled-weather-user"},
                client=client,
                storage=stored,  # type: ignore[arg-type]
                states=STATES,
                gemini_api_key="test-key",
                gemini_timeout_seconds=1,
                circuit_breakers=breakers,
            )
        )
        await started.wait()
        planning.cancel()
        with pytest.raises(asyncio.CancelledError):
            await planning

    assert breakers["weather"].state == CircuitState.CLOSED
    assert breakers["weather"].failure_count == 0
    assert stored.trips == []


@pytest.mark.asyncio
async def test_cancelled_guide_call_does_not_count_as_breaker_failure(
    monkeypatch,
) -> None:
    import threading

    from app.services import guide, trips

    started = threading.Event()
    release = threading.Event()
    finished = threading.Event()
    stored = MemoryStorage()

    def blocked_guide_request(
        destination: str, api_key: str, timeout_seconds: float
    ) -> str:
        started.set()
        release.wait()
        finished.set()
        return "guia cancelado"

    async def successful_weather(client, latitude, longitude):
        return {"temperatura": "20 °C", "umidade": "50%", "vento": "5 km/h"}

    monkeypatch.setattr(guide, "_request_guide", blocked_guide_request)
    monkeypatch.setattr(trips, "geocode", fixed_geocode)
    monkeypatch.setattr(trips, "get_weather", successful_weather)
    monkeypatch.setattr(trips, "get_route", fixed_route)
    breakers = make_breakers()

    async with httpx.AsyncClient() as client:
        planning = asyncio.create_task(
            trips.plan_trip(
                plan_form(),
                {"id": "cancelled-guide-user"},
                client=client,
                storage=stored,  # type: ignore[arg-type]
                states=STATES,
                gemini_api_key="test-key",
                gemini_timeout_seconds=2,
                circuit_breakers=breakers,
            )
        )
        assert await asyncio.to_thread(started.wait, 1)
        planning.cancel()
        with pytest.raises(asyncio.CancelledError):
            await planning
        release.set()

    assert await asyncio.to_thread(finished.wait, 1)
    assert breakers["guide"].state == CircuitState.CLOSED
    assert breakers["guide"].failure_count == 0
    assert stored.trips == []


@pytest.mark.asyncio
async def test_concurrent_plans_update_shared_breaker_without_lost_failures(
    monkeypatch,
) -> None:
    from app.services import trips

    started = 0
    all_started = asyncio.Event()

    async def concurrent_fallback_weather(client, latitude, longitude):
        nonlocal started
        started += 1
        if started == 3:
            all_started.set()
        await all_started.wait()
        return {
            "temperatura": "N/D",
            "sensacao_termica": "N/D",
            "umidade": "N/D",
            "vento": "N/D",
            "condicao": "N/D",
        }

    monkeypatch.setattr(trips, "geocode", fixed_geocode)
    monkeypatch.setattr(trips, "get_weather", concurrent_fallback_weather)
    monkeypatch.setattr(trips, "get_route", fixed_route)
    monkeypatch.setattr(trips, "get_guide_with_diagnostics", successful_guide)
    breakers = make_breakers(weather_threshold=3)

    async with httpx.AsyncClient() as client:
        await asyncio.gather(
            *(
                trips.plan_trip(
                    plan_form(),
                    {"id": f"concurrent-user-{index}"},
                    client=client,
                    storage=MemoryStorage(),  # type: ignore[arg-type]
                    states=STATES,
                    gemini_api_key="test-key",
                    gemini_timeout_seconds=1,
                    circuit_breakers=breakers,
                )
                for index in range(3)
            )
        )

    assert started == 3
    assert breakers["weather"].total_calls == 3
    assert breakers["weather"].failure_count == 3
    assert breakers["weather"].state == CircuitState.OPEN


@pytest.mark.asyncio
async def test_mocked_pipeline_runs_independent_stages_concurrently(
    monkeypatch,
) -> None:
    from app.services import trips

    active = {"geocode": 0, "providers": 0}
    peak = {"geocode": 0, "providers": 0}

    async def measured_stage(name: str) -> None:
        active[name] += 1
        peak[name] = max(peak[name], active[name])
        try:
            await asyncio.sleep(0.3)
        finally:
            active[name] -= 1

    async def delayed_geocode(client, city, state, states):
        await measured_stage("geocode")
        return (-8.0, -34.0, f"{city} - {state}")

    async def delayed_weather(client, latitude, longitude):
        await measured_stage("providers")
        return {"temperatura": "20 °C", "umidade": "50%", "vento": "5 km/h"}

    async def delayed_route(
        client,
        latitude_origin,
        longitude_origin,
        latitude_destination,
        longitude_destination,
    ):
        await measured_stage("providers")
        return {"distancia": "100 km", "tempo": "2h"}

    monkeypatch.setattr(trips, "geocode", delayed_geocode)
    monkeypatch.setattr(trips, "get_weather", delayed_weather)
    monkeypatch.setattr(trips, "get_route", delayed_route)
    monkeypatch.setattr(trips, "get_guide_with_diagnostics", successful_guide)

    async with httpx.AsyncClient() as client:
        trip = await trips.plan_trip(
            plan_form(),
            {"id": "performance-user"},
            client=client,
            storage=MemoryStorage(),  # type: ignore[arg-type]
            states=STATES,
            gemini_api_key="test-key",
            gemini_timeout_seconds=1,
            circuit_breakers=make_breakers(),
        )

    assert peak == {"geocode": 2, "providers": 2}
    assert trip["origem"] == "Recife - PE"
    assert trip["destino"] == "Salvador - BA"
