"""Testes de domínio do serviço de custos, pedágios, relevo e rateio (Issue #29).

Cobertura:
- Fórmulas reais de combustão e energia elétrica.
- Distância zero, valores negativos, ausentes, não finitos e divisão por zero.
- Rateio de 1 a 8 passageiros e distribuição determinística de centavos.
- Pedágios verificados, estimados, indisponíveis e rota comprovadamente sem praças.
- Deduplicação de praças por identificação estável.
- Ajuste de relevo com procedência explícita e ausência declarada.
- Consistência entre componentes, total e soma das cotas.
"""

from __future__ import annotations

from decimal import Decimal

import pytest
from pydantic import ValidationError

from app.schemas.roteiros import (
    AjusteRelevo,
    ConfiabilidadePedagio,
    Pedagio,
    StatusAjusteRelevo,
    StatusCustosViagem,
    StatusPedagios,
    TipoPropulsao,
)
from app.services.custos_service import (
    CustosService,
    ParametrosCustoInvalidosError,
    PedagioDuplicadoConflitanteError,
    RateioInvalidoError,
    calcular_custo_combustivel,
    calcular_custo_energia,
    calcular_custos_viagem,
    calcular_pedagios,
    ratear_custo,
)


def pedagio_verificado(
    id_praca: str,
    valor: str,
    *,
    fonte: str = "Tabela oficial da concessionária",
) -> Pedagio:
    return Pedagio(
        id_praca=id_praca,
        valor=Decimal(valor),
        confiabilidade=ConfiabilidadePedagio.VERIFICADO,
        fonte=fonte,
    )


def pedagio_estimado(
    id_praca: str,
    valor: str,
    *,
    fonte: str = "Base interna de tarifas",
    metodo: str = "Média regional documentada",
) -> Pedagio:
    return Pedagio(
        id_praca=id_praca,
        valor=Decimal(valor),
        confiabilidade=ConfiabilidadePedagio.ESTIMADO,
        fonte=fonte,
        metodo_estimativa=metodo,
        limitacoes="Estimativa não confirmada na praça física.",
    )


def pedagio_indisponivel(id_praca: str) -> Pedagio:
    return Pedagio(
        id_praca=id_praca,
        confiabilidade=ConfiabilidadePedagio.INDISPONIVEL,
        limitacoes="Tarifa não obtida para esta praça.",
    )


# ---------------------------------------------------------------------------
# 1. Combustível e energia
# ---------------------------------------------------------------------------


def test_calculo_combustivel_litros_e_custo():
    resultado = calcular_custo_combustivel(300.0, 10.0, 5.0)

    assert resultado.propulsao == TipoPropulsao.COMBUSTAO
    assert resultado.consumo_base == Decimal("30.000000")
    assert resultado.consumo_estimado == Decimal("30.000000")
    assert resultado.unidade_consumo == "L"
    assert resultado.custo == Decimal("150.00")
    assert resultado.ajuste_relevo.status == StatusAjusteRelevo.INDISPONIVEL
    assert resultado.fator_relevo == Decimal(1)


def test_calculo_energia_kwh_e_custo():
    resultado = calcular_custo_energia(300.0, 5.0, Decimal("0.80"))

    assert resultado.propulsao == TipoPropulsao.ELETRICO
    assert resultado.consumo_base == Decimal("60.000000")
    assert resultado.consumo_estimado == Decimal("60.000000")
    assert resultado.unidade_consumo == "kWh"
    assert resultado.custo == Decimal("48.00")
    assert resultado.unidade_preco == "BRL/kWh"


def test_distancia_zero_gera_consumo_e_custo_zero():
    combustao = calcular_custo_combustivel(0.0, 10.0, 5.0)
    eletrico = calcular_custo_energia(0.0, 5.0, Decimal("0.80"))

    assert combustao.consumo_estimado == Decimal("0.000000")
    assert combustao.custo == Decimal("0.00")
    assert eletrico.consumo_estimado == Decimal("0.000000")
    assert eletrico.custo == Decimal("0.00")


