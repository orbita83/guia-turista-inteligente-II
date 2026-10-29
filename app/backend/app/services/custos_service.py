"""Serviço de domínio para custos, pedágios, relevo e rateio entre passageiros.

Responsabilidade (Aluno 3 — Data & Altimetry Engineer):
- Calcular combustível (km/L e R$/L) e energia elétrica (km/kWh e R$/kWh).
- Aplicar ajuste de relevo somente quando recebido com método e fonte explícitos.
- Representar pedágios verificados, estimados e indisponíveis sem inventar tarifas.
- Deduplicar praças por identificação estável.
- Ratear o custo total entre 1 e 8 passageiros com aritmética decimal e centavos
  residuais distribuídos de forma determinística.
- Expor contrato estruturado para integração futura pelo Aluno 2 no /planejar.
"""

from __future__ import annotations

from collections.abc import Sequence
from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from app.schemas.roteiros import (
    AjusteRelevo,
    AjusteRelevoResultado,
    ConfiabilidadePedagio,
    CotaPassageiro,
    Pedagio,
    RateioPassageiros,
    ResultadoCustoPropulsao,
    ResultadoCustosViagem,
    ResumoPedagios,
    StatusAjusteRelevo,
    StatusCustosViagem,
    StatusPedagios,
    TipoPropulsao,
)

CENTAVOS = Decimal("0.01")
PRECISAO_CONSUMO = Decimal("0.000001")
CEM = Decimal(100)
LIMITE_PASSAGEIROS_MIN = 1
LIMITE_PASSAGEIROS_MAX = 8

MENSAGEM_RELEVO_INDISPONIVEL = (
    "Ajuste por relevo indisponível: nenhum modelo quantitativo validado foi "
    "fornecido. O consumo base não foi penalizado com percentual fictício."
)
MENSAGEM_PEDAGIO_INDISPONIVEL = (
    "Total de pedágios indisponível: ausência de dados não equivale a custo zero."
)


class CustosServiceError(Exception):
    """Exceção base para falhas do serviço de custos."""


class ParametrosCustoInvalidosError(CustosServiceError):
    """Distância, consumo, preço, propulsão ou passageiros inválidos."""


class PedagioDuplicadoConflitanteError(CustosServiceError):
    """Duas entradas usam a mesma identificação de praça com conteúdos divergentes."""


class RateioInvalidoError(CustosServiceError):
    """Quantidade de passageiros ou valor a ratear inválido."""


def _converter_decimal(valor: object, campo: str) -> Decimal:
    if valor is None or isinstance(valor, bool):
        raise ParametrosCustoInvalidosError(f"{campo} ausente ou inválido: {valor!r}.")
    try:
        numero = Decimal(str(valor))
    except (InvalidOperation, TypeError, ValueError) as exc:
        raise ParametrosCustoInvalidosError(
            f"{campo} não é um número decimal válido: {valor!r}."
        ) from exc
    if not numero.is_finite():
        raise ParametrosCustoInvalidosError(f"{campo} deve ser um número finito: {valor!r}.")
    return numero


def _validar_distancia(distancia_km: object) -> Decimal:
    distancia = _converter_decimal(distancia_km, "Distância")
    if distancia < 0:
        raise ParametrosCustoInvalidosError(
            f"Distância não pode ser negativa: {distancia_km!r} km."
        )
    return distancia


def _validar_positivo(valor: object, campo: str) -> Decimal:
    numero = _converter_decimal(valor, campo)
    if numero <= 0:
        raise ParametrosCustoInvalidosError(
            f"{campo} deve ser estritamente positivo: {valor!r}."
        )
    return numero


def _quantizar_dinheiro(valor: Decimal) -> Decimal:
    return valor.quantize(CENTAVOS, rounding=ROUND_HALF_UP)


def _quantizar_consumo(valor: Decimal) -> Decimal:
    return valor.quantize(PRECISAO_CONSUMO, rounding=ROUND_HALF_UP)


def _adicionar_unico(destino: list[str], valor: str | None) -> None:
    if valor:
        texto = valor.strip()
        if texto and texto not in destino:
            destino.append(texto)


