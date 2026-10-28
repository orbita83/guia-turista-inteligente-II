"""Casos de uso de viagem extraídos da rota Flask existente."""

import asyncio
import re
import uuid
from datetime import UTC, datetime
from typing import Any

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

    origin_coords, destination_coords = await asyncio.gather(
        geocode(client, origin_city, origin_state, states),
        geocode(client, destination_city, destination_state, states),
    )
    latitude_origin, longitude_origin, resolved_origin = origin_coords
    latitude_destination, longitude_destination, resolved_destination = (
        destination_coords
    )
    if resolved_origin:
        origin_name = resolved_origin
    if resolved_destination:
        destination_name = resolved_destination

    weather_result, route_result = await asyncio.gather(
        circuit_breakers["weather"].call(
            lambda: get_weather(client, latitude_destination, longitude_destination),
            fallback=dict(WEATHER_FALLBACK),
            is_failure=lambda result: weather_result_is_failure(
                result, latitude_destination, longitude_destination
            ),
        ),
        get_route(
            client,
            latitude_origin,
            longitude_origin,
            latitude_destination,
            longitude_destination,
        ),
    )
    if weather_result:
        weather = weather_result
    if route_result:
        route = route_result

    guide, diagnostics = await circuit_breakers["guide"].call(
        lambda: get_guide_with_diagnostics(
            destination_name,
            api_key=gemini_api_key,
            timeout_seconds=gemini_timeout_seconds,
        ),
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
    return trip


def list_trips(storage: TripStorage, user_id: str) -> list[dict[str, Any]]:
    return storage.list_for_user(user_id)


def delete_trip(storage: TripStorage, user_id: str, trip_id: str) -> bool:
    return storage.delete_for_user(user_id, trip_id)