@pytest.mark.parametrize("invalido", [0.0, -1.0, float("nan"), float("inf")])
def test_consumo_ou_preco_invalidos_sao_rejeitados(invalido: float):
    with pytest.raises(ParametrosCustoInvalidosError):
        calcular_custo_combustivel(100.0, invalido, 5.0)
    with pytest.raises(ParametrosCustoInvalidosError):
        calcular_custo_combustivel(100.0, 10.0, invalido)
    with pytest.raises(ParametrosCustoInvalidosError):
        calcular_custo_energia(100.0, invalido, Decimal("0.80"))
    with pytest.raises(ParametrosCustoInvalidosError):
        calcular_custo_energia(100.0, 5.0, invalido)


def test_distancia_negativa_e_dados_ausentes():
    with pytest.raises(ParametrosCustoInvalidosError):
        calcular_custo_combustivel(-1.0, 10.0, 5.0)

    resultado = calcular_custos_viagem(
        distancia_km=100.0,
        propulsao="combustao",
        preco_combustivel_por_litro=5.0,
    )
    assert resultado.sucesso is False
    assert resultado.status == StatusCustosViagem.INVALIDO
    assert resultado.custo_total is None
    assert resultado.rateio is None
    assert "consumo" in (resultado.mensagem or "").lower()

    with pytest.raises(ParametrosCustoInvalidosError):
        calcular_custos_viagem(
            distancia_km=100.0,
            propulsao="combustao",
            preco_combustivel_por_litro=5.0,
            modo_estrito=True,
        )


# ---------------------------------------------------------------------------
# 2. Rateio entre passageiros
# ---------------------------------------------------------------------------


def test_rateio_um_passageiro():
    rateio = ratear_custo(Decimal("160.00"), 1)

    assert rateio.quantidade == 1
    assert rateio.total_rateado == Decimal("160.00")
    assert len(rateio.cotas) == 1
    assert rateio.cotas[0].valor == Decimal("160.00")


def test_rateio_oito_passageiros():
    rateio = ratear_custo(Decimal("100.00"), 8)

    assert rateio.quantidade == 8
    assert [cota.valor for cota in rateio.cotas] == [Decimal("12.50")] * 8
    assert sum((cota.valor for cota in rateio.cotas), Decimal(0)) == Decimal("100.00")


@pytest.mark.parametrize("quantidade", [0, 9, -1, 2.5, True])
def test_rateio_quantidade_invalida(quantidade: object):
    with pytest.raises(RateioInvalidoError):
        ratear_custo(Decimal("100.00"), quantidade)  # type: ignore[arg-type]


def test_rateio_distribui_centavos_residuais():
    rateio = ratear_custo(Decimal("100.00"), 3)

    assert [cota.valor for cota in rateio.cotas] == [
        Decimal("33.34"),
        Decimal("33.33"),
        Decimal("33.33"),
    ]
    assert rateio.total_rateado == Decimal("100.00")
    assert sum((cota.valor for cota in rateio.cotas), Decimal(0)) == rateio.total_rateado

    outro = ratear_custo(Decimal("10.00"), 3)
    assert [cota.valor for cota in outro.cotas] == [
        Decimal("3.34"),
        Decimal("3.33"),
        Decimal("3.33"),
    ]
    assert sum((cota.valor for cota in outro.cotas), Decimal(0)) == Decimal("10.00")


# ---------------------------------------------------------------------------
# 3. Pedágios
# ---------------------------------------------------------------------------


def test_pedagios_verificados_somam_sem_duplicidade():
    resumo = calcular_pedagios(
        [
            pedagio_verificado("BR-101:km-10", "10.00"),
            pedagio_verificado("BR-101:km-10", "10.00"),
            pedagio_verificado("BR-232:km-50", "7.50"),
        ]
    )

    assert resumo.status == StatusPedagios.VERIFICADO
    assert resumo.pracas_unicas == 2
    assert resumo.total == Decimal("17.50")
    assert resumo.total_conhecido == Decimal("17.50")
    assert resumo.total_completo is True


