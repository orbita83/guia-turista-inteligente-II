"""Serviço de domínio para cálculo de autonomia e projeção de paradas estratégicas.

Responsabilidade (Aluno 3 — Data & Altimetry Engineer):
- Cálculo de consumo e autonomia nominal e efetiva para veículos a combustão e elétricos.
- Projeção de paradas operacionais seguras ao longo da geometria rodoviária real.
- Aplicação estrita da reserva crítica de segurança (~18%).
- Suporte a múltiplas paradas em percursos de longa distância.
- Definição explícita de política de reabastecimento e recarga.
- Distinção transparente entre pontos projetados matematicamente e postos físicos verificados.
- Preparação de contratos desacoplados para futura orquestração pelo Aluno 2 no endpoint /planejar.
"""

from __future__ import annotations

import bisect
import logging
import math
from collections.abc import Sequence
from typing import Any

from app.schemas.roteiros import (
    Coordenada,
    OrigemParada,
    ParadaProjetada,
    ParametrosVeiculo,
    PoliticaReabastecimento,
    ResultadoAutonomia,
    StatusAutonomia,
    TipoParada,
    TipoPropulsao,
    VeiculoCombustao,
    VeiculoEletrico,
)
from app.services.altimetria_service import (
    calcular_distancias_acumuladas,
    converter_geometria_osrm,
    coordenada_valida,
    extrair_coordenadas,
    numero_finito,
    validar_geometria,
)

logger = logging.getLogger("app.services.postos")

# Constantes de domínio e limites operacionais
RESERVA_CRITICA_PADRAO_PCT = 18.0
MARGEM_SEGURANCA_PADRAO_PCT = 22.0
MAX_PARADAS_SEGURANCA = 50

# Limites geográficos do Brasil usados apenas para desambiguar OSRM/GeoJSON [lon, lat]
# quando latitude e longitude estão ambas dentro de [-90, 90].
LIMITE_LAT_BRASIL = (-33.75, 5.27)
LIMITE_LON_BRASIL = (-73.99, -34.79)

FORMATOS_GEOMETRIA = ("auto", "latlon", "lonlat")


# ---------------------------------------------------------------------------
# Exceções de Domínio do Serviço de Autonomia e Postos
# ---------------------------------------------------------------------------


class PostosServiceError(Exception):
    """Exceção base para falhas do serviço de autonomia e postos."""


class ParametrosVeiculoInvalidosError(PostosServiceError):
    """Parâmetros do veículo ausentes, nulos, negativos ou incoerentes."""


class GeometriaRotaInvalidaError(PostosServiceError):
    """Geometria rodoviária ausente, com pontos insuficientes ou fora dos limites."""


class ReservaCriticaVioladaError(PostosServiceError):
    """Nível inicial ou autonomia insuficiente para iniciar com a reserva crítica mínima."""


class AutonomiaInsuficienteError(PostosServiceError):
    """Autonomia insuficiente para completar o percurso mesmo com reabastecimento."""


# ---------------------------------------------------------------------------
# Funções de Cálculo de Autonomia
# ---------------------------------------------------------------------------


def calcular_autonomia_combustao(
    capacidade_tanque_litros: float,
    consumo_km_por_litro: float,
    nivel_inicial_percent: float = 100.0,
    penalizacao_relevo_percent: float = 0.0,
) -> tuple[float, float]:
    """Calcula a autonomia máxima e efetiva para veículo a combustão.

    Fórmulas:
        autonomia_maxima_km = capacidade_tanque_litros * consumo_km_por_litro
        autonomia_efetiva_km = autonomia_maxima_km * (nivel_inicial_percent / 100.0)

    Se penalização de relevo for aplicada (entre -100% e infinito):
        fator_relevo = 1.0 + (penalizacao_relevo_percent / 100.0)
        autonomia_maxima_km = autonomia_maxima_km / fator_relevo
        autonomia_efetiva_km = autonomia_efetiva_km / fator_relevo

    Unidades:
        capacidade_tanque_litros: Litros (L)
        consumo_km_por_litro: km/L
        nivel_inicial_percent: % (0.0 a 100.0)
        Retorno: (autonomia_maxima_km, autonomia_efetiva_km) em quilômetros
    """
    cap = numero_finito(capacidade_tanque_litros)
    cons = numero_finito(consumo_km_por_litro)
    nivel = numero_finito(nivel_inicial_percent)
    penal = numero_finito(penalizacao_relevo_percent)

    if cap is None or cap <= 0.0:
        raise ParametrosVeiculoInvalidosError(
            f"Capacidade do tanque inválida: {capacidade_tanque_litros}. Deve ser > 0 litros."
        )
    if cons is None or cons <= 0.0:
        raise ParametrosVeiculoInvalidosError(
            f"Consumo de combustível inválido: {consumo_km_por_litro}. Deve ser > 0 km/L."
        )
    if nivel is None or not (0.0 <= nivel <= 100.0):
        raise ParametrosVeiculoInvalidosError(
            f"Nível inicial inválido: {nivel_inicial_percent}. Deve estar entre 0.0% e 100.0%."
        )
    if penal is None or penal <= -100.0:
        raise ParametrosVeiculoInvalidosError(
            f"Penalização de relevo inválida: {penalizacao_relevo_percent}. Deve ser > -100.0%."
        )

    autonomia_maxima = cap * cons
    autonomia_efetiva = autonomia_maxima * (nivel / 100.0)

    if penal != 0.0:
        fator = 1.0 + (penal / 100.0)
        autonomia_maxima = autonomia_maxima / fator
        autonomia_efetiva = autonomia_efetiva / fator

    return (autonomia_maxima, autonomia_efetiva)


