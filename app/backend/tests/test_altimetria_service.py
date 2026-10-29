"""Testes unitários e de integração simulada para o serviço de altimetria (Issue #27).

Cobertura exigida:
- Cenários de sucesso (plano, subida, descida, misto, curto, longo, distâncias acumuladas, reuso de HTTP).
- Cenários de falha (geometria vazia/ausente, coordenadas inválidas, erro HTTP, timeout, conexão, JSON malformado, contagem divergente, elevações nulas/não finitas).
- Verificações matemáticas (ganho >= 0, perda >= 0, desnível líquido = final - inicial, preservação de ordem, monotonicidade de distância, política de ruído).
"""

from __future__ import annotations

import asyncio
from typing import Any

import httpx
import pytest
from app.schemas.roteiros import (
    AltimetriaInfo,
    Coordenada,
    PerfilTopografico,
    StatusAltimetria,
)
from app.services.altimetria_service import (
    AltimetriaService,
    calcular_indicadores_topograficos,
    converter_geometria_osrm,
    coordenada_valida,
    distancia_haversine,
    obter_perfil_topografico,
    validar_geometria,
)

# ---------------------------------------------------------------------------
# Fixtures e Utilitários de Mock
# ---------------------------------------------------------------------------


def mock_open_elevation_transport(
    status_code: int = 200,
    elevacoes: list[float] | None = None,
    raw_json: Any = None,
    raw_text: str | None = None,
    raise_exception: Exception | None = None,
):
    """Cria um MockTransport do httpx simulando a API do Open-Elevation."""

    def handler(request: httpx.Request) -> httpx.Response:
        if raise_exception:
            raise raise_exception

        assert request.method == "POST"
        assert request.url.path.endswith("/lookup")

        if raw_text is not None:
            return httpx.Response(
                status_code,
                content=raw_text.encode("utf-8"),
                headers={"Content-Type": "application/json"},
            )

        if raw_json is not None:
            return httpx.Response(status_code, json=raw_json)

        payload = httpx.Response(status_code, content=request.content).json()
        locations = payload.get("locations", [])

        if elevacoes is not None:
            results = [
                {"latitude": loc["latitude"], "longitude": loc["longitude"], "elevation": elev}
                for loc, elev in zip(locations, elevacoes, strict=False)
            ]
        else:
            results = [
                {"latitude": loc["latitude"], "longitude": loc["longitude"], "elevation": 100.0}
                for loc in locations
            ]

        return httpx.Response(status_code, json={"results": results})

    return httpx.MockTransport(handler)


# ---------------------------------------------------------------------------
# Testes de Validação e Geodésia
# ---------------------------------------------------------------------------


def test_coordenada_valida_e_schema():
    assert coordenada_valida(0.0, 0.0) is True
    assert coordenada_valida(-23.55, -46.63) is True
    assert coordenada_valida(90.0, 180.0) is True
    assert coordenada_valida(-90.0, -180.0) is True

    # Fora dos limites
    assert coordenada_valida(90.1, 0.0) is False
    assert coordenada_valida(-90.1, 0.0) is False
    assert coordenada_valida(0.0, 180.1) is False
    assert coordenada_valida(0.0, -180.1) is False
    assert coordenada_valida(float("nan"), 0.0) is False
    assert coordenada_valida(0.0, float("inf")) is False

    # Schema Pydantic
    c = Coordenada(latitude=-8.05, longitude=-34.90)
    assert c.latitude == -8.05
    assert c.longitude == -34.90

    with pytest.raises(ValueError):
        Coordenada(latitude=95.0, longitude=0.0)


def test_distancia_haversine_pontos_conhecidos():
    # Distância entre pontos idênticos deve ser exatamente zero
    assert distancia_haversine(-8.05, -34.90, -8.05, -34.90) == 0.0

    # Distância entre São Paulo (-23.5505, -46.6333) e Rio de Janeiro (-22.9068, -43.1729) ~ 357 km
    dist = distancia_haversine(-23.5505, -46.6333, -22.9068, -43.1729)
    assert 350_000 < dist < 370_000