def test_pedagios_estimados_sao_diferenciados():
    resumo = calcular_pedagios([pedagio_estimado("BR-101:km-10", "12.00")])

    assert resumo.status == StatusPedagios.ESTIMADO
    assert resumo.total == Decimal("12.00")
    assert resumo.total_completo is True
    assert any("estimados" in limitacao for limitacao in resumo.limitacoes)


def test_pedagios_indisponiveis_nao_sao_zero():
    resumo = calcular_pedagios(None)

    assert resumo.status == StatusPedagios.INDISPONIVEL
    assert resumo.total is None
    assert resumo.total_conhecido == Decimal("0.00")
    assert resumo.total_completo is False
    assert any("não equivale a custo zero" in limitacao for limitacao in resumo.limitacoes)


def test_rota_comprovadamente_sem_pedagios():
    resumo = calcular_pedagios([], rota_sem_pedagios_confirmada=True)

    assert resumo.status == StatusPedagios.SEM_PEDAGIO_CONFIRMADO
    assert resumo.total == Decimal("0.00")
    assert resumo.total_completo is True


def test_pedagios_divergentes_com_mesmo_id_sao_rejeitados():
    with pytest.raises(PedagioDuplicadoConflitanteError):
        calcular_pedagios(
            [
                pedagio_verificado("BR-101:km-10", "10.00"),
                pedagio_verificado("BR-101:km-10", "11.00"),
            ]
        )


def test_rota_sem_pedagio_conflita_com_lista_informada():
    with pytest.raises(ParametrosCustoInvalidosError):
        calcular_pedagios(
            [pedagio_verificado("BR-101:km-10", "10.00")],
            rota_sem_pedagios_confirmada=True,
        )


def test_pedagio_estimado_exige_metodo_e_fonte():
    with pytest.raises(ValidationError):
        Pedagio(
            id_praca="BR-101:km-10",
            valor=Decimal("10.00"),
            confiabilidade=ConfiabilidadePedagio.ESTIMADO,
        )


# ---------------------------------------------------------------------------
# 4. Relevo
# ---------------------------------------------------------------------------


def test_relevo_valido_aplica_fator_sobre_consumo():
    ajuste = AjusteRelevo(
        variacao_consumo_percent=Decimal(20),
        metodo="Modelo documentado de consumo em subida",
        fonte="Estudo interno versionado",
        limitacoes="Aplicável apenas ao trecho analisado.",
    )
    resultado = calcular_custo_combustivel(300.0, 10.0, 5.0, ajuste_relevo=ajuste)

    assert resultado.consumo_base == Decimal("30.000000")
    assert resultado.consumo_estimado == Decimal("36.000000")
    assert resultado.fator_relevo == Decimal("1.2")
    assert resultado.custo == Decimal("180.00")
    assert resultado.ajuste_relevo.status == StatusAjusteRelevo.APLICADO
    assert resultado.ajuste_relevo.metodo == ajuste.metodo
    assert resultado.ajuste_relevo.fonte == ajuste.fonte


def test_ausencia_de_relevo_nao_penaliza_consumo():
    resultado = calcular_custo_combustivel(300.0, 10.0, 5.0)

    assert resultado.consumo_estimado == Decimal("30.000000")
    assert resultado.custo == Decimal("150.00")
    assert resultado.ajuste_relevo.status == StatusAjusteRelevo.INDISPONIVEL
    assert resultado.ajuste_relevo.variacao_consumo_percent is None
    assert resultado.ajuste_relevo.fator_consumo is None


def test_relevo_invalido_e_rejeitado():
    with pytest.raises(ValidationError):
        AjusteRelevo(
            variacao_consumo_percent=Decimal(-100),
            metodo="Método",
            fonte="Fonte",
        )


# ---------------------------------------------------------------------------
# 5. Contrato completo e consistência
# ---------------------------------------------------------------------------