def calcular_autonomia_eletrico(
    capacidade_bateria_kwh: float,
    eficiencia_km_por_kwh: float,
    nivel_inicial_percent: float = 100.0,
    penalizacao_relevo_percent: float = 0.0,
) -> tuple[float, float]:
    """Calcula a autonomia máxima e efetiva para veículo elétrico (BEV).

    Fórmulas:
        autonomia_maxima_km = capacidade_bateria_kwh * eficiencia_km_por_kwh
        autonomia_efetiva_km = autonomia_maxima_km * (nivel_inicial_percent / 100.0)

    Se penalização de relevo for aplicada (entre -100% e infinito):
        fator_relevo = 1.0 + (penalizacao_relevo_percent / 100.0)
        autonomia_maxima_km = autonomia_maxima_km / fator_relevo
        autonomia_efetiva_km = autonomia_efetiva_km / fator_relevo

    Unidades:
        capacidade_bateria_kwh: Quilowatt-hora (kWh)
        eficiencia_km_por_kwh: km/kWh
        nivel_inicial_percent: % (0.0 a 100.0)
        Retorno: (autonomia_maxima_km, autonomia_efetiva_km) em quilômetros
    """
    cap = numero_finito(capacidade_bateria_kwh)
    efic = numero_finito(eficiencia_km_por_kwh)
    nivel = numero_finito(nivel_inicial_percent)
    penal = numero_finito(penalizacao_relevo_percent)

    if cap is None or cap <= 0.0:
        raise ParametrosVeiculoInvalidosError(
            f"Capacidade da bateria inválida: {capacidade_bateria_kwh}. Deve ser > 0 kWh."
        )
    if efic is None or efic <= 0.0:
        raise ParametrosVeiculoInvalidosError(
            f"Eficiência energética inválida: {eficiencia_km_por_kwh}. Deve ser > 0 km/kWh."
        )
    if nivel is None or not (0.0 <= nivel <= 100.0):
        raise ParametrosVeiculoInvalidosError(
            f"Nível inicial de carga inválido: {nivel_inicial_percent}. Deve estar entre 0.0% e 100.0%."
        )
    if penal is None or penal <= -100.0:
        raise ParametrosVeiculoInvalidosError(
            f"Penalização de relevo inválida: {penalizacao_relevo_percent}. Deve ser > -100.0%."
        )

    autonomia_maxima = cap * efic
    autonomia_efetiva = autonomia_maxima * (nivel / 100.0)

    if penal != 0.0:
        fator = 1.0 + (penal / 100.0)
        autonomia_maxima = autonomia_maxima / fator
        autonomia_efetiva = autonomia_efetiva / fator

    return (autonomia_maxima, autonomia_efetiva)


