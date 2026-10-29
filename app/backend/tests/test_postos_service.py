"""Testes unitários e de integração de domínio para o serviço de postos e autonomia (Issue #28).

Responsabilidade (Aluno 3 — Data & Altimetry Engineer):
- Cobertura de autonomia para veículos a combustão e elétricos (fórmulas e unidades).
- Viagens curtas sem paradas e viagens longas com uma ou múltiplas paradas.
- Reserva crítica de referência (~18%) e casos de fronteira próximos ao limite.
- Consumo elevado, parâmetros inválidos e autonomia insuficiente.
- Geometria rodoviária real, validação e interpolação estrita sobre a rota.
- Ordenação e monotonicidade das distâncias acumuladas.
- Distinção explícita entre pontos projetados e estabelecimentos verificados.
- Testes síncronos e assíncronos prontos para integração no endpoint /planejar.
"""

from __future__ import annotations

import pytest

from app.schemas.roteiros import (
    OrigemParada,
    ParametrosVeiculo,
    PoliticaReabastecimento,
    StatusAutonomia,
    TipoParada,
    TipoPropulsao,
    VeiculoCombustao,
    VeiculoEletrico,
)
from app.services.altimetria_service import calcular_distancias_acumuladas
from app.services.postos_service import (
    AutonomiaInsuficienteError,
    GeometriaRotaInvalidaError,
    ParametrosVeiculoInvalidosError,
    PostosService,
    ReservaCriticaVioladaError,
    calcular_autonomia_combustao,
    calcular_autonomia_eletrico,
    interpolar_posicao_geometria,
    normalizar_parametros_veiculo,
    projetar_paradas_rota,
)

# ---------------------------------------------------------------------------
# Fixtures e Rotas Sintéticas para Testes
# ---------------------------------------------------------------------------


@pytest.fixture
def rota_reta_nordeste() -> list[tuple[float, float]]:
    """Rota de teste ao longo da BR-101 / BR-232 no Nordeste (aprox. 120 km).

    Recife (-8.05, -34.88) até Caruaru (-8.28, -35.97).
    """
    return [
        (-8.0500, -34.8800),  # Recife
        (-8.1100, -35.1500),  # Vitória de Santo Antão
        (-8.1600, -35.4300),  # Gravatá
        (-8.2800, -35.9700),  # Caruaru
    ]


@pytest.fixture
def rota_longa_nordeste_sudeste() -> list[tuple[float, float]]:
    """Rota longa interestadual sintética representando trecho de ~1.500 km.

    Recife (-8.05, -34.88) -> Salvador (-12.97, -38.50) -> Belo Horizonte (-19.92, -43.94) -> SP (-23.55, -46.63).
    """
    return [
        (-8.0500, -34.8800),   # 0 km (Recife)
        (-9.6600, -35.7300),   # Maceió
        (-10.9400, -37.0700),  # Aracaju
        (-12.9700, -38.5000),  # Salvador
        (-14.8600, -40.8400),  # Vitória da Conquista
        (-16.7200, -43.8600),  # Montes Claros
        (-19.9200, -43.9400),  # Belo Horizonte
        (-21.7800, -45.2600),  # Pouso Alegre
        (-23.5500, -46.6300),  # São Paulo
    ]


# ---------------------------------------------------------------------------
# 1. Testes de Cálculo de Autonomia (Fórmulas e Unidades)
# ---------------------------------------------------------------------------


def test_calcular_autonomia_combustao_sucesso():
    """Valida a fórmula de combustão: autonomia = capacidade * consumo."""
    # Tanque: 50 L, Consumo: 12 km/L, Nível inicial: 100%
    max_km, ef_km = calcular_autonomia_combustao(50.0, 12.0, 100.0)
    assert max_km == 600.0
    assert ef_km == 600.0


