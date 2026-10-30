from urllib.parse import unquote

import httpx
import pytest

from app.services.atrativos_osm import buscar_atrativos_osm


@pytest.mark.asyncio
async def test_consulta_municipal_separa_atrativos_e_restaurantes() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        query = request.content.decode()
        assert 'Abaiara' in query
        assert 'Cear%C3%A1' in query or 'Ceará' in query
        assert 'admin_level' in query and 'area.municipio' in query
        return httpx.Response(200, json={"elements": [
            {"type": "area", "id": 3600000001},
            {"type": "node", "id": 10, "tags": {"name": "Museu Local", "tourism": "museum"}},
            {"type": "node", "id": 11, "tags": {"name": "Restaurante Local", "amenity": "restaurant"}},
        ]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        places, status = await buscar_atrativos_osm(
            client, "Abaiara", "CE", {"CE": "Ceará"}, use_cache=False
        )
    assert status == "disponivel"
    assert [(item["id"], item["categoria"]) for item in places] == [
        ("osm-node-10", "cultura"), ("osm-node-11", "gastronomia")
    ]
    assert places[1]["linkMaps"] == "https://www.openstreetmap.org/node/11"


@pytest.mark.asyncio
async def test_sem_area_municipal_nao_aceita_resultados_soltos() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(200, json={"elements": [
        {"type": "node", "id": 11, "tags": {"name": "Cidade vizinha", "amenity": "restaurant"}}
    ]}))
    async with httpx.AsyncClient(transport=transport) as client:
        places, status = await buscar_atrativos_osm(client, "Abaiara", "CE", {"CE": "Ceará"}, use_cache=False)
    assert places == []
    assert status == "municipio_nao_identificado"


@pytest.mark.asyncio
async def test_falha_do_provedor_nao_fabrica_restaurantes() -> None:
    transport = httpx.MockTransport(lambda request: httpx.Response(429))
    async with httpx.AsyncClient(transport=transport) as client:
        places, status = await buscar_atrativos_osm(client, "Abaiara", "CE", {"CE": "Ceará"}, use_cache=False)
    assert places == []
    assert status == "indisponivel"


@pytest.mark.asyncio
async def test_consulta_distrito_federal_usa_admin_level_4() -> None:
    def respond(request: httpx.Request) -> httpx.Response:
        query = unquote(request.content.decode().replace("+", " "))
        assert 'Distrito Federal' in query
        assert 'admin_level"="4"' in query
        assert 'admin_level"="8"' not in query
        return httpx.Response(200, json={"elements": [
            {"type": "area", "id": 3600000002},
            {"type": "node", "id": 20, "tags": {"name": "Congresso Nacional", "tourism": "attraction"}},
            {"type": "node", "id": 21, "tags": {"name": "Mangai Brasília", "amenity": "restaurant"}},
        ]})

    async with httpx.AsyncClient(transport=httpx.MockTransport(respond)) as client:
        places, status = await buscar_atrativos_osm(
            client, "Brasília", "DF", {"DF": "Distrito Federal"}, use_cache=False
        )
    assert status == "disponivel"
    assert len(places) == 2


def test_catalogo_cobre_todas_as_27_ufs_com_atrativos_e_gastronomia() -> None:
    from app.services.atrativos import atrativos_por_destino, atrativos_por_uf

    all_27_ufs = [
        "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA",
        "MT", "MS", "MG", "PA", "PB", "PR", "PE", "PI", "RJ", "RN",
        "RS", "RO", "RR", "SC", "SP", "SE", "TO",
    ]
    for uf in all_27_ufs:
        items = atrativos_por_uf(uf)
        assert len(items) >= 10, f"UF {uf} deve ter no mínimo 10 atrativos no catalogo regional"
        assert sum(item["categoria"] != "gastronomia" for item in items) >= 5, f"UF {uf} com menos de 5 atrativos"
        assert sum(item["categoria"] == "gastronomia" for item in items) >= 5, f"UF {uf} com menos de 5 opções gastronômicas"

    # Brasília especificamente
    bsb = atrativos_por_destino("Brasília", "DF")
    assert len(bsb) == 10
    assert sum(item["categoria"] != "gastronomia" for item in bsb) == 5
    assert sum(item["categoria"] == "gastronomia" for item in bsb) == 5

    # Juazeiro do Norte especificamente
    jdo = atrativos_por_destino("Juazeiro do Norte", "CE")
    assert len(jdo) == 10
    assert sum(item["categoria"] != "gastronomia" for item in jdo) == 5
    assert sum(item["categoria"] == "gastronomia" for item in jdo) == 5

    # Fallback regional do Ceará entrega Fortaleza (capital com gastronomia), não Abaiara
    ce_fallback = atrativos_por_uf("CE")
    assert len(ce_fallback) == 10
    assert sum(item["categoria"] == "gastronomia" for item in ce_fallback) == 5