def _resolver_ajuste_relevo(
    ajuste_relevo: AjusteRelevo | None,
) -> tuple[AjusteRelevoResultado, Decimal]:
    if ajuste_relevo is None:
        return (
            AjusteRelevoResultado(
                status=StatusAjusteRelevo.INDISPONIVEL,
                limitacoes=MENSAGEM_RELEVO_INDISPONIVEL,
            ),
            Decimal(1),
        )

    variacao = _converter_decimal(
        ajuste_relevo.variacao_consumo_percent,
        "Variação de consumo por relevo",
    )
    if variacao <= Decimal(-100):
        raise ParametrosCustoInvalidosError(
            "A variação de consumo por relevo deve ser maior que -100%."
        )

    fator = Decimal(1) + (variacao / CEM)
    if fator <= 0:
        raise ParametrosCustoInvalidosError(
            "O fator de consumo resultante do relevo deve ser positivo."
        )

    return (
        AjusteRelevoResultado(
            status=StatusAjusteRelevo.APLICADO,
            variacao_consumo_percent=variacao,
            fator_consumo=fator,
            metodo=ajuste_relevo.metodo,
            fonte=ajuste_relevo.fonte,
            limitacoes=ajuste_relevo.limitacoes,
        ),
        fator,
    )


def calcular_custo_combustivel(
    distancia_km: Decimal | float,
    consumo_km_por_litro: Decimal | float,
    preco_por_litro: Decimal | float,
    ajuste_relevo: AjusteRelevo | None = None,
) -> ResultadoCustoPropulsao:
    """Calcula litros consumidos e custo de combustível.

    Fórmulas:
        consumo_base_l = distancia_km / consumo_km_por_litro
        consumo_estimado_l = consumo_base_l * fator_relevo
        custo_brl = consumo_estimado_l * preco_por_litro

    O custo é arredondado para centavos com ROUND_HALF_UP.
    """
    distancia = _validar_distancia(distancia_km)
    consumo = _validar_positivo(consumo_km_por_litro, "Consumo em km/L")
    preco = _validar_positivo(preco_por_litro, "Preço do combustível em R$/L")
    ajuste_resultado, fator = _resolver_ajuste_relevo(ajuste_relevo)

    consumo_base = distancia / consumo
    consumo_estimado = consumo_base * fator
    custo = _quantizar_dinheiro(consumo_estimado * preco)

    return ResultadoCustoPropulsao(
        propulsao=TipoPropulsao.COMBUSTAO,
        distancia_km=distancia,
        consumo_base=_quantizar_consumo(consumo_base),
        consumo_estimado=_quantizar_consumo(consumo_estimado),
        unidade_consumo="L",
        preco_unitario=preco,
        unidade_preco="BRL/L",
        fator_relevo=fator,
        ajuste_relevo=ajuste_resultado,
        custo=custo,
    )


def calcular_custo_energia(
    distancia_km: Decimal | float,
    eficiencia_km_por_kwh: Decimal | float,
    preco_por_kwh: Decimal | float,
    ajuste_relevo: AjusteRelevo | None = None,
) -> ResultadoCustoPropulsao:
    """Calcula kWh consumidos e custo de energia elétrica.

    Fórmulas:
        consumo_base_kwh = distancia_km / eficiencia_km_por_kwh
        consumo_estimado_kwh = consumo_base_kwh * fator_relevo
        custo_brl = consumo_estimado_kwh * preco_por_kwh

    Não são adicionadas perdas de carregamento sem uma fonte explícita. Se o
    integrador quiser representá-las, deve incluí-las no preço ou no ajuste
    informado, documentando a hipótese.
    """
    distancia = _validar_distancia(distancia_km)
    eficiencia = _validar_positivo(eficiencia_km_por_kwh, "Eficiência em km/kWh")
    preco = _validar_positivo(preco_por_kwh, "Preço da energia em R$/kWh")
    ajuste_resultado, fator = _resolver_ajuste_relevo(ajuste_relevo)

    consumo_base = distancia / eficiencia
    consumo_estimado = consumo_base * fator
    custo = _quantizar_dinheiro(consumo_estimado * preco)

    return ResultadoCustoPropulsao(
        propulsao=TipoPropulsao.ELETRICO,
        distancia_km=distancia,
        consumo_base=_quantizar_consumo(consumo_base),
        consumo_estimado=_quantizar_consumo(consumo_estimado),
        unidade_consumo="kWh",
        preco_unitario=preco,
        unidade_preco="BRL/kWh",
        fator_relevo=fator,
        ajuste_relevo=ajuste_resultado,
        custo=custo,
    )