def test_calcular_autonomia_combustao_nivel_parcial():
    """Valida que o nível inicial percentual reduz proporcionalmente a autonomia efetiva."""
    # Tanque: 50 L, Consumo: 10 km/L -> 500 km nominais; nível inicial 40% -> 200 km efetivos
    max_km, ef_km = calcular_autonomia_combustao(50.0, 10.0, 40.0)
    assert max_km == 500.0
    assert ef_km == 200.0


def test_calcular_autonomia_combustao_penalizacao_relevo():
    """Valida a aplicação opcional de fator de penalização altimétrica no consumo."""
    # Tanque: 50 L, Consumo: 10 km/L (500 km). Penalização de relevo 25% (+25% consumo) -> autonomia / 1.25 = 400 km
    max_km, ef_km = calcular_autonomia_combustao(50.0, 10.0, 100.0, penalizacao_relevo_percent=25.0)
    assert max_km == pytest.approx(400.0, rel=1e-3)
    assert ef_km == pytest.approx(400.0, rel=1e-3)


def test_calcular_autonomia_eletrico_sucesso():
    """Valida a fórmula de veículo elétrico: autonomia = capacidade (kWh) * eficiência (km/kWh)."""
    # Bateria: 60 kWh, Eficiência: 6 km/kWh -> 360 km
    max_km, ef_km = calcular_autonomia_eletrico(60.0, 6.0, 100.0)
    assert max_km == 360.0
    assert ef_km == 360.0


def test_calcular_autonomia_eletrico_nivel_parcial():
    """Valida autonomia efetiva para bateria parcialmente carregada."""
    # Bateria: 75 kWh, Eficiência: 5 km/kWh -> 375 km nominais; nível 80% -> 300 km efetivos
    max_km, ef_km = calcular_autonomia_eletrico(75.0, 5.0, 80.0)
    assert max_km == 375.0
    assert ef_km == 300.0


def test_calcular_autonomia_eletrico_penalizacao_relevo():
    """Valida a redução de autonomia do elétrico sob relevo acidentado."""
    # Bateria: 60 kWh, Eficiência: 5 km/kWh (300 km). Relevo +20% -> 300 / 1.2 = 250 km
    max_km, ef_km = calcular_autonomia_eletrico(60.0, 5.0, 100.0, penalizacao_relevo_percent=20.0)
    assert max_km == pytest.approx(250.0, rel=1e-3)
    assert ef_km == pytest.approx(250.0, rel=1e-3)


@pytest.mark.parametrize("capacidade_invalida", [0.0, -10.0, float("nan"), float("inf")])
def test_calcular_autonomia_parametros_invalidos_capacidade(capacidade_invalida: float):
    """Rejeita defensivamente capacidades menores ou iguais a zero, NaN ou infinitas."""
    with pytest.raises(ParametrosVeiculoInvalidosError):
        calcular_autonomia_combustao(capacidade_invalida, 12.0)
    with pytest.raises(ParametrosVeiculoInvalidosError):
        calcular_autonomia_eletrico(capacidade_invalida, 6.0)


@pytest.mark.parametrize("consumo_invalido", [0.0, -5.0, float("nan"), float("inf")])
def test_calcular_autonomia_parametros_invalidos_consumo(consumo_invalido: float):
    """Rejeita consumos e eficiências não-positivos ou não-finitos."""
    with pytest.raises(ParametrosVeiculoInvalidosError):
        calcular_autonomia_combustao(50.0, consumo_invalido)
    with pytest.raises(ParametrosVeiculoInvalidosError):
        calcular_autonomia_eletrico(60.0, consumo_invalido)


@pytest.mark.parametrize("nivel_invalido", [-1.0, 101.0, float("nan"), float("inf")])
def test_calcular_autonomia_parametros_invalidos_nivel(nivel_invalido: float):
    """Rejeita níveis de combustível ou bateria fora do intervalo permitido [0, 100]."""
    with pytest.raises(ParametrosVeiculoInvalidosError):
        calcular_autonomia_combustao(50.0, 12.0, nivel_invalido)
    with pytest.raises(ParametrosVeiculoInvalidosError):
        calcular_autonomia_eletrico(60.0, 6.0, nivel_invalido)


