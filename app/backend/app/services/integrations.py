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


async def get_weather(
    client: httpx.AsyncClient, latitude: float, longitude: float
) -> dict[str, str]:
    fallback = {"temperatura": "N/D", "umidade": "N/D", "vento": "N/D"}
    if not _valid_coordinates(latitude, longitude):
        return fallback
    try:
        response = await client.get(
            "https://api.open-meteo.com/v1/forecast",
            params={
                "latitude": latitude,
                "longitude": longitude,
                "current": "temperature_2m,relative_humidity_2m,wind_speed_10m",
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
    humidity = _finite_number(current.get("relative_humidity_2m"))
    wind = _finite_number(current.get("wind_speed_10m"))
    if (
        temperature is None
        or humidity is None
        or wind is None
        or not 0 <= humidity <= 100
        or wind < 0
    ):
        return fallback
    return {
        "temperatura": f"{temperature} °C",
        "umidade": f"{humidity:g}%",
        "vento": f"{wind} km/h",
    }


def _parse_osrm_route(value: object) -> dict[str, Any] | None:
    if not isinstance(value, dict):
        return None
    distance = _finite_number(value.get("distance"))
    duration = _finite_number(value.get("duration"))
    geometry = value.get("geometry")
    if distance is None or duration is None or distance < 0 or duration < 0:
        return None
    if not isinstance(geometry, dict) or geometry.get("type") != "LineString":
        return None
    coordinates = geometry.get("coordinates")
    if not isinstance(coordinates, list) or len(coordinates) < 2:
        return None
    points: list[list[float]] = []
    for point in coordinates:
        if not isinstance(point, list) or len(point) != 2:
            return None
        longitude, latitude = map(_finite_number, point)
        if (
            latitude is None
            or longitude is None
            or not (-90 <= latitude <= 90 and -180 <= longitude <= 180)
        ):
            return None
        points.append([latitude, longitude])
    hours, minutes = divmod(math.floor(duration / 60 + 0.5), 60)
    return {
        "distancia": f"{round(distance / 1000, 1)} km",
        "tempo": f"{hours}h {minutes}min de carro",
        "modal": "carro",
        "geometria": points,
    }


async def get_route(
    client: httpx.AsyncClient,
    latitude_origin: float,
    longitude_origin: float,
    latitude_destination: float,
    longitude_destination: float,
) -> dict[str, Any]:
    def unavailable(reason: str) -> dict[str, Any]:
        return {
            "distancia": "N/D",
            "tempo": "N/D",
            "modal": "indisponivel",
            "estado": "indisponivel",
            "motivo": reason,
        }

    if not (
        _valid_coordinates(latitude_origin, longitude_origin)
        and _valid_coordinates(latitude_destination, longitude_destination)
    ):
        return unavailable("coordenadas_invalidas")
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
    except (httpx.HTTPError, ValueError):
        return unavailable("erro_provedor")
    if not isinstance(data, dict) or data.get("code") != "Ok":
        return unavailable(
            "sem_rota"
            if isinstance(data, dict) and data.get("code") == "NoRoute"
            else "erro_provedor"
        )
    routes = data.get("routes")
    if not isinstance(routes, list) or not routes or not isinstance(routes[0], dict):
        return unavailable("sem_rota")
    principal = _parse_osrm_route(routes[0])
    if principal is None:
        return unavailable("dados_rota_invalidos")
    principal["estado"] = "disponivel"
    principal["alternativas"] = [
        route for item in routes[1:] if (route := _parse_osrm_route(item)) is not None
    ]
    return principal