def test_converter_geometria_osrm():
    # OSRM / GeoJSON utiliza [lon, lat]
    osrm_coords = [[-46.63, -23.55], [-43.17, -22.90]]
    convertido = converter_geometria_osrm(osrm_coords)
    assert convertido == [(-23.55, -46.63), (-22.90, -43.17)]


def test_validar_geometria_formatos_aceitos():
    tuplas = [(-8.0, -35.0), (-8.1, -35.1)]
    assert validar_geometria(tuplas) == tuplas

    dicts = [{"latitude": -8.0, "longitude": -35.0}, {"lat": -8.1, "lon": -35.1}]
    assert validar_geometria(dicts) == [(-8.0, -35.0), (-8.1, -35.1)]


# ---------------------------------------------------------------------------
# Cenários de Sucesso
# ---------------------------------------------------------------------------


def test_sucesso_percurso_plano():
    """1. Percurso plano: ganho = 0, perda = 0, desnível líquido = 0."""
    geometria = [(-8.0, -35.0), (-8.05, -35.05), (-8.1, -35.1)]
    elevacoes = [150.0, 150.0, 150.0]

    transport = mock_open_elevation_transport(elevacoes=elevacoes)
    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client, limiar_ruido_m=2.0)

    res = asyncio.run(run())
    assert res.sucesso is True
    assert res.status == StatusAltimetria.SUCESSO
    assert res.altitude_minima_m == 150.0
    assert res.altitude_maxima_m == 150.0
    assert res.ganho_elevacao_m == 0.0
    assert res.perda_elevacao_m == 0.0
    assert res.desnivel_liquido_m == 0.0
    assert res.dados_consumo is not None
    assert res.dados_consumo.fator_terreno == "plano"


def test_sucesso_percurso_com_subida():
    """2. Percurso com subida contínua."""
    geometria = [(-8.0, -35.0), (-8.05, -35.05), (-8.1, -35.1)]
    elevacoes = [100.0, 250.0, 450.0]

    transport = mock_open_elevation_transport(elevacoes=elevacoes)
    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client, limiar_ruido_m=0.0)

    res = asyncio.run(run())
    assert res.sucesso is True
    assert res.ganho_elevacao_m == 350.0
    assert res.perda_elevacao_m == 0.0
    assert res.desnivel_liquido_m == 350.0
    assert res.altitude_minima_m == 100.0
    assert res.altitude_maxima_m == 450.0


def test_sucesso_percurso_com_descida():
    """3. Percurso com descida contínua."""
    geometria = [(-8.0, -35.0), (-8.05, -35.05), (-8.1, -35.1)]
    elevacoes = [800.0, 500.0, 200.0]

    transport = mock_open_elevation_transport(elevacoes=elevacoes)
    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client, limiar_ruido_m=0.0)

    res = asyncio.run(run())
    assert res.sucesso is True
    assert res.ganho_elevacao_m == 0.0
    assert res.perda_elevacao_m == 600.0
    assert res.desnivel_liquido_m == -600.0
    assert res.altitude_minima_m == 200.0
    assert res.altitude_maxima_m == 800.0


def test_sucesso_percurso_perfil_misto():
    """4. Percurso misto com subidas e descidas alternadas."""
    geometria = [
        (-8.0, -35.0),
        (-8.02, -35.02),
        (-8.04, -35.04),
        (-8.06, -35.06),
        (-8.08, -35.08),
    ]
    elevacoes = [100.0, 300.0, 200.0, 500.0, 350.0]
    # Subidas: 100->300 (+200), 200->500 (+300) = 500m ganho
    # Descidas: 300->200 (-100), 500->350 (-150) = 250m perda
    # Desnível líquido: 350 - 100 = +250m

    transport = mock_open_elevation_transport(elevacoes=elevacoes)
    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client, limiar_ruido_m=0.0)

    res = asyncio.run(run())
    assert res.sucesso is True
    assert res.ganho_elevacao_m == 500.0
    assert res.perda_elevacao_m == 250.0
    assert res.desnivel_liquido_m == 250.0
    assert res.altitude_minima_m == 100.0
    assert res.altitude_maxima_m == 500.0