# ---------------------------------------------------------------------------
# 2. Testes de Contratos Pydantic e Normalização de Veículos
# ---------------------------------------------------------------------------


def test_modelo_veiculo_combustao_pydantic():
    """Valida o modelo Pydantic VeiculoCombustao e suas properties."""
    veiculo = VeiculoCombustao(
        capacidade_tanque_litros=55.0,
        consumo_km_por_litro=14.0,
        nivel_inicial_percent=90.0,
    )
    assert veiculo.autonomia_maxima_km == 55.0 * 14.0
    assert veiculo.autonomia_efetiva_km == (55.0 * 14.0) * 0.9


def test_modelo_veiculo_eletrico_pydantic():
    """Valida o modelo Pydantic VeiculoEletrico e suas properties."""
    veiculo = VeiculoEletrico(
        capacidade_bateria_kwh=80.0,
        eficiencia_km_por_kwh=5.5,
        nivel_inicial_percent=85.0,
    )
    assert veiculo.autonomia_maxima_km == 80.0 * 5.5
    assert veiculo.autonomia_efetiva_km == (80.0 * 5.5) * 0.85


def test_parametros_veiculo_conversao_unificada():
    """Valida o modelo ParametrosVeiculo para instanciar o veículo correto."""
    param_combustao = ParametrosVeiculo(
        propulsao=TipoPropulsao.COMBUSTAO,
        capacidade_tanque_l=48.0,
        consumo_km_l=11.5,
        nivel_inicial_percent=75.0,
    )
    veic_comb = param_combustao.obter_veiculo_especifico()
    assert isinstance(veic_comb, VeiculoCombustao)
    assert veic_comb.capacidade_tanque_litros == 48.0
    assert veic_comb.consumo_km_por_litro == 11.5

    param_eletrico = ParametrosVeiculo(
        propulsao=TipoPropulsao.ELETRICO,
        capacidade_bateria_kwh=65.0,
        eficiencia_km_kwh=6.2,
        nivel_inicial_percent=95.0,
    )
    veic_elet = param_eletrico.obter_veiculo_especifico()
    assert isinstance(veic_elet, VeiculoEletrico)
    assert veic_elet.capacidade_bateria_kwh == 65.0
    assert veic_elet.eficiencia_km_por_kwh == 6.2


def test_normalizar_parametros_dicionario_compatibilidade_frontend():
    """Valida a compatibilidade com o formato de dados vindo do frontend."""
    payload_front_comb = {
        "propulsao": "combustao",
        "capacidade_tanque_l": 50.0,
        "consumo_km_l": 12.0,
        "nivel_inicial_percent": 80.0,
    }
    prop, cap, cons, nivel, max_km, ef_km = normalizar_parametros_veiculo(payload_front_comb)
    assert prop == TipoPropulsao.COMBUSTAO
    assert cap == 50.0
    assert cons == 12.0
    assert nivel == 80.0
    assert max_km == 600.0
    assert ef_km == 480.0

    payload_front_ev = {
        "propulsao": "eletrico",
        "capacidade_bateria_kwh": 70.0,
        "eficiencia_km_kwh": 5.0,
        "nivel_inicial_percent": 90.0,
    }
    prop, cap, efic, nivel, max_km, ef_km = normalizar_parametros_veiculo(payload_front_ev)
    assert prop == TipoPropulsao.ELETRICO
    assert cap == 70.0
    assert efic == 5.0
    assert nivel == 90.0
    assert max_km == 350.0
    assert ef_km == 315.0


def test_politica_reabastecimento_validacao():
    """Valida que a margem de segurança de parada não pode ser inferior à reserva crítica."""
    # Válido: margem 22% >= reserva crítica 18%
    pol = PoliticaReabastecimento(reserva_critica_percent=18.0, margem_seguranca_percent=22.0)
    assert pol.reserva_critica_percent == 18.0
    assert pol.margem_seguranca_percent == 22.0

    # Inválido: margem 15% < reserva 18%
    with pytest.raises(ValueError, match="não pode ser menor que a reserva crítica"):
        PoliticaReabastecimento(reserva_critica_percent=18.0, margem_seguranca_percent=15.0)


