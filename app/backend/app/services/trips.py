"""Casos de uso de viagem extraídos da rota Flask existente."""

import asyncio
import re
import uuid
from collections.abc import Awaitable
from datetime import UTC, datetime
from time import perf_counter
from typing import Any, TypeVar

import httpx

from app.core.storage import TripStorage
from app.services.guide import get_guide_with_diagnostics
from app.services.integrations import (
    _valid_coordinates,
    geocode,
    get_route,
    get_weather,
)

T = TypeVar("T")


async def _timed(operation: Awaitable[T]) -> tuple[T, float]:
    started = perf_counter()
    result = await operation
    return result, round((perf_counter() - started) * 1000, 3)


class InvalidTripInput(ValueError):
    """Entrada obrigatória para o planejamento não informada."""


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
) -> dict[str, Any]:
    """Planeja e persiste uma viagem usando as mesmas integrações e respostas do Flask."""
    pipeline_started = perf_counter()
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
    weather: dict[str, str] = {"temperatura": "N/D", "umidade": "N/D", "vento": "N/D"}
    route: dict[str, str] = {"distancia": "N/D", "tempo": "N/D"}

    geocoding_started = perf_counter()
    (
        (origin_coords, origin_ms),
        (destination_coords, destination_ms),
    ) = await asyncio.gather(
        _timed(geocode(client, origin_city, origin_state, states)),
        _timed(geocode(client, destination_city, destination_state, states)),
    )
    geocoding_ms = round((perf_counter() - geocoding_started) * 1000, 3)
    latitude_origin, longitude_origin, resolved_origin = origin_coords
    latitude_destination, longitude_destination, resolved_destination = (
        destination_coords
    )
    if resolved_origin:
        origin_name = resolved_origin
    if resolved_destination:
        destination_name = resolved_destination

    (weather_result, weather_ms), (route_result, route_ms) = await asyncio.gather(
        _timed(get_weather(client, latitude_destination, longitude_destination)),
        _timed(
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

    (guide, diagnostics), guide_ms = await _timed(
        get_guide_with_diagnostics(
            destination_name,
            api_key=gemini_api_key,
            timeout_seconds=gemini_timeout_seconds,
        )
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
    }
    await asyncio.to_thread(storage.add_for_user, user_id, trip, user)
    weather_executed = _valid_coordinates(latitude_destination, longitude_destination)
    route_executed = weather_executed and _valid_coordinates(
        latitude_origin, longitude_origin
    )
    guide_executed = diagnostics.get("motivo") != "chave_ausente"
    weather_values = [
        weather_result.get(key) for key in ("temperatura", "umidade", "vento")
    ]
    weather_state = (
        "sucesso"
        if all(isinstance(value, str) and value != "N/D" for value in weather_values)
        else "fallback"
        if weather_values == ["N/D", "N/D", "N/D"]
        else "desconhecido"
    )
    route_state = {"carro": "sucesso", "alternativo": "fallback"}.get(
        route_result.get("modal", ""), "desconhecido"
    )
    # TODO(integracao): alinhar o contrato de telemetria e a exibição dos tempos
    # com os Alunos 1 e 4; Open-Elevation só terá diagnóstico após sua integração.
    telemetry = {
        "pipeline_ms": round((perf_counter() - pipeline_started) * 1000, 3),
        "geocodificacao": {
            "duracao_ms": geocoding_ms,
            "origem_ms": origin_ms,
            "destino_ms": destination_ms,
        },
        "provedores": {
            "open-meteo": {
                "estado": weather_state if weather_executed else "nao_executado",
                "duracao_ms": weather_ms if weather_executed else None,
            },
            "osrm": {
                "estado": route_state if route_executed else "nao_executado",
                "duracao_ms": route_ms if route_executed else None,
            },
            "gemini": {
                "estado": diagnostics.get("status", "desconhecido")
                if guide_executed
                else "nao_executado",
                "duracao_ms": guide_ms if guide_executed else None,
            },
            "open-elevation": {"estado": "nao_executado", "duracao_ms": None},
        },
    }
    return {**trip, "telemetria": telemetry}


def list_trips(storage: TripStorage, user_id: str) -> list[dict[str, Any]]:
    return storage.list_for_user(user_id)


def delete_trip(storage: TripStorage, user_id: str, trip_id: str) -> bool:
    return storage.delete_for_user(user_id, trip_id)