def normalizar_parametros_veiculo(
    veiculo: VeiculoCombustao | VeiculoEletrico | ParametrosVeiculo | dict[str, Any],
    penalizacao_relevo_percent: float = 0.0,
) -> tuple[TipoPropulsao, float, float, float, float, float]:
    """Normaliza parâmetros de qualquer formato suportado para representação padrão.

    Retorna tupla:
        (propulsao, capacidade, consumo_ou_eficiencia, nivel_inicial_pct, autonomia_max_km, autonomia_efetiva_km)
    """
    if isinstance(veiculo, VeiculoCombustao):
        propulsao = TipoPropulsao.COMBUSTAO
        cap = veiculo.capacidade_tanque_litros
        cons = veiculo.consumo_km_por_litro
        nivel = veiculo.nivel_inicial_percent
        max_km, ef_km = calcular_autonomia_combustao(
            cap, cons, nivel, penalizacao_relevo_percent
        )
        return (propulsao, cap, cons, nivel, max_km, ef_km)

    if isinstance(veiculo, VeiculoEletrico):
        propulsao = TipoPropulsao.ELETRICO
        cap = veiculo.capacidade_bateria_kwh
        efic = veiculo.eficiencia_km_por_kwh
        nivel = veiculo.nivel_inicial_percent
        max_km, ef_km = calcular_autonomia_eletrico(
            cap, efic, nivel, penalizacao_relevo_percent
        )
        return (propulsao, cap, efic, nivel, max_km, ef_km)

    if isinstance(veiculo, ParametrosVeiculo):
        veiculo_especifico = veiculo.obter_veiculo_especifico()
        return normalizar_parametros_veiculo(
            veiculo_especifico, penalizacao_relevo_percent
        )

    if isinstance(veiculo, dict):
        prop_bruta = str(veiculo.get("propulsao", "combustao")).strip().lower()
        if prop_bruta in ("eletrico", "electric", "ev"):
            propulsao = TipoPropulsao.ELETRICO
            cap_val = (
                veiculo.get("capacidade_bateria_kwh")
                if "capacidade_bateria_kwh" in veiculo
                else veiculo.get("bateria")
            )
            efic_val = (
                veiculo.get("eficiencia_km_por_kwh")
                if "eficiencia_km_por_kwh" in veiculo
                else veiculo.get("eficiencia_km_kwh", veiculo.get("eficiencia"))
            )
            nivel_val = veiculo.get(
                "nivel_inicial_percent",
                veiculo.get("nivel_inicial", veiculo.get("nivelBateriaOuTanquePct", 100.0)),
            )

            if cap_val is None or efic_val is None:
                raise ParametrosVeiculoInvalidosError(
                    "Veículo elétrico requer capacidade da bateria e eficiência informadas."
                )

            try:
                cap = float(cap_val)
                efic = float(efic_val)
                nivel = float(100.0 if nivel_val is None else nivel_val)
            except (ValueError, TypeError) as exc:
                raise ParametrosVeiculoInvalidosError(f"Valor numérico inválido em veículo elétrico: {exc}") from exc

            max_km, ef_km = calcular_autonomia_eletrico(
                cap, efic, nivel, penalizacao_relevo_percent
            )
            return (propulsao, cap, efic, nivel, max_km, ef_km)

        elif prop_bruta in ("combustao", "combustivel", "gasolina", "diesel", "etanol"):
            propulsao = TipoPropulsao.COMBUSTAO
            cap_val = (
                veiculo.get("capacidade_tanque_litros")
                if "capacidade_tanque_litros" in veiculo
                else veiculo.get("capacidade_tanque_l", veiculo.get("tanque"))
            )
            cons_val = (
                veiculo.get("consumo_km_por_litro")
                if "consumo_km_por_litro" in veiculo
                else veiculo.get("consumo_km_l", veiculo.get("consumo"))
            )
            nivel_val = veiculo.get(
                "nivel_inicial_percent",
                veiculo.get("nivel_inicial", veiculo.get("nivelBateriaOuTanquePct", 100.0)),
            )

            if cap_val is None or cons_val is None:
                raise ParametrosVeiculoInvalidosError(
                    "Veículo a combustão requer capacidade do tanque e consumo informados."
                )

            try:
                cap = float(cap_val)
                cons = float(cons_val)
                nivel = float(100.0 if nivel_val is None else nivel_val)
            except (ValueError, TypeError) as exc:
                raise ParametrosVeiculoInvalidosError(f"Valor numérico inválido em veículo a combustão: {exc}") from exc

            max_km, ef_km = calcular_autonomia_combustao(
                cap, cons, nivel, penalizacao_relevo_percent
            )
            return (propulsao, cap, cons, nivel, max_km, ef_km)

        raise ParametrosVeiculoInvalidosError(
            f"Tipo de propulsão não suportado: {prop_bruta}."
        )

    raise ParametrosVeiculoInvalidosError(
        f"Tipo de parâmetro de veículo incompatível: {type(veiculo)}."
    )