# ---------------------------------------------------------------------------
# 3. Testes de Geometria Rodoviária e Interpolação de Posição
# ---------------------------------------------------------------------------


def test_interpolar_posicao_geometria_fronteiras(rota_reta_nordeste: list[tuple[float, float]]):
    """Verifica que distâncias no início e no fim retornam exatamente a origem e o destino."""
    distancias_m = calcular_distancias_acumuladas(rota_reta_nordeste)
    total_m = distancias_m[-1]

    # Distância 0 m deve retornar a origem exata
    p_origem = interpolar_posicao_geometria(rota_reta_nordeste, distancias_m, 0.0)
    assert p_origem == rota_reta_nordeste[0]

    # Distância total m deve retornar o destino exato
    p_destino = interpolar_posicao_geometria(rota_reta_nordeste, distancias_m, total_m)
    assert p_destino == rota_reta_nordeste[-1]


def test_interpolar_posicao_geometria_ponto_medio():
    """Valida a interpolação linear no ponto médio exato de um segmento rodoviário."""
    pontos = [(-10.0, -40.0), (-12.0, -42.0)]
    distancias_m = [0.0, 100_000.0]

    # Ponto aos 50.000 m (50% do segmento)
    p_meio = interpolar_posicao_geometria(pontos, distancias_m, 50_000.0)
    assert p_meio[0] == pytest.approx(-11.0, abs=1e-5)
    assert p_meio[1] == pytest.approx(-41.0, abs=1e-5)


def test_geometria_invalida_vazia_ou_insuficiente():
    """Valida rejeição de geometrias vazias ou com menos de 2 pontos."""
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=10.0)

    # Geometria vazia em modo estruturado
    res1 = projetar_paradas_rota([], veiculo)
    assert not res1.sucesso
    assert res1.status == StatusAutonomia.GEOMETRIA_INVALIDA

    # Ponto único
    res2 = projetar_paradas_rota([(-8.05, -34.88)], veiculo)
    assert not res2.sucesso
    assert res2.status == StatusAutonomia.GEOMETRIA_INVALIDA

    # Modo estrito lança exceção
    with pytest.raises(GeometriaRotaInvalidaError):
        projetar_paradas_rota([], veiculo, modo_estrito=True)


def test_geometria_invalida_coordenadas_fora_dos_limites():
    """Valida rejeição de coordenadas geográficas impossíveis."""
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=10.0)
    geo_invalida = [(-8.05, -34.88), (95.00, -35.00)]  # Latitude 95 inválida

    res = projetar_paradas_rota(geo_invalida, veiculo)
    assert not res.sucesso
    assert res.status == StatusAutonomia.GEOMETRIA_INVALIDA


def test_geometria_suporte_formato_osrm_geojson():
    """Valida que coordenadas GeoJSON/OSRM [[lon, lat], ...] são convertidas corretamente."""
    coords_osrm = [
        [-34.8800, -8.0500],
        [-35.1500, -8.1100],
        [-35.4300, -8.1600],
        [-35.9700, -8.2800],
    ]
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=10.0)
    res = projetar_paradas_rota(coords_osrm, veiculo)
    assert res.sucesso
    assert res.distancia_total_km is not None
    assert res.distancia_total_km == pytest.approx(122.7, abs=1.0)

    # Força paradas para confirmar que as coordenadas convertidas estão sobre a rota real.
    veiculo_curto = VeiculoCombustao(capacidade_tanque_litros=10.0, consumo_km_por_litro=10.0)
    res_paradas = projetar_paradas_rota(coords_osrm, veiculo_curto)
    assert res_paradas.total_paradas >= 1

    lats_rota = [p[1] for p in coords_osrm]
    lons_rota = [p[0] for p in coords_osrm]
    for parada in res_paradas.paradas:
        assert min(lats_rota) <= parada.coordenadas.latitude <= max(lats_rota)
        assert min(lons_rota) <= parada.coordenadas.longitude <= max(lons_rota)


