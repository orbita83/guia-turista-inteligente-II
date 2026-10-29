"""Integrações HTTP do projeto, migradas do backend Flask existente."""

import math
import unicodedata
from typing import Any

import httpx


def _normalize(text: str) -> str:
    decomposed = unicodedata.normalize("NFKD", text or "")
    without_marks = "".join(
        char for char in decomposed if not unicodedata.combining(char)
    )
    return without_marks.strip().lower()


def state_abbreviation(
    admin1: str, informed_state: str = "", states: dict[str, str] | None = None
) -> str:
    states = states or {}
    normalized_admin = (admin1 or "").strip()
    normalized_state = (informed_state or "").strip().upper()
    if normalized_admin.upper() in states:
        return normalized_admin.upper()
    normalized_name = _normalize(normalized_admin)
    for abbreviation, name in states.items():
        if _normalize(name) == normalized_name and normalized_name:
            return abbreviation
    if normalized_state in states:
        return normalized_state
    return normalized_state


async def verify_google_token(
    client: httpx.AsyncClient, token: str, google_client_id: str
) -> dict[str, Any] | None:
    """Valida credencial no endpoint tokeninfo e compara a audiência configurada."""
    if not token or not isinstance(token, str) or not token.strip():
        return None
    try:
        response = await client.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": token.strip()},
            timeout=4.0,
        )
        if response.status_code != 200:
            return None
        payload = response.json()
    except (httpx.HTTPError, ValueError):
        return None
    if (
        not isinstance(payload, dict)
        or payload.get("aud") != google_client_id
        or not payload.get("sub")
    ):
        return None
    result = dict(payload)
    result.setdefault("id", result.get("sub", ""))
    result.setdefault("nome", result.get("name", ""))
    result.setdefault("foto", result.get("picture", ""))
    return result


async def geocode(
    client: httpx.AsyncClient,
    city: str,
    state: str = "",
    states: dict[str, str] | None = None,
) -> tuple[float, float, str]:
    states = states or {}
    clean_city = (city or "").strip()
    clean_state = (state or "").strip().upper()
    fallback = (
        f"{clean_city} - {clean_state}".strip(" -") if clean_city else clean_state
    )
    if not clean_city:
        return (0.0, 0.0, fallback)
    try:
        response = await client.get(
            "https://geocoding-api.open-meteo.com/v1/search",
            params={
                "name": clean_city,
                "count": 10,
                "language": "pt",
                "format": "json",
                "country_codes": "BR",
            },
            timeout=4.0,
        )
        if response.status_code != 200:
            return (0.0, 0.0, fallback)
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return (0.0, 0.0, fallback)
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        return (0.0, 0.0, fallback)
    results = data["results"]
    brazil_results = [
        item
        for item in results
        if isinstance(item, dict) and str(item.get("country_code", "")).upper() == "BR"
    ]
    candidates = brazil_results or [item for item in results if isinstance(item, dict)]
    if not candidates:
        return (0.0, 0.0, fallback)
    selected = candidates[0]
    if clean_state in states:
        selected = next(
            (
                item
                for item in candidates
                if state_abbreviation(str(item.get("admin1", "")), states=states)
                == clean_state
            ),
            selected,
        )
    try:
        latitude = float(selected.get("latitude", 0.0))
        longitude = float(selected.get("longitude", 0.0))
    except (TypeError, ValueError):
        return (0.0, 0.0, fallback)
    detected_state = state_abbreviation(
        str(selected.get("admin1", "")), clean_state, states
    )
    name = str(selected.get("name", clean_city))
    formatted_name = f"{name} - {detected_state}" if detected_state else name
    return (latitude, longitude, formatted_name)