def calcular_pedagios(
    pedagios: Sequence[Pedagio] | None = None,
    *,
    rota_sem_pedagios_confirmada: bool = False,
) -> ResumoPedagios:
    """Consolida pedágios, deduplicando praças e preservando a procedência.

    A identificação estável é ``id_praca`` normalizada por ``strip().casefold()``.
    Entradas repetidas com conteúdo idêntico são contadas uma única vez. Entradas
    com a mesma identificação e conteúdo divergente geram erro, pois não há base
    para escolher silenciosamente um dos valores.

    ``rota_sem_pedagios_confirmada`` só pode ser usada com uma lista vazia ou
    ``None``. Sem essa confirmação, ausência de pedágios é indisponibilidade,
    não custo zero.
    """
    lista = list(pedagios) if pedagios is not None else []

    if rota_sem_pedagios_confirmada and lista:
        raise ParametrosCustoInvalidosError(
            "Rota não pode ser declarada sem pedágios quando praças foram informadas."
        )

    if not lista:
        if rota_sem_pedagios_confirmada:
            return ResumoPedagios(
                status=StatusPedagios.SEM_PEDAGIO_CONFIRMADO,
                total=Decimal("0.00"),
                total_conhecido=Decimal("0.00"),
                total_completo=True,
                pracas_unicas=0,
                pracas=[],
                fontes=[],
                limitacoes=[
                    (
                        "A ausência de pedágios foi declarada pelo solicitante e não "
                        "verificada em provedor externo."
                    )
                ],
            )
        return ResumoPedagios(
            status=StatusPedagios.INDISPONIVEL,
            total=None,
            total_conhecido=Decimal("0.00"),
            total_completo=False,
            pracas_unicas=0,
            pracas=[],
            fontes=[],
            limitacoes=[MENSAGEM_PEDAGIO_INDISPONIVEL],
        )

    unicas: dict[str, Pedagio] = {}
    for pedagio in lista:
        if not isinstance(pedagio, Pedagio):
            raise ParametrosCustoInvalidosError(
                f"Pedágio deve ser um Pedagio válido, recebido: {type(pedagio)}."
            )
        chave = pedagio.id_praca.strip().casefold()
        existente = unicas.get(chave)
        if existente is not None:
            if existente != pedagio:
                raise PedagioDuplicadoConflitanteError(
                    f"A praça {pedagio.id_praca!r} aparece mais de uma vez com "
                    "valores ou metadados divergentes."
                )
            continue
        unicas[chave] = pedagio

    pracas = list(unicas.values())
    total_conhecido = _quantizar_dinheiro(
        sum(
            (pedagio.valor for pedagio in pracas if pedagio.valor is not None),
            Decimal(0),
        )
    )
    indisponiveis = [
        pedagio
        for pedagio in pracas
        if pedagio.confiabilidade == ConfiabilidadePedagio.INDISPONIVEL
    ]
    estimados = [
        pedagio
        for pedagio in pracas
        if pedagio.confiabilidade == ConfiabilidadePedagio.ESTIMADO
    ]

    fontes: list[str] = []
    limitacoes: list[str] = []
    for pedagio in pracas:
        _adicionar_unico(fontes, pedagio.fonte)
        _adicionar_unico(limitacoes, pedagio.limitacoes)

    if indisponiveis:
        status = StatusPedagios.INDISPONIVEL
        total: Decimal | None = None
        total_completo = False
        _adicionar_unico(
            limitacoes,
            "Há praças sem valor confirmado; o total de pedágios não pode ser determinado.",
        )
    elif estimados:
        status = StatusPedagios.ESTIMADO
        total = total_conhecido
        total_completo = True
        _adicionar_unico(
            limitacoes,
            "O total inclui pedágios estimados e não representa tarifas verificadas.",
        )
    else:
        status = StatusPedagios.VERIFICADO
        total = total_conhecido
        total_completo = True

    return ResumoPedagios(
        status=status,
        total=total,
        total_conhecido=total_conhecido,
        total_completo=total_completo,
        pracas_unicas=len(pracas),
        pracas=pracas,
        fontes=fontes,
        limitacoes=limitacoes,
    )