@pytest.mark.parametrize("formato_geometria", ["auto", "lonlat"])
def test_geometria_osrm_auto_e_formato_explicito(formato_geometria: str):
    """A detecção automática e o formato explícito 'lonlat' produzem a mesma rota."""
    coords_osrm = [[-34.8800, -8.0500], [-35.9700, -8.2800]]
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=10.0)

    res = projetar_paradas_rota(
        coords_osrm, veiculo, formato_geometria=formato_geometria
    )
    assert res.sucesso is True
    assert res.distancia_total_km == pytest.approx(122.7, abs=1.0)


def test_geometria_latlon_explicita_nao_e_convertida():
    """O formato explícito 'latlon' mantém a orientação nativa mesmo em rota brasileira."""
    rota = [(-8.0500, -34.8800), (-8.2800, -35.9700)]
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=10.0)

    res = projetar_paradas_rota(rota, veiculo, formato_geometria="latlon")
    assert res.sucesso is True
    assert res.distancia_total_km == pytest.approx(122.7, abs=1.0)


def test_formato_geometria_invalido_retorna_erro_estruturado():
    """Formato de geometria desconhecido é rejeitado sem gerar coordenadas fictícias."""
    rota = [(-8.0500, -34.8800), (-8.2800, -35.9700)]
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=10.0)

    res = projetar_paradas_rota(rota, veiculo, formato_geometria="desconhecido")
    assert res.sucesso is False
    assert res.status == StatusAutonomia.GEOMETRIA_INVALIDA

    with pytest.raises(GeometriaRotaInvalidaError):
        projetar_paradas_rota(
            rota, veiculo, formato_geometria="desconhecido", modo_estrito=True
        )


# ---------------------------------------------------------------------------
# 4. Testes de Projeção de Paradas, Reserva Crítica e Percursos
# ---------------------------------------------------------------------------


def test_viagem_curta_sem_paradas(rota_reta_nordeste: list[tuple[float, float]]):
    """Viagem cuja distância consome menos que a autonomia disponível antes da reserva crítica."""
    # Rota tem cerca de 123 km. Veículo tem 600 km de autonomia nominal (50 L * 12 km/L).
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=12.0)
    res = projetar_paradas_rota(rota_reta_nordeste, veiculo)

    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.status == StatusAutonomia.SEM_PARADAS_NECESSARIAS
    assert res.total_paradas == 0
    assert len(res.paradas) == 0
    assert res.reserva_final_percent is not None
    # 123 km consome ~20.5%, portanto resta ~79.5% de combustível no destino (> 18%)
    assert res.reserva_final_percent > 70.0


def test_viagem_longa_uma_parada_combustao(rota_longa_nordeste_sudeste: list[tuple[float, float]]):
    """Viagem que necessita de parada e o algoritmo a posiciona antes da reserva crítica."""
    # Trecho com cerca de 650 km usando primeiros pontos da rota longa
    sub_rota = rota_longa_nordeste_sudeste[:4]  # Recife até Salvador (~675 km)
    # Autonomia nominal de 500 km (50 L * 10 km/L)
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=10.0)

    res = projetar_paradas_rota(sub_rota, veiculo)

    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.status == StatusAutonomia.PARADAS_NECESSARIAS
    assert res.total_paradas >= 1

    # Verifica primeira parada
    p1 = res.paradas[0]
    assert p1.ordem == 1
    assert p1.tipo == TipoParada.COMBUSTIVEL
    assert p1.reserva_estimada_percent >= 18.0  # Nunca abaixo da reserva crítica!
    assert p1.nivel_pos_parada_percent == 100.0  # Reabastecido conforme política


