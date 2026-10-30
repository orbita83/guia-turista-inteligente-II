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