def _validar_passageiros(passageiros: object) -> int:
    if isinstance(passageiros, bool) or not isinstance(passageiros, int):
        raise RateioInvalidoError(
            f"Quantidade de passageiros deve ser inteira: {passageiros!r}."
        )
    if not (LIMITE_PASSAGEIROS_MIN <= passageiros <= LIMITE_PASSAGEIROS_MAX):
        raise RateioInvalidoError(
            f"Quantidade de passageiros deve estar entre {LIMITE_PASSAGEIROS_MIN} "
            f"e {LIMITE_PASSAGEIROS_MAX}: {passageiros}."
        )
    return passageiros


def ratear_custo(
    custo_total: Decimal | float,
    passageiros: int,
) -> RateioPassageiros:
    """Divide o custo em cotas de centavos que somam exatamente o total.

    O total é convertido para centavos com ROUND_HALF_UP. A divisão inteira
    distribui a base igualmente e os centavos residuais são atribuídos aos
    primeiros passageiros (1, 2, ...), um centavo por passageiro. Assim,
    ``sum(cotas) == total_rateado`` sempre.
    """
    quantidade = _validar_passageiros(passageiros)
    total = _converter_decimal(custo_total, "Custo total")
    if total < 0:
        raise RateioInvalidoError(f"Custo total não pode ser negativo: {custo_total!r}.")

    total_centavos = int((total * 100).quantize(Decimal(1), rounding=ROUND_HALF_UP))
    base_centavos, residuo = divmod(total_centavos, quantidade)

    cotas: list[CotaPassageiro] = []
    for indice in range(quantidade):
        centavos = base_centavos + (1 if indice < residuo else 0)
        cotas.append(
            CotaPassageiro(
                passageiro=indice + 1,
                valor=_quantizar_dinheiro(Decimal(centavos) / 100),
            )
        )

    total_rateado = _quantizar_dinheiro(sum((cota.valor for cota in cotas), Decimal(0)))
    return RateioPassageiros(
        quantidade=quantidade,
        total_rateado=total_rateado,
        cotas=cotas,
    )


def _resultado_invalido(
    erro: CustosServiceError,
    passageiros: object,
) -> ResultadoCustosViagem:
    quantidade = (
        passageiros
        if isinstance(passageiros, int)
        and not isinstance(passageiros, bool)
        and LIMITE_PASSAGEIROS_MIN <= passageiros <= LIMITE_PASSAGEIROS_MAX
        else 1
    )
    return ResultadoCustosViagem(
        sucesso=False,
        status=StatusCustosViagem.INVALIDO,
        mensagem=str(erro),
        passageiros=quantidade,
        limitacoes=[
            "Nenhum parâmetro inválido foi substituído por valor plausível ou zero.",
            "Nenhum total parcial ou completo foi produzido para esta entrada.",
        ],
    )