def test_viagem_longa_multiplas_paradas_combustao(
    rota_longa_nordeste_sudeste: list[tuple[float, float]],
):
    """Viagem de 2.000 km necessita de múltiplas paradas sucessivas mantendo a reserva."""
    # Autonomia: 400 km nominais (40 L * 10 km/L)
    veiculo = VeiculoCombustao(capacidade_tanque_litros=40.0, consumo_km_por_litro=10.0)

    res = projetar_paradas_rota(rota_longa_nordeste_sudeste, veiculo)

    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.status == StatusAutonomia.PARADAS_NECESSARIAS
    assert res.total_paradas >= 3

    # Valida ordenação estrita e monotonicidade das distâncias
    distancias_paradas = [p.distancia_km for p in res.paradas]
    for i in range(1, len(distancias_paradas)):
        assert distancias_paradas[i] > distancias_paradas[i - 1], "Paradas devem ser crescentes na rodovia"

    # Todas as paradas devem ter reserva >= 18%
    assert res.distancia_total_km is not None
    for parada in res.paradas:
        assert parada.reserva_estimada_percent >= 18.0
        assert parada.distancia_km < res.distancia_total_km


def test_viagem_longa_eletrico_politica_recarga_80(
    rota_longa_nordeste_sudeste: list[tuple[float, float]],
):
    """Veículo elétrico adota política de recarga DC rápida de 80% nas paradas."""
    sub_rota = rota_longa_nordeste_sudeste[:4]  # ~675 km
    # EV: 60 kWh, 5 km/kWh -> 300 km de autonomia nominal
    veiculo = VeiculoEletrico(capacidade_bateria_kwh=60.0, eficiencia_km_por_kwh=5.0)
    politica = PoliticaReabastecimento(
        reserva_critica_percent=18.0,
        margem_seguranca_percent=22.0,
        nivel_recarga_eletrico_percent=80.0,
    )

    res = projetar_paradas_rota(sub_rota, veiculo, politica=politica)

    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.propulsao == TipoPropulsao.ELETRICO
    assert res.total_paradas >= 2

    for parada in res.paradas:
        assert parada.tipo == TipoParada.RECARGA
        assert parada.reserva_estimada_percent >= 18.0
        assert parada.nivel_pos_parada_percent == 80.0  # Meta de 80% respeitada


def test_reserva_critica_aproximadamente_18_porcento(rota_reta_nordeste: list[tuple[float, float]]):
    """Verifica que a reserva crítica de ~18% é respeitada em todo o algoritmo."""
    pol = PoliticaReabastecimento()
    assert pol.reserva_critica_percent == 18.0

    # Força parada ajustando a autonomia do veículo para ser pouco maior que a rota
    # Se rota é 123 km, autonomia nominal de 135 km consumirá 91% -> viola reserva de 18% sem parada
    veiculo = VeiculoCombustao(capacidade_tanque_litros=13.5, consumo_km_por_litro=10.0)
    res = projetar_paradas_rota(rota_reta_nordeste, veiculo, politica=pol)

    assert res.sucesso is True
    assert res.total_paradas >= 1
    for parada in res.paradas:
        assert parada.reserva_estimada_percent >= 18.0


def test_caso_fronteira_exatamente_no_limite_da_reserva():
    """Cenário de fronteira: chegada com exatamente a reserva crítica não requer parada."""
    # Rota sintética com exatamente 100 km
    # (-8.0, -35.0) até (-8.0, -35.908) ~ 100 km
    geo = [(-8.0000, -35.0000), (-8.0000, -35.9080)]
    dist_m = calcular_distancias_acumuladas(geo)[-1]
    dist_km = dist_m / 1000.0

    # Configura veículo para que a distância consuma exatamente 82% do tanque (deixando 18% exatos)
    # consumo_pct = (dist_km / autonomia) * 100 = 82% => autonomia = dist_km / 0.82
    autonomia_alvo = dist_km / 0.82
    veiculo = VeiculoCombustao(capacidade_tanque_litros=autonomia_alvo / 10.0, consumo_km_por_litro=10.0)

    res = projetar_paradas_rota(geo, veiculo)
    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.status == StatusAutonomia.SEM_PARADAS_NECESSARIAS
    assert res.reserva_final_percent == pytest.approx(18.0, abs=0.2)


