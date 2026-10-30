"""Catálogo limitado de atrações já disponível na aplicação."""

import json
import unicodedata
from copy import deepcopy
from functools import lru_cache
from pathlib import Path
from typing import Any

CAPITAIS_UF: dict[str, str] = {
    "AC": "Rio Branco",
    "AL": "Maceió",
    "AP": "Macapá",
    "AM": "Manaus",
    "BA": "Salvador",
    "CE": "Fortaleza",
    "DF": "Brasília",
    "ES": "Vitória",
    "GO": "Goiânia",
    "MA": "São Luís",
    "MT": "Cuiabá",
    "MS": "Campo Grande",
    "MG": "Belo Horizonte",
    "PA": "Belém",
    "PB": "João Pessoa",
    "PR": "Curitiba",
    "PE": "Recife",
    "PI": "Teresina",
    "RJ": "Rio de Janeiro",
    "RN": "Natal",
    "RS": "Porto Alegre",
    "RO": "Porto Velho",
    "RR": "Boa Vista",
    "SC": "Florianópolis",
    "SP": "São Paulo",
    "SE": "Aracaju",
    "TO": "Palmas",
}


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
    clean_cidade = (cidade or "").strip()
    clean_uf = (uf or "").strip().upper()
    if " - " in clean_cidade:
        part_city, _, part_uf = clean_cidade.rpartition(" - ")
        if part_city.strip():
            clean_cidade = part_city.strip()
            if not clean_uf and part_uf.strip():
                clean_uf = part_uf.strip().upper()
    elif "," in clean_cidade:
        part_city, _, part_uf = clean_cidade.rpartition(",")
        if part_city.strip():
            clean_cidade = part_city.strip()
            if not clean_uf and part_uf.strip():
                clean_uf = part_uf.strip().upper()

    wanted = _normalize(clean_cidade)
    for label, entries in _catalog().items():
        name, catalog_state = label.rsplit(" - ", 1)
        if _normalize(name) == wanted and (not clean_uf or clean_uf == catalog_state):
            return deepcopy(entries)
    return []


def atrativos_por_uf(uf: str) -> list[dict[str, Any]]:
    """Retorna atrativos curados da capital/polo regional da UF como fallback resiliente."""
    clean_uf = (uf or "").strip().upper()
    if not clean_uf:
        return []
    capital = CAPITAIS_UF.get(clean_uf)
    catalog = _catalog()
    if capital:
        target_label = f"{capital} - {clean_uf}"
        if target_label in catalog:
            return deepcopy(catalog[target_label])
    # Fallback procurando qualquer destino da UF que possua gastronomia
    for label, entries in catalog.items():
        _, sep, catalog_state = label.rpartition(" - ")
        if sep and catalog_state == clean_uf and any(item.get("categoria") == "gastronomia" for item in entries):
            return deepcopy(entries)
    # Se nenhum tiver gastronomia, retorna o primeiro da UF
    for label, entries in catalog.items():
        _, sep, catalog_state = label.rpartition(" - ")
        if sep and catalog_state == clean_uf:
            return deepcopy(entries)
    return []


def enriquecer_viagem_legada(trip: dict[str, Any]) -> dict[str, Any]:
    """Adapta viagens antigas na leitura sem alterar seu registro persistido."""
    existing_attractions = trip.get("atrativos")
    if isinstance(existing_attractions, list) and len(existing_attractions) > 0:
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