def test_valor_desconhecido_nao_e_convertido_em_zero():
    resultado = calcular_custos_viagem(
        distancia_km=300.0,
        propulsao="combustao",
        consumo_km_por_litro=10.0,
        preco_combustivel_por_litro=5.0,
        pedagios=[
            pedagio_verificado("BR-101:km-10", "10.00"),
            pedagio_indisponivel("BR-232:km-50"),
        ],
    )

    assert resultado.sucesso is True
    assert resultado.status == StatusCustosViagem.PARCIAL
    assert resultado.total_completo is False
    assert resultado.custo_pedagios is None
    assert resultado.custo_pedagios_conhecido == Decimal("10.00")
    assert resultado.custo_propulsao == Decimal("150.00")
    assert resultado.custo_total == Decimal("160.00")
    assert resultado.pedagios is not None
    assert resultado.pedagios.total is None
    assert resultado.pedagios.total_conhecido == Decimal("10.00")


def test_componentes_total_e_rateio_sao_consistentes():
    ajuste = AjusteRelevo(
        variacao_consumo_percent=Decimal(10),
        metodo="Modelo documentado",
        fonte="Base versionada",
    )
    resultado = calcular_custos_viagem(
        distancia_km=300.0,
        propulsao="eletrico",
        eficiencia_km_por_kwh=5.0,
        preco_energia_por_kwh=Decimal("0.80"),
        ajuste_relevo=ajuste,
        pedagios=[pedagio_verificado("BR-101:km-10", "10.00")],
        passageiros=3,
    )

    assert resultado.sucesso is True
    assert resultado.status == StatusCustosViagem.COMPLETO
    assert resultado.total_completo is True
    assert resultado.propulsao == TipoPropulsao.ELETRICO
    assert resultado.custo_combustivel is None
    assert resultado.custo_energia == Decimal("52.80")
    assert resultado.custo_pedagios == Decimal("10.00")
    assert resultado.custo_propulsao == Decimal("52.80")
    assert resultado.custo_total == Decimal("62.80")
    assert resultado.custo_total == resultado.custo_propulsao + resultado.custo_pedagios

    assert resultado.rateio is not None
    assert resultado.rateio.quantidade == 3
    assert resultado.rateio.total_rateado == resultado.custo_total
    assert sum(
        (cota.valor for cota in resultado.rateio.cotas), Decimal(0)
    ) == resultado.custo_total
    assert [cota.valor for cota in resultado.rateio.cotas] == [
        Decimal("20.94"),
        Decimal("20.93"),
        Decimal("20.93"),
    ]


def test_rota_sem_pedagio_confirmada_produz_total_completo():
    resultado = calcular_custos_viagem(
        distancia_km=100.0,
        propulsao="combustao",
        consumo_km_por_litro=10.0,
        preco_combustivel_por_litro=5.0,
        pedagios=[],
        rota_sem_pedagios_confirmada=True,
    )

    assert resultado.status == StatusCustosViagem.COMPLETO
    assert resultado.total_completo is True
    assert resultado.custo_pedagios == Decimal("0.00")
    assert resultado.custo_total == Decimal("50.00")
    assert resultado.pedagios is not None
    assert resultado.pedagios.status == StatusPedagios.SEM_PEDAGIO_CONFIRMADO


@pytest.mark.asyncio
async def test_fachada_assincrona_calcula_custos():
    resultado = await CustosService().calcular_async(
        distancia_km=100.0,
        propulsao="combustao",
        consumo_km_por_litro=10.0,
        preco_combustivel_por_litro=5.0,
        pedagios=[],
        rota_sem_pedagios_confirmada=True,
        passageiros=2,
    )

    assert resultado.sucesso is True
    assert resultado.custo_total == Decimal("50.00")
    assert resultado.rateio is not None
    assert [cota.valor for cota in resultado.rateio.cotas] == [
        Decimal("25.00"),
        Decimal("25.00"),
    ]