def test_caso_fronteira_violando_reserva_por_margem_minima():
    """Quando o percurso deixaria 17.8% (< 18.0%), uma parada é obrigatoriamente projetada."""
    geo = [(-8.0000, -35.0000), (-8.0000, -35.9080)]
    dist_m = calcular_distancias_acumuladas(geo)[-1]
    dist_km = dist_m / 1000.0

    # Autonomia calculada para deixar 17.5% no destino (consumindo 82.5%)
    autonomia_alvo = dist_km / 0.825
    veiculo = VeiculoCombustao(capacidade_tanque_litros=autonomia_alvo / 10.0, consumo_km_por_litro=10.0)

    res = projetar_paradas_rota(geo, veiculo)
    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.status == StatusAutonomia.PARADAS_NECESSARIAS
    assert res.total_paradas >= 1


def test_nivel_inicial_abaixo_da_reserva_critica(rota_reta_nordeste: list[tuple[float, float]]):
    """Veículo com nível inicial <= 18% não possui solução segura para iniciar a viagem."""
    veiculo = VeiculoCombustao(
        capacidade_tanque_litros=50.0,
        consumo_km_por_litro=12.0,
        nivel_inicial_percent=15.0,  # 15% < 18% crítica
    )
    res = projetar_paradas_rota(rota_reta_nordeste, veiculo)

    assert res.sucesso is True
    assert res.solucao_segura is False
    assert res.status == StatusAutonomia.RESERVA_CRITICA_VIOLADA
    assert "abaixo dela" in (res.mensagem or "")

    # Modo estrito lança ReservaCriticaVioladaError
    with pytest.raises(ReservaCriticaVioladaError):
        projetar_paradas_rota(rota_reta_nordeste, veiculo, modo_estrito=True)


def test_nivel_inicial_exatamente_na_reserva_critica(rota_reta_nordeste: list[tuple[float, float]]):
    """Nível inicial exatamente em 18.0% é considerado na reserva crítica e inseguro."""
    veiculo = VeiculoCombustao(
        capacidade_tanque_litros=50.0,
        consumo_km_por_litro=12.0,
        nivel_inicial_percent=18.0,
    )
    res = projetar_paradas_rota(rota_reta_nordeste, veiculo)
    assert res.solucao_segura is False
    assert res.status == StatusAutonomia.RESERVA_CRITICA_VIOLADA


def test_nivel_inicial_parcial_seguro(rota_reta_nordeste: list[tuple[float, float]]):
    """Veículo com nível inicial de 40% (autonomia de 240 km para rota de 123 km)."""
    veiculo = VeiculoCombustao(
        capacidade_tanque_litros=50.0,
        consumo_km_por_litro=12.0,
        nivel_inicial_percent=40.0,  # Efetivo: 240 km
    )
    # Rota tem ~123 km, que consome ~20.5%. Restante no destino: 40 - 20.5 = 19.5% >= 18%
    res = projetar_paradas_rota(rota_reta_nordeste, veiculo)
    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.status == StatusAutonomia.SEM_PARADAS_NECESSARIAS
    assert res.reserva_final_percent == pytest.approx(19.5, abs=1.5)


# ---------------------------------------------------------------------------
# 5. Distinção Contratual: Ponto Projetado vs Estabelecimento Verificado
# ---------------------------------------------------------------------------


def test_distincao_ponto_projetado_vs_estabelecimento_verificado(
    rota_longa_nordeste_sudeste: list[tuple[float, float]],
):
    """Garante que todas as paradas são marcadas como projeções matemáticas e não postos reais."""
    veiculo = VeiculoCombustao(capacidade_tanque_litros=40.0, consumo_km_por_litro=10.0)
    res = projetar_paradas_rota(rota_longa_nordeste_sudeste, veiculo)

    assert res.estabelecimentos_confirmados is False
    assert len(res.paradas) > 0

    for parada in res.paradas:
        assert parada.eh_ponto_projetado is True
        assert parada.estabelecimento_verificado is False
        assert parada.detalhes_estabelecimento is None
        assert parada.origem == OrigemParada.PROJETADO
        assert "não verificado em catálogo externo" in (parada.descricao or "")
        assert "Ponto Projetado" in parada.nome


