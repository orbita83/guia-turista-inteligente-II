"""Serialização segura de viagens persistidas para GPX 1.1."""

from collections.abc import Mapping
from math import isfinite
from xml.etree.ElementTree import Element, SubElement, tostring

GPX_NAMESPACE = "http://www.topografix.com/GPX/1/1"


def _point(value: object) -> tuple[float, float] | None:
    if isinstance(value, Mapping):
        value = [value.get("latitude"), value.get("longitude")]
    if not isinstance(value, (list, tuple)) or len(value) < 2:
        return None
    lat, lon = value[0], value[1]
    if (
        isinstance(lat, bool)
        or isinstance(lon, bool)
        or not isinstance(lat, (int, float))
        or not isinstance(lon, (int, float))
        or not isfinite(lat)
        or not isfinite(lon)
        or not -90 <= lat <= 90
        or not -180 <= lon < 180
    ):
        return None
    return float(lat), float(lon)


def generate_gpx(trip: dict[str, object], alternative_index: int = -1) -> bytes:
    """Gera GPX a partir da geometria armazenada; -1 seleciona a rota principal."""
    route = trip.get("percurso")
    if not isinstance(route, dict):
        raise TypeError("A viagem não possui dados de percurso.")
    selected: dict[str, object] = route
    alternatives = route.get("alternativas")
    if alternative_index >= 0:
        if not isinstance(alternatives, list) or alternative_index >= len(alternatives):
            raise ValueError("A alternativa solicitada não existe.")
        candidate = alternatives[alternative_index]
        if not isinstance(candidate, dict):
            raise ValueError("A alternativa solicitada é inválida.")
        selected = candidate

    geometry = selected.get("geometria")
    if not isinstance(geometry, list):
        raise TypeError("Geometria da rota indisponível para exportação GPX.")
    points = [_point(item) for item in geometry]
    if len(points) < 2 or any(point is None for point in points):
        raise ValueError("Geometria da rota inválida para exportação GPX.")
    valid_points = [point for point in points if point is not None]

    import xml.etree.ElementTree as ET

    ET.register_namespace("", GPX_NAMESPACE)
    root = Element(f"{{{GPX_NAMESPACE}}}gpx", {"version": "1.1", "creator": "Guia do Turista Inteligente"})
    metadata = SubElement(root, f"{{{GPX_NAMESPACE}}}metadata")
    SubElement(metadata, f"{{{GPX_NAMESPACE}}}name").text = (
        f"Rota: {trip.get('origem') or 'Origem'} para {trip.get('destino') or 'Destino'}"
    )

    waypoints: list[tuple[tuple[float, float], str]] = [
        (valid_points[0], f"Origem: {trip.get('origem') or 'Origem'}"),
        (valid_points[-1], f"Destino: {trip.get('destino') or 'Destino'}"),
    ]
    autonomy = selected.get("autonomia")
    stops = autonomy.get("paradas") if isinstance(autonomy, dict) else None
    if isinstance(stops, list):
        for stop in stops:
            if not isinstance(stop, dict):
                continue
            coordinates = stop.get("coordenadas")
            point = _point(coordinates)
            if point is not None:
                waypoints.append((point, str(stop.get("nome") or "Parada")))
    for (lat, lon), name in waypoints:
        waypoint = SubElement(root, f"{{{GPX_NAMESPACE}}}wpt", {"lat": str(lat), "lon": str(lon)})
        SubElement(waypoint, f"{{{GPX_NAMESPACE}}}name").text = name

    track = SubElement(root, f"{{{GPX_NAMESPACE}}}trk")
    SubElement(track, f"{{{GPX_NAMESPACE}}}name").text = str(selected.get("titulo") or "Rota")
    segment = SubElement(track, f"{{{GPX_NAMESPACE}}}trkseg")
    profile = selected.get("altimetria")
    elevation_points = profile.get("pontos") if isinstance(profile, dict) and profile.get("sucesso") else None
    elevations: dict[tuple[float, float], float] = {}
    if isinstance(elevation_points, list):
        for sample in elevation_points:
            if not isinstance(sample, dict):
                continue
            point = _point([sample.get("latitude"), sample.get("longitude")])
            elevation = sample.get("elevacao_m")
            if point and isinstance(elevation, (int, float)) and not isinstance(elevation, bool) and isfinite(elevation):
                elevations[point] = float(elevation)
    for lat, lon in valid_points:
        trackpoint = SubElement(segment, f"{{{GPX_NAMESPACE}}}trkpt", {"lat": str(lat), "lon": str(lon)})
        elevation = elevations.get((lat, lon))
        if elevation is None and elevations:
            # Amostras Open-Elevation normalmente não coincidem exatamente com
            # os vértices densos retornados pelo OSRM; associe a amostra mais próxima.
            elevation = min(
                elevations.items(),
                key=lambda item: (item[0][0] - lat) ** 2 + (item[0][1] - lon) ** 2,
            )[1]
        if elevation is not None:
            SubElement(trackpoint, f"{{{GPX_NAMESPACE}}}ele").text = str(elevation)
    return tostring(root, encoding="utf-8", xml_declaration=True)
