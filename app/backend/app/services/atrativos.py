"""Catálogo limitado de atrações já disponível na aplicação."""

import json
import unicodedata
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any


def _normalize(value: str) -> str:
    return "".join(
        char for char in unicodedata.normalize("NFD", value.strip().casefold())
        if not unicodedata.combining(char)
    )


@lru_cache(maxsize=1)
def _catalog() -> dict[str, Any]:
    path = Path(__file__).resolve().parent.parent / "data" / "atrativos.json"
    return json.loads(path.read_text(encoding="utf-8"))


def atrativos_por_destino(cidade: str, uf: str) -> list[dict[str, Any]]:
    """Retorna somente correspondência exata; não cria sugestões para outras cidades."""
    wanted = _normalize(cidade)
    state = uf.strip().upper()
    for label, entries in _catalog().items():
        name, catalog_state = label.rsplit(" - ", 1)
        if _normalize(name) == wanted and (not state or state == catalog_state):
            return deepcopy(entries)
    return []


def enriquecer_viagem_legada(trip: dict[str, Any]) -> dict[str, Any]:
    """Adapta viagens antigas na leitura sem alterar seu registro persistido."""
    if "atrativos" in trip:
        return trip
    destination = trip.get("destino")
    if not isinstance(destination, str) or not destination.strip():
        return trip
    city, separator, state = destination.rpartition(" - ")
    if not separator:
        city, state = destination, ""
    attractions = atrativos_por_destino(city, state)
    if not attractions:
        return trip
    return {
        **trip,
        "atrativos": attractions,
        "atrativos_fonte": "catalogo_local",
    }