def test_sucesso_percurso_curto():
    """5. Percurso curto de 2 pontos (mínimo exigido)."""
    geometria = [(-8.0, -35.0), (-8.01, -35.01)]
    elevacoes = [50.0, 80.0]

    transport = mock_open_elevation_transport(elevacoes=elevacoes)
    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is True
    assert res.total_amostras == 2
    assert res.desnivel_liquido_m == 30.0


def test_sucesso_percurso_longo_com_amostragem_limitada():
    """6. Percurso longo amostrado respeitando o limite e preservando extremos."""
    # Gera 150 pontos sintéticos
    geometria = [(-8.0 - (i * 0.01), -35.0 - (i * 0.01)) for i in range(150)]
    max_amostras = 25

    transport = mock_open_elevation_transport()
    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(
                geometria, client=client, max_amostras=max_amostras
            )

    res = asyncio.run(run())
    assert res.sucesso is True
    assert res.total_amostras <= max_amostras
    # Primeiro e último ponto preservados
    assert res.pontos[0].latitude == geometria[0][0]
    assert res.pontos[0].longitude == geometria[0][1]
    assert res.pontos[-1].latitude == geometria[-1][0]
    assert res.pontos[-1].longitude == geometria[-1][1]


def test_sucesso_distancias_acumuladas_crescentes():
    """7. Distâncias acumuladas estritamente crescentes ao longo da rodovia."""
    geometria = [(-8.0, -35.0), (-8.05, -35.05), (-8.1, -35.1), (-8.15, -35.15)]
    elevacoes = [10.0, 20.0, 30.0, 40.0]

    transport = mock_open_elevation_transport(elevacoes=elevacoes)
    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is True
    assert res.pontos[0].distancia_m == 0.0
    for i in range(1, len(res.pontos)):
        assert res.pontos[i].distancia_m > res.pontos[i - 1].distancia_m
        assert res.pontos[i].distancia_km == round(res.pontos[i].distancia_m / 1000.0, 3)


def test_sucesso_correspondencia_coordenadas_e_elevações():
    """8 e 9. Correspondência exata entre coordenadas enviadas e elevações."""
    geometria = [(-8.0, -35.0), (-8.2, -35.2), (-8.4, -35.4)]
    elevacoes = [111.0, 222.0, 333.0]

    transport = mock_open_elevation_transport(elevacoes=elevacoes)
    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert [p.elevacao_m for p in res.pontos] == elevacoes
    assert [(p.latitude, p.longitude) for p in res.pontos] == geometria


def test_sucesso_reutilizacao_cliente_http_compartilhado():
    """10. Reutilização do cliente HTTP da aplicação sem fechar conexões."""
    geometria = [(-8.0, -35.0), (-8.1, -35.1)]
    transport = mock_open_elevation_transport(elevacoes=[100.0, 200.0])

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            servico = AltimetriaService(client=client)
            res1 = await servico.obter_perfil_topografico(geometria)
            res2 = await servico.obter_perfil_topografico(geometria)
            # O cliente não pode ter sido fechado pelo serviço
            assert not client.is_closed
            return res1, res2

    res1, res2 = asyncio.run(run())
    assert res1.sucesso is True
    assert res2.sucesso is True


# ---------------------------------------------------------------------------
# Cenários de Falha e Tratamento Defensivo
# ---------------------------------------------------------------------------


def test_falha_geometria_ausente_ou_vazia():
    """1 e 2. Geometria vazia ou ausente."""
    async def run():
        res1 = await obter_perfil_topografico([])
        res2 = await obter_perfil_topografico(None)  # type: ignore
        return res1, res2

    res1, res2 = asyncio.run(run())
    assert res1.sucesso is False
    assert res1.status == StatusAltimetria.GEOMETRIA_INVALIDA
    assert res2.sucesso is False
    assert res2.status == StatusAltimetria.GEOMETRIA_INVALIDA