def _finite_number(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        return None
    try:
        number = float(value)
    except OverflowError:
        return None
    return number if math.isfinite(number) else None


def _valid_coordinates(latitude: float, longitude: float) -> bool:
    lat = _finite_number(latitude)
    lon = _finite_number(longitude)
    return (
        lat is not None
        and lon is not None
        and -90 <= lat <= 90
        and -180 <= lon <= 180
        and (lat, lon) != (0.0, 0.0)
    )


def _route_geometry(route: dict[str, Any]) -> list[list[float]] | None:
    geometry = route.get("geometry")
    if not isinstance(geometry, dict) or geometry.get("type") != "LineString":
        return None
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None

    points: list[list[float]] = []
    for coordinate in coordinates:
        if not isinstance(coordinate, list) or len(coordinate) != 2:
            return None
        longitude = _finite_number(coordinate[0])
        latitude = _finite_number(coordinate[1])
        if (
            longitude is None
            or latitude is None
            or not -180 <= longitude < 180
            or not -90 <= latitude <= 90
        ):
            return None
        points.append([latitude, longitude])
    return points


def _route_metrics(route: dict[str, Any]) -> tuple[str, str] | None:
    distance = _finite_number(route.get("distance"))
    duration = _finite_number(route.get("duration"))
    if distance is None or duration is None or distance < 0 or duration < 0:
        return None
    total_minutes = math.floor(duration / 60 + 0.5)
    hours, minutes = divmod(total_minutes, 60)
    return (
        f"{round(distance / 1000, 1)} km",
        f"{hours}h {minutes}min de carro",
    )


def _route_fallback(reason: str) -> dict[str, Any]:
    return {
        "distancia": "Sem rota direta" if reason == "sem_rota" else "Rota indisponível",
        "tempo": "Considere voos ou barcos" if reason == "sem_rota" else "N/D",
        "modal": "alternativo",
        "status": "indisponivel",
        "motivo": reason,
        "geometria": [],
        "alternativas": [],
    }


WEATHER_FALLBACK = {
    "temperatura": "N/D",
    "sensacao_termica": "N/D",
    "umidade": "N/D",
    "vento": "N/D",
    "condicao": "N/D",
}

WEATHER_CONDITIONS = {
    0: "Céu limpo",
    1: "Predominantemente limpo",
    2: "Parcialmente nublado",
    3: "Nublado",
    45: "Nevoeiro",
    48: "Nevoeiro com geada",
    51: "Garoa fraca",
    53: "Garoa moderada",
    55: "Garoa intensa",
    56: "Garoa congelante fraca",
    57: "Garoa congelante intensa",
    61: "Chuva fraca",
    63: "Chuva moderada",
    65: "Chuva intensa",
    66: "Chuva congelante fraca",
    67: "Chuva congelante intensa",
    71: "Neve fraca",
    73: "Neve moderada",
    75: "Neve intensa",
    77: "Grãos de neve",
    80: "Pancadas de chuva fracas",
    81: "Pancadas de chuva moderadas",
    82: "Pancadas de chuva violentas",
    85: "Pancadas de neve fracas",
    86: "Pancadas de neve intensas",
    95: "Trovoada",
    96: "Trovoada com granizo fraco",
    99: "Trovoada com granizo intenso",
}


def weather_result_is_failure(
    result: dict[str, str], latitude: float, longitude: float
) -> bool:
    return _valid_coordinates(latitude, longitude) and result == WEATHER_FALLBACK


async def get_weather(
    client: httpx.AsyncClient, latitude: float, longitude: float
) -> dict[str, str]:
    fallback = dict(WEATHER_FALLBACK)
    if not _valid_coordinates(latitude, longitude):
        return fallback
    try:
        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": (
                    "temperature_2m,apparent_temperature,relative_humidity_2m,"
                    "wind_speed_10m,weather_code"
                ),
                "temperature_unit": "celsius",
                "wind_speed_unit": "kmh",
            },
            timeout=4.0,
        )
        response.raise_for_status()
        data = response.json()
    except (httpx.HTTPError, ValueError):
        return fallback
    if not isinstance(data, dict) or not isinstance(data.get("current"), dict):
        return fallback
    current = data["current"]
    temperature = _finite_number(current.get("temperature_2m"))
    apparent_temperature = _finite_number(current.get("apparent_temperature"))
    humidity = _finite_number(current.get("relative_humidity_2m"))
    wind = _finite_number(current.get("wind_speed_10m"))
    weather_code = current.get("weather_code")
    return {
        "temperatura": f"{temperature} °C" if temperature is not None else "N/D",
        "sensacao_termica": f"{apparent_temperature} °C"
        if apparent_temperature is not None
        else "N/D",
        "umidade": f"{humidity:g}%"
        if humidity is not None and 0 <= humidity <= 100
        else "N/D",
        "vento": f"{wind} km/h" if wind is not None and wind >= 0 else "N/D",
        "condicao": WEATHER_CONDITIONS.get(weather_code, "N/D")
        if isinstance(weather_code, int) and not isinstance(weather_code, bool)
        else "N/D",
    }


async def get_route(
    client: httpx.AsyncClient,
    latitude_origin: float,
    longitude_origin: float,
    latitude_destination: float,
    longitude_destination: float,
) -> dict[str, Any]:
    if not (
        _valid_coordinates(latitude_origin, longitude_origin)
        and _valid_coordinates(latitude_destination, longitude_destination)
    ):
        return _route_fallback("coordenadas_invalidas")
    try:
        response = await client.get(
            "https://router.project-osrm.org/route/v1/driving/"
            f"{longitude_origin},{latitude_origin};{longitude_destination},{latitude_destination}",
            params={
                "overview": "full",
                "geometries": "geojson",
                "alternatives": "true",
                "radiuses": "1000;1000",
            },
            timeout=6.0,
        )
        response.raise_for_status()
        data = response.json()
    except httpx.TimeoutException:
        return _route_fallback("timeout")
    except httpx.HTTPStatusError:
        return _route_fallback("falha_http")
    except httpx.HTTPError:
        return _route_fallback("falha_rede")
    except ValueError:
        return _route_fallback("resposta_malformada")
    if not isinstance(data, dict):
        return _route_fallback("resposta_malformada")
    if data.get("code") in {"NoRoute", "NoSegment"}:
        return _route_fallback("sem_rota")
    if data.get("code") != "Ok":
        return _route_fallback("resposta_invalida")
    routes = data.get("routes")
    if not isinstance(routes, list):
        return _route_fallback("resposta_invalida")
    if not routes:
        return _route_fallback("sem_rota")
    primary = routes[0]
    if not isinstance(primary, dict):
        return _route_fallback("resposta_invalida")
    metrics = _route_metrics(primary)
    geometry = _route_geometry(primary)
    if metrics is None:
        return _route_fallback("resposta_invalida")
    if geometry is None:
        return _route_fallback("geometria_invalida")

    alternatives: list[dict[str, Any]] = []
    for route in routes[1:]:
        if not isinstance(route, dict):
            continue
        alternative_metrics = _route_metrics(route)
        alternative_geometry = _route_geometry(route)
        if alternative_metrics is None or alternative_geometry is None:
            continue
        alternatives.append(
            {
                "geometria": alternative_geometry,
                "distancia": alternative_metrics[0],
                "tempo": alternative_metrics[1],
                "distancia_km": route["distance"] / 1000,
            }
        )

    return {
        "distancia": metrics[0],
        "distancia_km": primary["distance"] / 1000,
        "tempo": metrics[1],
        "modal": "carro",
        "status": "disponivel",
        "motivo": None,
        "geometria": geometry,
        "alternativas": alternatives,
    }