# ---------------------------------------------------------------------------
# Interpolação de Ponto na Geometria Rodoviária
# ---------------------------------------------------------------------------


def interpolar_posicao_geometria(
    pontos: Sequence[tuple[float, float]],
    distancias_acumuladas_m: Sequence[float],
    distancia_alvo_m: float,
) -> tuple[float, float]:
    """Interpola as coordenadas geográficas (lat, lon) de um ponto sobre a polyline da rota.

    Garantias:
    - O ponto retornado estará estritamente sobre um dos segmentos da geometria fornecida.
    - Se a distância alvo coincidir com uma amostra, retorna o ponto exato.
    - Se estiver entre dois pontos, interpola proporcionalmente à distância acumulada.
    """
    total_pontos = len(pontos)
    if total_pontos == 0:
        raise GeometriaRotaInvalidaError("Lista de pontos da geometria está vazia.")
    if total_pontos == 1:
        return pontos[0]

    distancia_total = distancias_acumuladas_m[-1]

    # Delimitações de fronteira
    if distancia_alvo_m <= 0.0:
        return (round(pontos[0][0], 6), round(pontos[0][1], 6))
    if distancia_alvo_m >= distancia_total:
        return (round(pontos[-1][0], 6), round(pontos[-1][1], 6))

    # Busca binária do segmento que contém a distância alvo
    idx = bisect.bisect_right(distancias_acumuladas_m, distancia_alvo_m)
    i = max(0, idx - 1)
    j = min(total_pontos - 1, idx)

    d_ini = distancias_acumuladas_m[i]
    d_fim = distancias_acumuladas_m[j]

    if math.isclose(d_ini, d_fim, abs_tol=1e-5):
        return (round(pontos[i][0], 6), round(pontos[i][1], 6))

    t = (distancia_alvo_m - d_ini) / (d_fim - d_ini)
    t = min(1.0, max(0.0, t))

    lat = pontos[i][0] + t * (pontos[j][0] - pontos[i][0])
    lon = pontos[i][1] + t * (pontos[j][1] - pontos[i][1])

    return (round(lat, 6), round(lon, 6))


# ---------------------------------------------------------------------------
# Normalização do Formato da Geometria (Lat/Lon vs. OSRM Lon/Lat)
# ---------------------------------------------------------------------------


def _dentro_limites_brasil(latitude: float, longitude: float) -> bool:
    """Verifica se a coordenada está dentro do recorte geográfico do Brasil."""
    lat_min, lat_max = LIMITE_LAT_BRASIL
    lon_min, lon_max = LIMITE_LON_BRASIL
    return lat_min <= latitude <= lat_max and lon_min <= longitude <= lon_max


def normalizar_geometria_entrada(
    geometria: Sequence[Any],
    formato_geometria: str = "auto",
) -> Sequence[Any]:
    """Normaliza a geometria para o formato nativo [(latitude, longitude), ...].

    Formatos:
    - ``latlon``: mantém a entrada como (latitude, longitude).
    - ``lonlat``: converte OSRM/GeoJSON [[longitude, latitude], ...].
    - ``auto``: converte apenas quando a rota é inequivocamente brasileira em
      formato OSRM, isto é, a leitura como (lon, lat) cabe nos limites do Brasil
      e a leitura como (lat, lon) não cabe. Isso evita que uma rota OSRM no
      Brasil seja silenciosamente interpretada com latitude e longitude trocadas.
    """
    if formato_geometria not in FORMATOS_GEOMETRIA:
        raise ValueError(
            f"Formato de geometria inválido: {formato_geometria!r}. "
            f"Use um de {FORMATOS_GEOMETRIA}."
        )

    if formato_geometria == "lonlat":
        return converter_geometria_osrm(geometria)
    if formato_geometria == "latlon" or not geometria:
        return geometria

    try:
        pontos_latlon = [extrair_coordenadas(ponto) for ponto in geometria]
    except (TypeError, ValueError):
        # Deixa a validação de geometria reportar o erro original.
        return geometria

    if not all(coordenada_valida(lat, lon) for lat, lon in pontos_latlon):
        return geometria

    latlon_no_brasil = all(
        _dentro_limites_brasil(lat, lon) for lat, lon in pontos_latlon
    )
    lonlat_no_brasil = all(
        _dentro_limites_brasil(lon, lat) for lat, lon in pontos_latlon
    )

    if not latlon_no_brasil and lonlat_no_brasil:
        return converter_geometria_osrm(geometria)

    return geometria