def test_falha_geometria_com_um_ponto():
    """11. Geometria com 1 único ponto (insuficiente para rota)."""
    async def run():
        return await obter_perfil_topografico([(-8.0, -35.0)])

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.GEOMETRIA_INVALIDA
    assert "insuficientes" in (res.mensagem or "").lower()


def test_falha_geometria_malformada():
    """2. Ponto em formato inválido (strings sem números, dados quebrados)."""
    async def run():
        return await obter_perfil_topografico(["invalido", 123])  # type: ignore

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.GEOMETRIA_INVALIDA


def test_falha_coordenadas_fora_dos_limites():
    """3. Coordenadas fora dos limites geográficos válidos."""
    async def run():
        # Latitude 91.0 é inválida
        return await obter_perfil_topografico([(-8.0, -35.0), (91.0, -35.0)])

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.GEOMETRIA_INVALIDA


def test_falha_resposta_http_erro():
    """4. Resposta HTTP 500 do Open-Elevation."""
    geometria = [(-8.0, -35.0), (-8.1, -35.1)]
    transport = mock_open_elevation_transport(status_code=500, raw_text="Internal Server Error")

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.ERRO_PROVEDOR
    assert "500" in (res.mensagem or "")
    # Não cria dados fictícios
    assert res.altitude_minima_m is None
    assert res.pontos == []


def test_falha_timeout():
    """5. Timeout na chamada ao Open-Elevation."""
    geometria = [(-8.0, -35.0), (-8.1, -35.1)]
    transport = mock_open_elevation_transport(raise_exception=httpx.ReadTimeout("Timeout excedido"))

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.INDISPONIVEL
    assert "timeout" in (res.mensagem or "").lower()


def test_falha_conexao():
    """6. Falha de conexão/DNS com o Open-Elevation."""
    geometria = [(-8.0, -35.0), (-8.1, -35.1)]
    transport = mock_open_elevation_transport(
        raise_exception=httpx.ConnectError("Failed to establish a new connection")
    )

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.INDISPONIVEL
    assert "conexão" in (res.mensagem or "").lower()


def test_falha_json_invalido():
    """7. Resposta do servidor não é JSON."""
    geometria = [(-8.0, -35.0), (-8.1, -35.1)]
    transport = mock_open_elevation_transport(status_code=200, raw_text="<html>Gateway Error</html>")

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.ERRO_PROVEDOR


def test_falha_resposta_sem_campo_esperado():
    """8. Resposta sem campo 'results'."""
    geometria = [(-8.0, -35.0), (-8.1, -35.1)]
    transport = mock_open_elevation_transport(status_code=200, raw_json={"data": []})

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.ERRO_PROVEDOR


def test_falha_quantidade_inesperada_de_resultados():
    """9. Provedor retorna quantidade diferente de amostras (mismatch)."""
    geometria = [(-8.0, -35.0), (-8.1, -35.1), (-8.2, -35.2)]
    # Enviou 3, provedor retornou apenas 2
    transport = mock_open_elevation_transport(
        status_code=200,
        raw_json={"results": [{"elevation": 100.0}, {"elevation": 200.0}]},
    )

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.ERRO_PROVEDOR
    assert "divergência" in (res.mensagem or "").lower()


def test_falha_elevacoes_ausentes_ou_nao_finitas():
    """10. Elevação None, NaN ou ausente retornada pelo provedor."""
    geometria = [(-8.0, -35.0), (-8.1, -35.1)]
    transport = mock_open_elevation_transport(
        status_code=200,
        raw_json={"results": [{"elevation": 100.0}, {"elevation": None}]},
    )

    async def run():
        async with httpx.AsyncClient(transport=transport) as client:
            return await obter_perfil_topografico(geometria, client=client)

    res = asyncio.run(run())
    assert res.sucesso is False
    assert res.status == StatusAltimetria.ERRO_PROVEDOR


# ---------------------------------------------------------------------------
# Verificações Matemáticas e Consistência
# ---------------------------------------------------------------------------


