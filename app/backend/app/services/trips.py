"""Casos de uso de viagem extraídos da rota Flask existente."""

import asyncio
import re
import uuid
from collections.abc import Awaitable
from datetime import UTC, datetime
from decimal import Decimal
from time import perf_counter
from typing import Any, TypeVar

import httpx

from app.core.circuit_breaker import CircuitBreaker
from app.core.storage import TripStorage
from app.schemas.roteiros import AjusteRelevo
from app.services.altimetria_service import obter_perfil_topografico
from app.services.atrativos import atrativos_por_destino, enriquecer_viagem_legada
from app.services.custos_service import calcular_custos_viagem
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
from app.services.postos_service import projetar_paradas_rota


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
    form: dict[str, Any],
    user: dict[str, Any],
    *,
    client: httpx.AsyncClient,
    storage: TripStorage,
    states: dict[str, str],
    gemini_api_key: str,
    gemini_timeout_seconds: float,
    circuit_breakers: dict[str, CircuitBreaker],
    persist: bool = True,
) -> dict[str, Any]:
    """Planeja a viagem; permite ao router adiar a persistência para BackgroundTasks."""
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
            # TODO(integracao): encaminhar preferência de rota ao serviço depois
            # da definição do schema #30 e da interface de roteamento (issue #20).
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
    attractions = atrativos_por_destino(destination_city, destination_state)
    if not attractions and destination_name:
        res_city, sep, res_uf = destination_name.rpartition(" - ")
        if sep:
            attractions = atrativos_por_destino(res_city, res_uf)

    guide_called = False

    async def measured_guide() -> tuple[str, dict[str, Any]]:
        nonlocal guide_called
        guide_called = bool(gemini_api_key.strip())
        context: dict[str, Any] = {key: form[key] for key in ("duracao_dias", "perfis") if key in form}
        if context:
            context["clima"] = weather
            context["atrativos"] = [item["nome"] for item in attractions if item.get("categoria") != "gastronomia"]
            context["gastronomia"] = [item["nome"] for item in attractions if item.get("categoria") == "gastronomia"]
        return await get_guide_with_diagnostics(
            destination_name,
            api_key=gemini_api_key,
            timeout_seconds=gemini_timeout_seconds,
            **({"context": context} if context else {}),
        )

    async def measured_elevations() -> tuple[dict[str, Any] | None, float | None]:
        if route.get("status") != "disponivel":
            return None, None
        alternatives = route.get("alternativas")
        candidates = [route, *(alternatives if isinstance(alternatives, list) else [])]
        semaphore = asyncio.Semaphore(3)

        async def measure_candidate(candidate: Any) -> tuple[dict[str, Any] | None, float | None]:
            geometry = candidate.get("geometria") if isinstance(candidate, dict) else None
            if not isinstance(geometry, list) or len(geometry) < 2:
                return None, None
            async with semaphore:
                profile, elapsed = await _measure(obter_perfil_topografico(geometry, client=client))
            result = profile.model_dump(mode="json")
            candidate["altimetria"] = result
            return result, elapsed

        results = await asyncio.gather(*(measure_candidate(candidate) for candidate in candidates))
        return results[0]

    ((guide, diagnostics), guide_ms), (elevation, elevation_ms) = await asyncio.gather(
        _measure(circuit_breakers["guide"].call(
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
        )),
        measured_elevations(),
    )
    if elevation is not None:
        route["altimetria"] = elevation
    if form.get("propulsao") and route.get("status") == "disponivel":
        vehicle_fields = (
            "propulsao", "consumo_km_l", "capacidade_tanque_l", "preco_combustivel_l",
            "eficiencia_km_kwh", "capacidade_bateria_kwh", "preco_energia_kwh",
        )
        vehicle = {key: form[key] for key in vehicle_fields if key in form}
        candidates = [route, *route.get("alternativas", [])]
        for candidate in candidates:
            geometry = candidate.get("geometria") if isinstance(candidate, dict) else None
            if not isinstance(geometry, list) or len(geometry) < 2:
                continue
            profile = candidate.get("altimetria")
            relief_percent: float | None = None
            relief_adjustment: AjusteRelevo | None = None
            if isinstance(profile, dict) and profile.get("sucesso") is True:
                consumption_data = profile.get("dados_consumo")
                if isinstance(consumption_data, dict):
                    raw_percent = consumption_data.get("penalizacao_consumo_estimada_percent")
                    if isinstance(raw_percent, (int, float)) and not isinstance(raw_percent, bool):
                        relief_percent = float(raw_percent)
                        relief_adjustment = AjusteRelevo(
                            variacao_consumo_percent=Decimal(str(raw_percent)),
                            metodo="estimativa do perfil topografico",
                            fonte="Open-Elevation; modelo estimativo do servico de altimetria",
                            limitacoes="Estimativa de consumo por relevo, nao medicao do veiculo.",
                        )
            result = await asyncio.to_thread(
                projetar_paradas_rota, geometry, vehicle, formato_geometria="latlon",
                penalizacao_relevo_percent=relief_percent or 0.0,
            )
            candidate["autonomia"] = result.model_dump(mode="json")
            distance = candidate.get("distancia_km")
            if isinstance(distance, (int, float)) and not isinstance(distance, bool):
                costs = calcular_custos_viagem(
                    distancia_km=distance,
                    propulsao=vehicle["propulsao"],
                    consumo_km_por_litro=vehicle.get("consumo_km_l"),
                    preco_combustivel_por_litro=vehicle.get("preco_combustivel_l"),
                    eficiencia_km_por_kwh=vehicle.get("eficiencia_km_kwh"),
                    preco_energia_por_kwh=vehicle.get("preco_energia_kwh"),
                    passageiros=form.get("passageiros", 1),
                    ajuste_relevo=relief_adjustment,
                )
                candidate["custos"] = costs.model_dump(mode="json")
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
    if elevation_ms is not None:
        stage_durations["altimetria_ms"] = elevation_ms
    trip = {
        "id": str(uuid.uuid4()),
        "criado_em": datetime.now(UTC).isoformat(),
        "origem": origin_name,
        "destino": destination_name,
        "atrativos": attractions,
        "atrativos_fonte": "catalogo_local",
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
                "open_elevation": (
                    "nao_consultado" if elevation is None else
                    "disponivel" if elevation.get("sucesso") is True else "indisponivel"
                ),
            },
        },
    }
    if any(key in form for key in ('duracao_dias', 'perfis', 'propulsao')):
        trip['parametros'] = form.copy()
    if persist:
        await asyncio.to_thread(storage.add_for_user, user_id, trip, user)
    return trip


def persist_trip(storage: TripStorage, user_id: str, trip: dict[str, Any], user: dict[str, Any]) -> None:
    """Tarefa síncrona executada pelo threadpool de BackgroundTasks do Starlette."""
    storage.add_for_user(user_id, trip, user)


def list_trips(storage: TripStorage, user_id: str) -> list[dict[str, Any]]:
    return [enriquecer_viagem_legada(trip) for trip in storage.list_for_user(user_id)]


def delete_trip(storage: TripStorage, user_id: str, trip_id: str) -> bool:
    return storage.delete_for_user(user_id, trip_id)