def calcular_custos_viagem(
    *,
    distancia_km: Decimal | float,
    propulsao: TipoPropulsao | str,
    consumo_km_por_litro: Decimal | float | None = None,
    preco_combustivel_por_litro: Decimal | float | None = None,
    eficiencia_km_por_kwh: Decimal | float | None = None,
    preco_energia_por_kwh: Decimal | float | None = None,
    ajuste_relevo: AjusteRelevo | None = None,
    pedagios: Sequence[Pedagio] | None = None,
    rota_sem_pedagios_confirmada: bool = False,
    passageiros: int = 1,
    modo_estrito: bool = False,
) -> ResultadoCustosViagem:
    """Calcula o custo completo ou parcial de uma viagem e seu rateio.

    A propulsão determina quais parâmetros são obrigatórios. Valores ausentes ou
    inválidos não são substituídos por padrões. Com ``modo_estrito=False``,
    entradas inválidas retornam ``sucesso=False`` e ``status=invalido``; com
    ``modo_estrito=True``, a exceção de domínio correspondente é lançada.

    O total é a soma dos componentes disponíveis. Quando o total de pedágios é
    indeterminável, ``custo_pedagios`` fica ``None``, ``total_completo`` fica
    ``False`` e o resultado é marcado como parcial; pedágios conhecidos ainda
    entram em ``custo_pedagios_conhecido`` e no total conhecido.
    """
    try:
        quantidade = _validar_passageiros(passageiros)
        try:
            tipo_propulsao = TipoPropulsao(propulsao)
        except (TypeError, ValueError) as exc:
            raise ParametrosCustoInvalidosError(
                f"Tipo de propulsão não suportado: {propulsao!r}."
            ) from exc

        if tipo_propulsao == TipoPropulsao.COMBUSTAO:
            if consumo_km_por_litro is None:
                raise ParametrosCustoInvalidosError(
                    "Veículo a combustão requer consumo em km/L."
                )
            if preco_combustivel_por_litro is None:
                raise ParametrosCustoInvalidosError(
                    "Veículo a combustão requer preço do combustível em R$/L."
                )
            custo_propulsao = calcular_custo_combustivel(
                distancia_km=distancia_km,
                consumo_km_por_litro=consumo_km_por_litro,
                preco_por_litro=preco_combustivel_por_litro,
                ajuste_relevo=ajuste_relevo,
            )
        else:
            if eficiencia_km_por_kwh is None:
                raise ParametrosCustoInvalidosError(
                    "Veículo elétrico requer eficiência em km/kWh."
                )
            if preco_energia_por_kwh is None:
                raise ParametrosCustoInvalidosError(
                    "Veículo elétrico requer preço da energia em R$/kWh."
                )
            custo_propulsao = calcular_custo_energia(
                distancia_km=distancia_km,
                eficiencia_km_por_kwh=eficiencia_km_por_kwh,
                preco_por_kwh=preco_energia_por_kwh,
                ajuste_relevo=ajuste_relevo,
            )

        resumo_pedagios = calcular_pedagios(
            pedagios,
            rota_sem_pedagios_confirmada=rota_sem_pedagios_confirmada,
        )
        pedagios_no_total = (
            resumo_pedagios.total
            if resumo_pedagios.total is not None
            else resumo_pedagios.total_conhecido
        )
        custo_total = _quantizar_dinheiro(custo_propulsao.custo + pedagios_no_total)
        total_completo = resumo_pedagios.total_completo
        rateio = ratear_custo(custo_total, quantidade)

        hipoteses = [
            "O consumo informado é tratado como média representativa da rota.",
            "Os preços unitários foram fornecidos pelo solicitante e não consultados em tempo real.",
        ]
        fontes: list[str] = []
        limitacoes = [
            (
                "O cálculo não considera trânsito, clima, estilo de condução, ocupação "
                "ou perdas de carregamento."
            ),
            (
                "Pedágios só são tratados como zero quando a rota é declarada sem praças; "
                "ausência de dados não é convertida em zero."
            ),
        ]

        if custo_propulsao.ajuste_relevo.status == StatusAjusteRelevo.APLICADO:
            hipoteses.append(
                "A variação de consumo por relevo foi aplicada como multiplicador "
                "sobre o consumo base, conforme método e fonte informados."
            )
            _adicionar_unico(fontes, custo_propulsao.ajuste_relevo.fonte)
            _adicionar_unico(
                limitacoes,
                custo_propulsao.ajuste_relevo.limitacoes,
            )
        else:
            hipoteses.append(
                "Nenhum ajuste quantitativo por relevo foi aplicado; o consumo base "
                "não foi penalizado."
            )
            _adicionar_unico(
                limitacoes,
                MENSAGEM_RELEVO_INDISPONIVEL,
            )

        for fonte in resumo_pedagios.fontes:
            _adicionar_unico(fontes, fonte)
        for limitacao in resumo_pedagios.limitacoes:
            _adicionar_unico(limitacoes, limitacao)

        if not total_completo:
            _adicionar_unico(
                limitacoes,
                "Total parcial: existe componente obrigatório indisponível e o "
                "valor apresentado não deve ser tratado como custo final.",
            )

        if resumo_pedagios.status == StatusPedagios.ESTIMADO:
            mensagem = "Custo completo em termos de componentes, mas inclui pedágios estimados."
        elif not total_completo:
            mensagem = "Custo parcial: o total de pedágios não pôde ser determinado."
        else:
            mensagem = None

        return ResultadoCustosViagem(
            sucesso=True,
            status=(
                StatusCustosViagem.COMPLETO
                if total_completo
                else StatusCustosViagem.PARCIAL
            ),
            mensagem=mensagem,
            distancia_km=custo_propulsao.distancia_km,
            unidade_distancia="km",
            propulsao=tipo_propulsao,
            consumo_estimado=custo_propulsao.consumo_estimado,
            unidade_consumo=custo_propulsao.unidade_consumo,
            custo_combustivel=(
                custo_propulsao.custo
                if tipo_propulsao == TipoPropulsao.COMBUSTAO
                else None
            ),
            custo_energia=(
                custo_propulsao.custo
                if tipo_propulsao == TipoPropulsao.ELETRICO
                else None
            ),
            custo_propulsao=custo_propulsao.custo,
            custo_pedagios=resumo_pedagios.total,
            custo_pedagios_conhecido=resumo_pedagios.total_conhecido,
            pedagios=resumo_pedagios,
            ajuste_relevo=custo_propulsao.ajuste_relevo,
            custo_total=custo_total,
            total_completo=total_completo,
            passageiros=quantidade,
            rateio=rateio,
            hipoteses=hipoteses,
            fontes=fontes,
            limitacoes=limitacoes,
        )
    except CustosServiceError as exc:
        if modo_estrito:
            raise
        return _resultado_invalido(exc, passageiros)