# ---------------------------------------------------------------------------
# Algoritmo Central de Projeção de Paradas Estratégicas
# ---------------------------------------------------------------------------


def projetar_paradas_rota(
    geometria: Sequence[Any],
    veiculo: VeiculoCombustao | VeiculoEletrico | ParametrosVeiculo | dict[str, Any],
    politica: PoliticaReabastecimento | None = None,
    penalizacao_relevo_percent: float = 0.0,
    modo_estrito: bool = False,
    *,
    formato_geometria: str = "auto",
) -> ResultadoAutonomia:
    """Projeta paradas estratégicas de reabastecimento ou recarga ao longo da rota.

    Parâmetros:
    - geometria: Série de coordenadas reais do percurso [(lat, lon), ...] ou OSRM [[lon, lat], ...].
    - veiculo: Modelo ou dicionário com capacidade, consumo/eficiência e nível inicial.
    - politica: Diretrizes de reserva crítica (ex.: ~18%), margem de acionamento e metas.
    - penalizacao_relevo_percent: Fator opcional de consumo advindo da altimetria.
    - modo_estrito: Se True, lança exceções de domínio; se False, retorna ResultadoAutonomia estruturado.
    - formato_geometria: "auto" (padrão), "latlon" ou "lonlat". Em "auto", OSRM/GeoJSON
      brasileiro é detectado e convertido; para outros recortes geográficos, informe
      explicitamente "lonlat" para evitar ambiguidade.
    """
    pol = politica or PoliticaReabastecimento()

    # 1. Validação defensiva dos parâmetros do veículo
    try:
        (
            propulsao,
            _capacidade,
            _consumo_efic,
            nivel_inicial,
            autonomia_maxima_km,
            autonomia_efetiva_km,
        ) = normalizar_parametros_veiculo(veiculo, penalizacao_relevo_percent)
    except Exception as exc:
        if modo_estrito:
            raise ParametrosVeiculoInvalidosError(str(exc)) from exc
        return ResultadoAutonomia(
            sucesso=False,
            solucao_segura=False,
            status=StatusAutonomia.PARAMETROS_INVALIDOS,
            mensagem=f"Parâmetros do veículo inválidos: {exc}",
            politica_reabastecimento=pol,
            observacao="Falha na validação de parâmetros do veículo.",
        )

    # 2. Validação defensiva da geometria rodoviária
    try:
        geometria_proc = normalizar_geometria_entrada(geometria, formato_geometria)
        pontos_validos = validar_geometria(geometria_proc)
    except Exception as exc:
        if modo_estrito:
            raise GeometriaRotaInvalidaError(str(exc)) from exc
        return ResultadoAutonomia(
            sucesso=False,
            solucao_segura=False,
            status=StatusAutonomia.GEOMETRIA_INVALIDA,
            mensagem=f"Geometria rodoviária inválida: {exc}",
            propulsao=propulsao,
            autonomia_maxima_km=round(autonomia_maxima_km, 2),
            autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
            politica_reabastecimento=pol,
            observacao="Falha na geometria fornecida. Coordenadas fictícias não foram geradas.",
        )

    # 3. Cálculo das distâncias acumuladas reais na rodovia
    distancias_m = calcular_distancias_acumuladas(pontos_validos)
    distancia_total_m = distancias_m[-1]
    distancia_total_km = distancia_total_m / 1000.0

    # Caso de percurso com distância zero (origem e destino coincidentes)
    if math.isclose(distancia_total_km, 0.0, abs_tol=1e-5):
        if nivel_inicial <= pol.reserva_critica_percent:
            msg = (
                f"Nível inicial ({nivel_inicial:.1f}%) está na reserva crítica ou abaixo dela "
                f"({pol.reserva_critica_percent:.1f}%)."
            )
            if modo_estrito:
                raise ReservaCriticaVioladaError(msg)
            return ResultadoAutonomia(
                sucesso=True,
                solucao_segura=False,
                status=StatusAutonomia.RESERVA_CRITICA_VIOLADA,
                mensagem=msg,
                propulsao=propulsao,
                autonomia_maxima_km=round(autonomia_maxima_km, 2),
                autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
                distancia_total_km=0.0,
                distancia_total_m=0.0,
                reserva_critica_percent=pol.reserva_critica_percent,
                total_paradas=0,
                politica_reabastecimento=pol,
                observacao="Origem e destino coincidentes.",
            )

        return ResultadoAutonomia(
            sucesso=True,
            solucao_segura=True,
            status=StatusAutonomia.SEM_PARADAS_NECESSARIAS,
            mensagem="Origem e destino coincidentes; nenhuma parada necessária.",
            propulsao=propulsao,
            autonomia_maxima_km=round(autonomia_maxima_km, 2),
            autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
            distancia_total_km=0.0,
            distancia_total_m=0.0,
            reserva_critica_percent=pol.reserva_critica_percent,
            total_paradas=0,
            reserva_final_percent=round(nivel_inicial, 1),
            autonomia_final_km=round(autonomia_efetiva_km, 1),
            politica_reabastecimento=pol,
            observacao="Origem e destino coincidentes.",
        )

    # 4. Verificação de nível inicial frente à reserva crítica
    if nivel_inicial <= pol.reserva_critica_percent:
        msg = (
            f"Nível inicial do veículo ({nivel_inicial:.1f}%) está na reserva crítica ou abaixo dela "
            f"({pol.reserva_critica_percent:.1f}%). Não é seguro iniciar a viagem rodoviária sem abastecimento prévio."
        )
        if modo_estrito:
            raise ReservaCriticaVioladaError(msg)
        return ResultadoAutonomia(
            sucesso=True,
            solucao_segura=False,
            status=StatusAutonomia.RESERVA_CRITICA_VIOLADA,
            mensagem=msg,
            propulsao=propulsao,
            autonomia_maxima_km=round(autonomia_maxima_km, 2),
            autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
            distancia_total_km=round(distancia_total_km, 2),
            distancia_total_m=round(distancia_total_m, 1),
            reserva_critica_percent=pol.reserva_critica_percent,
            total_paradas=0,
            paradas=[],
            politica_reabastecimento=pol,
            observacao="Veículo inicia em reserva crítica; viagem inviável com segurança.",
        )

    # 5. Avaliação de percurso direto sem paradas
    consumo_necessario_pct = (distancia_total_km / autonomia_maxima_km) * 100.0
    reserva_esperada_destino = nivel_inicial - consumo_necessario_pct

    if reserva_esperada_destino >= pol.reserva_critica_percent:
        autonomia_final = autonomia_maxima_km * (reserva_esperada_destino / 100.0)
        return ResultadoAutonomia(
            sucesso=True,
            solucao_segura=True,
            status=StatusAutonomia.SEM_PARADAS_NECESSARIAS,
            mensagem="Autonomia inicial suficiente para completar a viagem respeitando a reserva crítica.",
            propulsao=propulsao,
            autonomia_maxima_km=round(autonomia_maxima_km, 2),
            autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
            distancia_total_km=round(distancia_total_km, 2),
            distancia_total_m=round(distancia_total_m, 1),
            reserva_critica_percent=pol.reserva_critica_percent,
            total_paradas=0,
            paradas=[],
            reserva_final_percent=round(reserva_esperada_destino, 1),
            autonomia_final_km=round(autonomia_final, 1),
            politica_reabastecimento=pol,
            estabelecimentos_confirmados=False,
            observacao="Viagem direta sem paradas de abastecimento necessárias.",
        )

    # 6. Projeção incremental de paradas estratégicas
    paradas: list[ParadaProjetada] = []
    distancia_acumulada_km = 0.0
    nivel_atual_pct = nivel_inicial

    meta_reabastecimento_pct = (
        pol.nivel_recarga_eletrico_percent
        if propulsao == TipoPropulsao.ELETRICO
        else pol.nivel_reabastecimento_combustao_percent
    )

    r_critica = pol.reserva_critica_percent
    r_margem = pol.margem_seguranca_percent

    tipo_parada_enum = (
        TipoParada.RECARGA if propulsao == TipoPropulsao.ELETRICO else TipoParada.COMBUSTIVEL
    )
    rotulo_tipo = "recarga" if propulsao == TipoPropulsao.ELETRICO else "combustível"
    icone = "Eletroposto" if propulsao == TipoPropulsao.ELETRICO else "Posto de Combustível"

    while distancia_acumulada_km < distancia_total_km:
        distancia_restante_km = distancia_total_km - distancia_acumulada_km
        consumo_restante_pct = (distancia_restante_km / autonomia_maxima_km) * 100.0
        nivel_esperado_chegada = nivel_atual_pct - consumo_restante_pct

        # Se o veículo puder alcançar o destino sem romper a reserva crítica, conclui o planejamento
        if nivel_esperado_chegada >= r_critica:
            nivel_atual_pct = nivel_esperado_chegada
            distancia_acumulada_km = distancia_total_km
            break

        # Caso contrário, planeja parada antes que o nível caia abaixo da reserva crítica
        if nivel_atual_pct > r_margem:
            delta_consumo_pct = nivel_atual_pct - r_margem
            alcance_trecho_km = autonomia_maxima_km * (delta_consumo_pct / 100.0)
            reserva_na_parada_pct = r_margem
        else:
            # Situação de fronteira: nível entre reserva crítica e margem de segurança
            delta_consumo_pct = nivel_atual_pct - r_critica
            if delta_consumo_pct <= 0.0:
                msg = "Impossível manter a reserva crítica mínima na progressão do percurso."
                if modo_estrito:
                    raise ReservaCriticaVioladaError(msg)
                return ResultadoAutonomia(
                    sucesso=True,
                    solucao_segura=False,
                    status=StatusAutonomia.RESERVA_CRITICA_VIOLADA,
                    mensagem=msg,
                    propulsao=propulsao,
                    autonomia_maxima_km=round(autonomia_maxima_km, 2),
                    autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
                    distancia_total_km=round(distancia_total_km, 2),
                    distancia_total_m=round(distancia_total_m, 1),
                    reserva_critica_percent=r_critica,
                    total_paradas=len(paradas),
                    paradas=paradas,
                    politica_reabastecimento=pol,
                    observacao="Reserva crítica violada durante o planejamento.",
                )

            # Usa metade da folga restante para posicionar a parada antes de violar a reserva
            alcance_trecho_km = autonomia_maxima_km * ((delta_consumo_pct * 0.5) / 100.0)
            reserva_na_parada_pct = nivel_atual_pct - (delta_consumo_pct * 0.5)

        if alcance_trecho_km <= 0.0:
            msg = "Alcance do veículo insuficiente para avançar ao próximo ponto seguro."
            if modo_estrito:
                raise AutonomiaInsuficienteError(msg)
            return ResultadoAutonomia(
                sucesso=True,
                solucao_segura=False,
                status=StatusAutonomia.AUTONOMIA_INSUFICIENTE,
                mensagem=msg,
                propulsao=propulsao,
                autonomia_maxima_km=round(autonomia_maxima_km, 2),
                autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
                distancia_total_km=round(distancia_total_km, 2),
                distancia_total_m=round(distancia_total_m, 1),
                reserva_critica_percent=r_critica,
                total_paradas=len(paradas),
                paradas=paradas,
                politica_reabastecimento=pol,
                observacao="Autonomia insuficiente para assegurar parada segura.",
            )

        distancia_parada_km = distancia_acumulada_km + alcance_trecho_km
        distancia_parada_m = distancia_parada_km * 1000.0

        # Localiza o ponto exato na geometria rodoviária por interpolação sobre o percurso
        lat_parada, lon_parada = interpolar_posicao_geometria(
            pontos_validos, distancias_m, distancia_parada_m
        )

        ordem = len(paradas) + 1
        autonomia_restante_km = autonomia_maxima_km * (reserva_na_parada_pct / 100.0)

        parada = ParadaProjetada(
            id=f"parada-{ordem}",
            ordem=ordem,
            nome=f"Ponto Projetado {ordem} ({icone} - km {distancia_parada_km:.1f})",
            tipo=tipo_parada_enum,
            distancia_km=round(distancia_parada_km, 2),
            distancia_m=round(distancia_parada_m, 1),
            coordenadas=Coordenada(latitude=lat_parada, longitude=lon_parada),
            reserva_estimada_percent=round(reserva_na_parada_pct, 1),
            autonomia_restante_km=round(autonomia_restante_km, 1),
            nivel_pos_parada_percent=round(meta_reabastecimento_pct, 1),
            origem=OrigemParada.PROJETADO,
            eh_ponto_projetado=True,
            estabelecimento_verificado=False,
            detalhes_estabelecimento=None,
            descricao=(
                f"Parada estratégica {ordem} projetada no km {distancia_parada_km:.1f}. "
                f"Nível de chegada estimado em {reserva_na_parada_pct:.1f}% (antes da reserva crítica de {r_critica:.1f}%). "
                f"Nível estimado após {rotulo_tipo}: {meta_reabastecimento_pct:.1f}%. "
                "Ponto projetado sobre a geometria da rota; estabelecimento físico não verificado em catálogo externo."
            ),
        )
        paradas.append(parada)

        # Atualiza o estado da viagem pós-parada segundo a política
        distancia_acumulada_km = distancia_parada_km
        nivel_atual_pct = meta_reabastecimento_pct

        # Proteção contra loops infinitos em parâmetros extremos
        if len(paradas) >= MAX_PARADAS_SEGURANCA:
            msg = f"Limite de {MAX_PARADAS_SEGURANCA} paradas excedido; percurso inviável com a autonomia configurada."
            if modo_estrito:
                raise AutonomiaInsuficienteError(msg)
            return ResultadoAutonomia(
                sucesso=True,
                solucao_segura=False,
                status=StatusAutonomia.AUTONOMIA_INSUFICIENTE,
                mensagem=msg,
                propulsao=propulsao,
                autonomia_maxima_km=round(autonomia_maxima_km, 2),
                autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
                distancia_total_km=round(distancia_total_km, 2),
                distancia_total_m=round(distancia_total_m, 1),
                reserva_critica_percent=r_critica,
                total_paradas=len(paradas),
                paradas=paradas,
                politica_reabastecimento=pol,
                observacao="Limite de paradas atingido.",
            )

    autonomia_final_km = autonomia_maxima_km * (nivel_atual_pct / 100.0)

    return ResultadoAutonomia(
        sucesso=True,
        solucao_segura=True,
        status=StatusAutonomia.PARADAS_NECESSARIAS,
        mensagem=f"Projetadas {len(paradas)} parada(s) estratégica(s) ao longo da rota respeitando a reserva crítica.",
        propulsao=propulsao,
        autonomia_maxima_km=round(autonomia_maxima_km, 2),
        autonomia_efetiva_km=round(autonomia_efetiva_km, 2),
        distancia_total_km=round(distancia_total_km, 2),
        distancia_total_m=round(distancia_total_m, 1),
        reserva_critica_percent=r_critica,
        total_paradas=len(paradas),
        paradas=paradas,
        reserva_final_percent=round(nivel_atual_pct, 1),
        autonomia_final_km=round(autonomia_final_km, 1),
        politica_reabastecimento=pol,
        estabelecimentos_confirmados=False,
        observacao=(
            "Pontos de parada calculados matematicamente sobre a geometria da rodovia com base na autonomia e reserva crítica. "
            "Não representam estabelecimentos físicos confirmados por catálogo ou fornecedor externo."
        ),
    )


