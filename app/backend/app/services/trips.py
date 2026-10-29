"""Casos de uso de viagem extraídos da rota Flask existente."""

import asyncio
import re
import uuid
from collections.abc import Awaitable
from datetime import UTC, datetime
from time import perf_counter
from typing import Any, TypeVar

import httpx

from app.core.circuit_breaker import CircuitBreaker
from app.core.storage import TripStorage
from app.services.guide import (
    fallback_guide_with_diagnostics,
    get_guide_with_diagnostics,
)
from app.services.integrations import (
    WEATHER_FALLBACK,
    geocode,
    get_route,
    get_weather,
    weather_result_is_failure,
)


class InvalidTripInput(ValueError):
    """Entrada obrigatória para o planejamento não informada."""


T = TypeVar("T")


async def _measure(awaitable: Awaitable[T]) -> tuple[T, float]:
    started_at = perf_counter()
    result = await awaitable
    return result, round((perf_counter() - started_at) * 1000, 3)


def _coordinates_available(coordinates: tuple[float, float, str]) -> bool:
    latitude, longitude, _ = coordinates
    return (
        -90 <= latitude <= 90
        and -180 <= longitude <= 180
        and (latitude, longitude) != (0.0, 0.0)
    )


def sanitize_input(text: str, max_length: int = 80) -> str:
    text = re.sub(r"<[^>]*>", "", text)
    text = re.sub(r"[\x00-\x1F\x7F]", "", text)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:max_length]


async def plan_trip(
    form: dict[str, str],
    user: dict[str, Any],
    *,
    client: httpx.AsyncClient,
    storage: TripStorage,
    states: dict[str, str],
    gemini_api_key: str,
    gemini_timeout_seconds: float,
    circuit_breakers: dict[str, CircuitBreaker],
) -> dict[str, Any]:
    """Planeja e persiste uma viagem usando as mesmas integrações e respostas do Flask."""
    planning_started_at = perf_counter()
    user_id = str(user["id"])
    origin_city = (
        sanitize_input(form.get("origem_cidade", "")) or form.get("origem_cidade", "")
    ).strip()
    origin_state = form.get("origem_uf", "").strip().upper()
    destination_city = (
        sanitize_input(form.get("destino_cidade", "")) or form.get("destino_cidade", "")
    ).strip()
    destination_state = form.get("destino_uf", "").strip().upper()
    if not origin_city or not destination_city:
        raise InvalidTripInput("origem_e_destino_obrigatorios")

    origin_name = f"{origin_city} - {origin_state}" if origin_state else origin_city
    destination_name = (
        f"{destination_city} - {destination_state}"
        if destination_state
        else destination_city
    )
    weather: dict[str, str] = dict(WEATHER_FALLBACK)
    route: dict[str, Any] = {
        "distancia": "Sem rota direta",
        "tempo": "Considere voos ou barcos",
        "modal": "alternativo",
        "status": "indisponivel",
        "motivo": "nao_consultada",
        "geometria": [],
        "alternativas": [],
    }

    (
        (origin_coords, origin_geocoding_ms),
        (
            destination_coords,
            destination_geocoding_ms,
        ),
    ) = await asyncio.gather(
        _measure(geocode(client, origin_city, origin_state, states)),
        _measure(geocode(client, destination_city, destination_state, states)),
    )
    latitude_origin, longitude_origin, resolved_origin = origin_coords
    latitude_destination, longitude_destination, resolved_destination = (
        destination_coords
    )
    if resolved_origin:
        origin_name = resolved_origin
    if resolved_destination:
        destination_name = resolved_destination

    weather_called = False

    async def measured_weather() -> dict[str, str]:
        nonlocal weather_called
        weather_called = _coordinates_available(destination_coords)
        return await get_weather(client, latitude_destination, longitude_destination)

    (weather_result, weather_ms), (route_result, route_ms) = await asyncio.gather(
        _measure(
            circuit_breakers["weather"].call(
                measured_weather,
                fallback=dict(WEATHER_FALLBACK),
                is_failure=lambda result: weather_result_is_failure(
                    result, latitude_destination, longitude_destination
                ),
            ),
        ),
        _measure(
            get_route(
                client,
                latitude_origin,
                longitude_origin,
                latitude_destination,
                longitude_destination,
            )
        ),
    )
    if weather_result:
        weather = weather_result
    if route_result:
        route = route_result

    # TODO: adicionar ao contexto do guia os dados turísticos estruturados quando
    # a origem e o formato de atrativos e gastronomia estiverem acordados.
    guide_called = False

    async def measured_guide() -> tuple[str, dict[str, Any]]:
        nonlocal guide_called
        guide_called = bool(gemini_api_key.strip())
        return await get_guide_with_diagnostics(
            destination_name,
            api_key=gemini_api_key,
            timeout_seconds=gemini_timeout_seconds,
        )

    (guide, diagnostics), guide_ms = await _measure(
        circuit_breakers["guide"].call(
            measured_guide,
            fallback=lambda: fallback_guide_with_diagnostics(
                destination_name, "circuito_aberto"
            ),
            is_failure=lambda result: (
                result[1].get("fallback_utilizado") is True
                and result[1].get("motivo")
                not in {
                    "chave_ausente",
                    "chave_invalida",
                    "acesso_negado",
                    "requisicao_ou_chave_invalida",
                }
            ),
        ),
    )
    geocoding_available = _coordinates_available(origin_coords) and (
        _coordinates_available(destination_coords)
    )
    weather_status = (
        "nao_consultado"
        if not weather_called
        else (
            "indisponivel"
            if weather_result_is_failure(
                weather_result, latitude_destination, longitude_destination
            )
            else "disponivel"
        )
    )
    route_status = (
        "nao_consultado"
        if not geocoding_available
        else "disponivel"
        if isinstance(route_result, dict) and route_result.get("status") == "disponivel"
        else "indisponivel"
    )
    guide_status = (
        "nao_consultado"
        if not guide_called
        else "indisponivel"
        if diagnostics.get("fallback_utilizado") is True
        else "disponivel"
    )
    stage_durations = {
        "geocodificacao_origem_ms": origin_geocoding_ms,
        "geocodificacao_destino_ms": destination_geocoding_ms,
        "clima_ms": weather_ms,
        "roteamento_ms": route_ms,
        "guia_ms": guide_ms,
    }
    stage_durations["total_servicos_ms"] = round(
        (perf_counter() - planning_started_at) * 1000, 3
    )
    trip = {
        "id": str(uuid.uuid4()),
        "criado_em": datetime.now(UTC).isoformat(),
        "origem": origin_name,
        "destino": destination_name,
        "clima": weather,
        "percurso": route,
        "dicas_destino": guide,
        "diagnostico_ia": diagnostics,
        "telemetria": {
            "duracoes_etapas_ms": stage_durations,
            "provedores": {
                "open_meteo_geocoding": (
                    "disponivel" if geocoding_available else "indisponivel"
                ),
                "open_meteo_weather": weather_status,
                "osrm": route_status,
                "gemini": guide_status,
                # TODO: integrar os serviços de elevação, autonomia, postos e custos
                # usando os parâmetros de viagem e veículo do contrato.
                "open_elevation": "nao_integrado",
            },
        },
    }
    await asyncio.to_thread(storage.add_for_user, user_id, trip, user)
    return trip


def list_trips(storage: TripStorage, user_id: str) -> list[dict[str, Any]]:
    return storage.list_for_user(user_id)


def delete_trip(storage: TripStorage, user_id: str, trip_id: str) -> bool:
    return storage.delete_for_user(user_id, trip_id)