def test_matematica_ganho_e_perda_nao_negativos():
    """Ganho e perda acumulados nunca podem ser negativos."""
    amostras_pontos = [(-8.0, -35.0), (-8.1, -35.1), (-8.2, -35.2)]
    distancias = [0.0, 1000.0, 2000.0]
    elevacoes = [500.0, 400.0, 300.0]

    ind = calcular_indicadores_topograficos(amostras_pontos, distancias, elevacoes, limiar_ruido_m=0.0)
    assert ind["ganho_elevacao_m"] >= 0.0
    assert ind["perda_elevacao_m"] >= 0.0
    assert ind["ganho_elevacao_m"] == 0.0
    assert ind["perda_elevacao_m"] == 200.0


def test_matematica_desnivel_liquido_e_diferenca():
    """Desnível líquido deve corresponder a (final - inicial)."""
    amostras_pontos = [(-8.0, -35.0), (-8.1, -35.1), (-8.2, -35.2), (-8.3, -35.3)]
    distancias = [0.0, 1000.0, 2000.0, 3000.0]
    elevacoes = [200.0, 450.0, 350.0, 600.0]

    ind = calcular_indicadores_topograficos(amostras_pontos, distancias, elevacoes, limiar_ruido_m=0.0)
    assert ind["desnivel_liquido_m"] == 400.0  # 600 - 200
    assert ind["ganho_elevacao_m"] == 250.0 + 250.0  # 500m (200->450: +250; 350->600: +250)
    assert ind["perda_elevacao_m"] == 100.0  # 100m (450->350: -100)
    # Com limiar 0: ganho - perda = desnivel_liquido
    assert ind["ganho_elevacao_m"] - ind["perda_elevacao_m"] == ind["desnivel_liquido_m"]


def test_matematica_politica_de_filtragem_de_ruido():
    """Pequenas variações abaixo do limiar não são acumuladas em ganho/perda."""
    amostras_pontos = [(-8.0, -35.0), (-8.01, -35.01), (-8.02, -35.02), (-8.03, -35.03)]
    distancias = [0.0, 100.0, 200.0, 300.0]
    # Oscilações de 1 metro (ruído SRTM)
    elevacoes = [100.0, 101.0, 100.0, 101.0]

    # Com limiar de 2.0 m, oscilações de 1.0 m devem ser ignoradas
    ind_filtrado = calcular_indicadores_topograficos(
        amostras_pontos, distancias, elevacoes, limiar_ruido_m=2.0
    )
    assert ind_filtrado["ganho_elevacao_m"] == 0.0
    assert ind_filtrado["perda_elevacao_m"] == 0.0
    # O desnível líquido nunca é mascarado pela filtragem de ruído
    assert ind_filtrado["desnivel_liquido_m"] == 1.0

    # Sem filtragem (limiar = 0.0), acumula o ruído
    ind_sem_filtro = calcular_indicadores_topograficos(
        amostras_pontos, distancias, elevacoes, limiar_ruido_m=0.0
    )
    assert ind_sem_filtro["ganho_elevacao_m"] == 2.0
    assert ind_sem_filtro["perda_elevacao_m"] == 1.0


def test_schema_to_info_resumo():
    """Valida o método de resumo to_info() do PerfilTopografico."""
    perfil_sucesso = PerfilTopografico(
        sucesso=True,
        status=StatusAltimetria.SUCESSO,
        altitude_minima_m=50.0,
        altitude_maxima_m=350.0,
        ganho_elevacao_m=300.0,
        perda_elevacao_m=0.0,
        desnivel_liquido_m=300.0,
        distancia_total_m=10000.0,
        distancia_total_km=10.0,
        total_amostras=2,
    )
    info = perfil_sucesso.to_info()
    assert isinstance(info, AltimetriaInfo)
    assert info.altitude_maxima_m == 350.0
    assert info.ganho_elevacao_m == 300.0
    assert info.distancia_total_km == 10.0

    perfil_falho = PerfilTopografico(
        sucesso=False,
        status=StatusAltimetria.INDISPONIVEL,
    )
    assert perfil_falho.to_info() is None