def test_paradas_posicionadas_estritamente_sobre_a_geometria(
    rota_reta_nordeste: list[tuple[float, float]],
):
    """Verifica se as coordenadas das paradas estão matematicamente sobre a rodovia."""
    # Força parada diminuindo a autonomia
    veiculo = VeiculoCombustao(capacidade_tanque_litros=10.0, consumo_km_por_litro=10.0)  # 100 km nominais
    res = projetar_paradas_rota(rota_reta_nordeste, veiculo)

    assert len(res.paradas) >= 1
    for parada in res.paradas:
        lat = parada.coordenadas.latitude
        lon = parada.coordenadas.longitude

        # As coordenadas devem estar dentro dos limites geográficos da rota
        lats_rota = [p[0] for p in rota_reta_nordeste]
        lons_rota = [p[1] for p in rota_reta_nordeste]

        assert min(lats_rota) <= lat <= max(lats_rota)
        assert min(lons_rota) <= lon <= max(lons_rota)


def test_origem_e_destino_coincidentes():
    """Origem e destino no mesmo ponto (distância zero) não requerem paradas."""
    geo_zero = [(-8.0500, -34.8800), (-8.0500, -34.8800)]
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=12.0)

    res = projetar_paradas_rota(geo_zero, veiculo)
    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.status == StatusAutonomia.SEM_PARADAS_NECESSARIAS
    assert res.distancia_total_km == 0.0
    assert res.total_paradas == 0


# ---------------------------------------------------------------------------
# 6. Testes da Classe PostosService e Execução Assíncrona
# ---------------------------------------------------------------------------


def test_postos_service_classe_sincrona(rota_reta_nordeste: list[tuple[float, float]]):
    """Valida instanciação e método síncrono da classe PostosService."""
    service = PostosService()
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=12.0)

    res = service.calcular_paradas(rota_reta_nordeste, veiculo)
    assert res.sucesso is True
    assert res.status == StatusAutonomia.SEM_PARADAS_NECESSARIAS


@pytest.mark.asyncio
async def test_postos_service_classe_assincrona(rota_reta_nordeste: list[tuple[float, float]]):
    """Valida o método assíncrono calcular_paradas_async pronto para o endpoint /planejar."""
    service = PostosService()
    veiculo = VeiculoCombustao(capacidade_tanque_litros=50.0, consumo_km_por_litro=12.0)

    res = await service.calcular_paradas_async(rota_reta_nordeste, veiculo)
    assert res.sucesso is True
    assert res.solucao_segura is True
    assert res.status == StatusAutonomia.SEM_PARADAS_NECESSARIAS


def test_modo_estrito_lanca_excecoes_parametros_invalidos():
    """Valida que o parâmetro modo_estrito=True lança exceções de domínio tipadas."""
    geo = [(-8.0, -34.0), (-8.5, -34.5)]
    veiculo_invalido = {"propulsao": "combustao", "capacidade_tanque_l": -10.0, "consumo_km_l": 10.0}

    with pytest.raises(ParametrosVeiculoInvalidosError):
        projetar_paradas_rota(geo, veiculo_invalido, modo_estrito=True)


def test_modo_estrito_lanca_autonomia_insuficiente(
    rota_longa_nordeste_sudeste: list[tuple[float, float]],
):
    """Valida lançamento de AutonomiaInsuficienteError em modo estrito para percurso inviável."""
    # Veículo com capacidade minúscula (0.1 L * 10 km/L = 1 km) numa rota interestadual
    veiculo_inviavel = VeiculoCombustao(capacidade_tanque_litros=0.1, consumo_km_por_litro=10.0)
    with pytest.raises(AutonomiaInsuficienteError):
        projetar_paradas_rota(rota_longa_nordeste_sudeste, veiculo_inviavel, modo_estrito=True)
