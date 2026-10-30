"""Consulta opcional de locais mapeados dentro do município no OpenStreetMap."""

import json
import logging
import time
from copy import deepcopy
from typing import Any

import httpx

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_cache: dict[tuple[str, str, str], tuple[float, list[dict[str, Any]], str]] = {}


def _query(city: str, state: str) -> str:
    """Seleciona primeiro o estado e então a área municipal, nunca um raio arbitrário."""
    quoted_city = json.dumps(city, ensure_ascii=False)
    quoted_state = json.dumps(state, ensure_ascii=False)
    if state == "Distrito Federal" or city.strip().casefold() in {"brasília", "brasilia"}:
        return (
            '[out:json][timeout:5];'
            f'area["boundary"="administrative"]["admin_level"="4"]["name"={quoted_state}]->.municipio;'
            '.municipio out ids;'
            'nwr(area.municipio)["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"];out center 25;'
            'nwr(area.municipio)["historic"~"^(monument|memorial|archaeological_site|castle)$"]["name"];out center 25;'
            'nwr(area.municipio)["amenity"="restaurant"]["name"];out center 25;'
        )
    return (
        '[out:json][timeout:5];'
        f'area["boundary"="administrative"]["admin_level"="4"]["name"={quoted_state}]->.uf;'
        f'area(area.uf)["boundary"="administrative"]["admin_level"="8"]["name"={quoted_city}]->.municipio;'
        '.municipio out ids;'
        'nwr(area.municipio)["tourism"~"^(attraction|museum|gallery|viewpoint|zoo|aquarium|theme_park)$"]["name"];out center 25;'
        'nwr(area.municipio)["historic"~"^(monument|memorial|archaeological_site|castle)$"]["name"];out center 25;'
        'nwr(area.municipio)["amenity"="restaurant"]["name"];out center 25;'
    )


def _parse_elements(value: Any) -> tuple[list[dict[str, Any]], str]:
    if not isinstance(value, dict) or not isinstance(value.get("elements"), list):
        return [], "indisponivel"
    elements = value["elements"]
    areas = [item for item in elements if isinstance(item, dict) and item.get("type") == "area"]
    if len(areas) != 1:
        return [], "municipio_nao_identificado"

    attractions: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in elements:
        if not isinstance(item, dict) or item.get("type") not in {"node", "way", "relation"}:
            continue
        osm_type = item["type"]
        osm_id = item.get("id")
        tags = item.get("tags")
        if not isinstance(osm_id, int) or not isinstance(tags, dict):
            continue
        name = tags.get("name:pt") or tags.get("name")
        if not isinstance(name, str) or not name.strip():
            continue
        category = (
            "gastronomia" if tags.get("amenity") == "restaurant"
            else "historico" if tags.get("historic") in {"monument", "memorial", "archaeological_site", "castle"}
            else "mirante" if tags.get("tourism") == "viewpoint"
            else "cultura"
        )
        stable_id = f"osm-{osm_type}-{osm_id}"
        if stable_id in seen:
            continue
        seen.add(stable_id)
        description = tags.get("description:pt") or tags.get("description")
        if not isinstance(description, str) or not description.strip():
            description = "Local mapeado no OpenStreetMap. Confirme acesso e funcionamento antes da visita."
        attractions.append({
            "id": stable_id,
            "nome": name.strip()[:160],
            "categoria": category,
            "descricao": description.strip()[:400],
            "linkMaps": f"https://www.openstreetmap.org/{osm_type}/{osm_id}",
            "visitado": False,
        })
    attractions.sort(key=lambda item: (item["nome"].casefold(), item["id"]))
    sights = [item for item in attractions if item["categoria"] != "gastronomia"][:15]
    restaurants = [item for item in attractions if item["categoria"] == "gastronomia"][:15]
    selected = sights + restaurants
    return selected, "disponivel" if selected else "sem_resultados"


async def buscar_atrativos_osm(
    client: httpx.AsyncClient,
    city: str,
    state_code: str,
    states: dict[str, str],
    *,
    url: str = OVERPASS_URL,
    use_cache: bool = True,
) -> tuple[list[dict[str, Any]], str]:
    state_name = states.get(state_code)
    if not state_name or not city.strip():
        return [], "municipio_nao_identificado"
    cache_key = (url, city.casefold(), state_code)
    cached = _cache.get(cache_key) if use_cache else None
    if cached and cached[0] > time.monotonic():
        return deepcopy(cached[1]), cached[2]
    result: tuple[list[dict[str, Any]], str]
    try:
        response = await client.post(
            url,
            data={"data": _query(city, state_name)},
            headers={"User-Agent": "GuiaTuristaInteligente/2.0"},
            timeout=4.0,
        )
        if response.status_code != 200:
            logger.warning("Consulta OSM de atrativos retornou HTTP %s.", response.status_code)
            result = ([], "indisponivel")
        else:
            result = _parse_elements(response.json())
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning("Consulta OSM de atrativos indisponível: %s", type(exc).__name__)
        result = ([], "indisponivel")
    if use_cache:
        ttl = 3600 if result[1] in {"disponivel", "sem_resultados"} else 120
        _cache[cache_key] = (time.monotonic() + ttl, deepcopy(result[0]), result[1])
    return result