class CustosService:
    """Fachada síncrona e assíncrona do serviço de custos."""

    def calcular(
        self,
        *,
        distancia_km: Decimal | float,
        propulsao: TipoPropulsao | str,
        consumo_km_por_litro: Decimal | float | None = None,
        preco_combustivel_por_litro: Decimal | float | None = None,
        eficiencia_km_por_kwh: Decimal | float | None = None,
        preco_energia_por_kwh: Decimal | float | None = None,
        ajuste_relevo: AjusteRelevo | None = None,
        pedagios: Sequence[Pedagio] | None = None,
        rota_sem_pedagios_confirmada: bool = False,
        passageiros: int = 1,
        modo_estrito: bool = False,
    ) -> ResultadoCustosViagem:
        return calcular_custos_viagem(
            distancia_km=distancia_km,
            propulsao=propulsao,
            consumo_km_por_litro=consumo_km_por_litro,
            preco_combustivel_por_litro=preco_combustivel_por_litro,
            eficiencia_km_por_kwh=eficiencia_km_por_kwh,
            preco_energia_por_kwh=preco_energia_por_kwh,
            ajuste_relevo=ajuste_relevo,
            pedagios=pedagios,
            rota_sem_pedagios_confirmada=rota_sem_pedagios_confirmada,
            passageiros=passageiros,
            modo_estrito=modo_estrito,
        )

    async def calcular_async(
        self,
        *,
        distancia_km: Decimal | float,
        propulsao: TipoPropulsao | str,
        consumo_km_por_litro: Decimal | float | None = None,
        preco_combustivel_por_litro: Decimal | float | None = None,
        eficiencia_km_por_kwh: Decimal | float | None = None,
        preco_energia_por_kwh: Decimal | float | None = None,
        ajuste_relevo: AjusteRelevo | None = None,
        pedagios: Sequence[Pedagio] | None = None,
        rota_sem_pedagios_confirmada: bool = False,
        passageiros: int = 1,
        modo_estrito: bool = False,
    ) -> ResultadoCustosViagem:
        return self.calcular(
            distancia_km=distancia_km,
            propulsao=propulsao,
            consumo_km_por_litro=consumo_km_por_litro,
            preco_combustivel_por_litro=preco_combustivel_por_litro,
            eficiencia_km_por_kwh=eficiencia_km_por_kwh,
            preco_energia_por_kwh=preco_energia_por_kwh,
            ajuste_relevo=ajuste_relevo,
            pedagios=pedagios,
            rota_sem_pedagios_confirmada=rota_sem_pedagios_confirmada,
            passageiros=passageiros,
            modo_estrito=modo_estrito,
        )