# ---------------------------------------------------------------------------
# Classe Especializada do Serviço de Autonomia e Postos
# ---------------------------------------------------------------------------


class PostosService:
    """Serviço de domínio para cálculo de autonomia e projeção de paradas."""

    def __init__(self, politica_padrao: PoliticaReabastecimento | None = None) -> None:
        self.politica_padrao = politica_padrao or PoliticaReabastecimento()

    def calcular_paradas(
        self,
        geometria: Sequence[Any],
        veiculo: VeiculoCombustao | VeiculoEletrico | ParametrosVeiculo | dict[str, Any],
        politica: PoliticaReabastecimento | None = None,
        penalizacao_relevo_percent: float = 0.0,
        modo_estrito: bool = False,
        *,
        formato_geometria: str = "auto",
    ) -> ResultadoAutonomia:
        """Calcula de forma síncrona a autonomia e as paradas estratégicas na rota."""
        pol = politica or self.politica_padrao
        return projetar_paradas_rota(
            geometria=geometria,
            veiculo=veiculo,
            politica=pol,
            penalizacao_relevo_percent=penalizacao_relevo_percent,
            formato_geometria=formato_geometria,
            modo_estrito=modo_estrito,
        )

    async def calcular_paradas_async(
        self,
        geometria: Sequence[Any],
        veiculo: VeiculoCombustao | VeiculoEletrico | ParametrosVeiculo | dict[str, Any],
        politica: PoliticaReabastecimento | None = None,
        penalizacao_relevo_percent: float = 0.0,
        modo_estrito: bool = False,
        *,
        formato_geometria: str = "auto",
    ) -> ResultadoAutonomia:
        """Executa a projeção de paradas de maneira não-bloqueante no loop do asyncio.

        Pronto para ser consumido via `asyncio.gather` pelo Aluno 2 no endpoint `/planejar`.
        """
        return self.calcular_paradas(
            geometria=geometria,
            veiculo=veiculo,
            politica=politica,
            penalizacao_relevo_percent=penalizacao_relevo_percent,
            formato_geometria=formato_geometria,
            modo_estrito=modo_estrito,
        )
