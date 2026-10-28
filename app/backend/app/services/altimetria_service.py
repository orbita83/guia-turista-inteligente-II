"""Serviço assíncrono especializado de altimetria e perfil topográfico.

Responsabilidade (Aluno 3 — Data & Altimetry Engineer):
- Consulta ao provedor Open-Elevation usando geometria rodoviária real.
- Amostragem com preservação da correspondência métrica e distância percorrida.
- Reutilização do cliente HTTP assíncrono compartilhado da aplicação.
- Cálculo de indicadores topográficos com filtragem de ruído.
- Garantia de integridade: falhas não geram perfis fictícios.
"""

from __future__ import annotations

import logging
import math
from collections.abc import Sequence
from typing import Any

import httpx

from app.schemas.roteiros import (
    DadosConsumoRelevo,
    PerfilTopografico,
    PontoTopografico,
    StatusAltimetria,
)

logger = logging.getLogger("app.services.altimetria")

# Constantes de configuração e limites operacionais
URL_OPEN_ELEVATION_PADRAO = "https://api.open-elevation.com/api/v1/lookup"
MAX_AMOSTRAS_PADRAO = 100
LIMIAR_RUIDO_PADRAO_M = 2.0
TIMEOUT_PADRAO_S = 10.0
RAIO_TERRA_M = 6_371_000.0


# ---------------------------------------------------------------------------
# Exceções de Domínio da Altimetria
# ---------------------------------------------------------------------------


class AltimetriaError(Exception):
    """Exceção base para operações de altimetria."""


class GeometriaInvalidaError(AltimetriaError):
    """Geometria ausente, com pontos insuficientes ou coordenadas inválidas."""


class OpenElevationError(AltimetriaError):
    """Falha de comunicação ou processamento no Open-Elevation."""


class OpenElevationTimeoutError(OpenElevationError):
    """Tempo limite excedido na consulta ao Open-Elevation."""


class OpenElevationConnectionError(OpenElevationError):
    """Falha de conexão física ou resolução de rede com o Open-Elevation."""


class OpenElevationHTTPError(OpenElevationError):
    """Erro HTTP retornado pelo Open-Elevation (ex.: 500, 502, 503)."""

    def __init__(self, status_code: int, detail: str) -> None:
        super().__init__(f"Open-Elevation retornou HTTP {status_code}: {detail}")
        self.status_code = status_code
        self.detail = detail


class OpenElevationFormatError(OpenElevationError):
    """Resposta do Open-Elevation com JSON inválido ou campos ausentes."""


class OpenElevationCountMismatchError(OpenElevationError):
    """Quantidade de elevações retornada difere da quantidade solicitada."""

    def __init__(self, solicitados: int, recebidos: int) -> None:
        super().__init__(
            f"Divergência na quantidade de amostras: enviou {solicitados}, recebeu {recebidos}."
        )
        self.solicitados = solicitados
        self.recebidos = recebidos


class OpenElevationInvalidDataError(OpenElevationError):
    """Elevação ausente, nula ou não finita (NaN, Inf) retornada pelo provedor."""


# ---------------------------------------------------------------------------
# Utilitários Geodésicos e Validação
# ---------------------------------------------------------------------------


def numero_finito(valor: object) -> float | None:
    """Valida se o valor é um número real finito (não-booleano)."""
    if isinstance(valor, bool) or not isinstance(valor, (int, float)):
        return None
    try:
        numero = float(valor)
    except (TypeError, ValueError, OverflowError):
        return None
    return numero if math.isfinite(numero) else None


def coordenada_valida(latitude: float, longitude: float) -> bool:
    """Verifica se latitude e longitude estão nos intervalos geográficos válidos [-90, 90] e [-180, 180]."""
    lat = numero_finito(latitude)
    lon = numero_finito(longitude)
    if lat is None or lon is None:
        return False
    return -90.0 <= lat <= 90.0 and -180.0 <= lon <= 180.0


def distancia_haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calcula a distância geodésica em metros entre duas coordenadas WGS-84 pelo método Haversine.

    d = 2 * R * asin(sqrt(sin^2(dlat/2) + cos(lat1) * cos(lat2) * sin^2(dlon/2)))
    """
    if (lat1, lon1) == (lat2, lon2):
        return 0.0

    phi1 = math.radians(lat1)
    phi2 = math.radians(lat2)
    delta_phi = math.radians(lat2 - lat1)
    delta_lambda = math.radians(lon2 - lon1)

    a = (
        math.sin(delta_phi / 2.0) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(delta_lambda / 2.0) ** 2
    )
    # Proteção numérica contra imprecisão de ponto flutuante
    a = min(1.0, max(0.0, a))
    c = 2.0 * math.atan2(math.sqrt(a), math.sqrt(1.0 - a))
    return RAIO_TERRA_M * c


def extrair_coordenadas(ponto: Any) -> tuple[float, float]:
    """Extrai (latitude, longitude) a partir de tuplas, listas ou dicionários."""
    if isinstance(ponto, (tuple, list)) and len(ponto) >= 2:
        lat = numero_finito(ponto[0])
        lon = numero_finito(ponto[1])
        if lat is not None and lon is not None:
            return (lat, lon)
    elif isinstance(ponto, dict):
        lat = numero_finito(ponto.get("latitude", ponto.get("lat")))
        lon = numero_finito(ponto.get("longitude", ponto.get("lon")))
        if lat is not None and lon is not None:
            return (lat, lon)
    raise ValueError(f"Formato de ponto inválido: {ponto}")


def converter_geometria_osrm(coordenadas_osrm: Sequence[Sequence[float]]) -> list[tuple[float, float]]:
    """Converte lista de coordenadas OSRM/GeoJSON [longitude, latitude] para [(latitude, longitude)]."""
    resultado: list[tuple[float, float]] = []
    for item in coordenadas_osrm:
        if len(item) < 2:
            continue
        lon = float(item[0])
        lat = float(item[1])
        resultado.append((lat, lon))
    return resultado


def validar_geometria(geometria: Sequence[Any]) -> list[tuple[float, float]]:
    """Valida a geometria de entrada.

    Rejeita geometrias vazias, com menos de 2 pontos ou coordenadas fora dos limites.
    Retorna a lista normalizada de coordenadas (latitude, longitude).
    """
    if not geometria:
        raise GeometriaInvalidaError("Geometria ausente ou vazia.")

    pontos_validos: list[tuple[float, float]] = []
    for i, item in enumerate(geometria):
        try:
            lat, lon = extrair_coordenadas(item)
        except (ValueError, TypeError) as exc:
            raise GeometriaInvalidaError(f"Ponto no índice {i} possui formato inválido: {item}") from exc

        if not coordenada_valida(lat, lon):
            raise GeometriaInvalidaError(
                f"Coordenadas inválidas no índice {i}: lat={lat}, lon={lon}. "
                "Latitude deve estar em [-90, 90] e longitude em [-180, 180]."
            )
        pontos_validos.append((lat, lon))

    if len(pontos_validos) < 2:
        raise GeometriaInvalidaError(
            f"Geometria com pontos insuficientes ({len(pontos_validos)}). São necessários ao menos 2 pontos."
        )

    return pontos_validos


# ---------------------------------------------------------------------------
# Amostragem do Percurso com Distância Acumulada
# ---------------------------------------------------------------------------


def calcular_distancias_acumuladas(pontos: list[tuple[float, float]]) -> list[float]:
    """Calcula a distância acumulada em metros ao longo de cada segmento da rodovia."""
    distancias: list[float] = [0.0]
    total = 0.0
    for i in range(1, len(pontos)):
        lat_ant, lon_ant = pontos[i - 1]
        lat_atual, lon_atual = pontos[i]
        passo = distancia_haversine(lat_ant, lon_ant, lat_atual, lon_atual)
        total += passo
        distancias.append(total)
    return distancias


def amostrar_percurso(
    pontos: list[tuple[float, float]],
    distancias_acumuladas: list[float],
    max_amostras: int = MAX_AMOSTRAS_PADRAO,
) -> tuple[list[tuple[float, float]], list[float]]:
    """Amostra pontos ao longo da rota respeitando o limite do provedor e a distância acumulada.

    Estratégia:
    - Se a quantidade total de pontos <= max_amostras, mantém todos os pontos originais.
    - Se exceder max_amostras, seleciona pontos uniformemente espaçados ao longo da
      distância percorrida na rodovia.
    - O primeiro ponto (origem, D=0) e o último ponto (destino, D=D_total) são sempre preservados.
    - Cada amostra mantém sua distância acumulada real ao longo do trajeto original.
    """
    total_pontos = len(pontos)
    if total_pontos <= max_amostras or max_amostras < 2:
        return pontos, distancias_acumuladas

    distancia_total = distancias_acumuladas[-1]

    # Se a distância total for zero (pontos coincidentes), retorna primeira e última amostra
    if distancia_total <= 0.0:
        indices = [0, total_pontos - 1]
        return [pontos[i] for i in indices], [distancias_acumuladas[i] for i in indices]

    intervalo_alvo = distancia_total / (max_amostras - 1)
    indices_selecionados: list[int] = [0]
    ponteiro_ponto = 1

    for passo in range(1, max_amostras - 1):
        distancia_alvo = passo * intervalo_alvo

        # Avança até encontrar o ponto mais próximo da distância alvo
        while (
            ponteiro_ponto < total_pontos - 1
            and distancias_acumuladas[ponteiro_ponto] < distancia_alvo
        ):
            ponteiro_ponto += 1

        # Compara com o anterior para ver qual está mais próximo do alvo
        indice_anterior = max(0, ponteiro_ponto - 1)
        diff_atual = abs(distancias_acumuladas[ponteiro_ponto] - distancia_alvo)
        diff_ant = abs(distancias_acumuladas[indice_anterior] - distancia_alvo)
        melhor_indice = (
            indice_anterior if diff_ant <= diff_atual else ponteiro_ponto
        )

        # Garante índices estritamente crescentes sem repetição
        if melhor_indice > indices_selecionados[-1] and melhor_indice < total_pontos - 1:
            indices_selecionados.append(melhor_indice)

    # Sempre preserva o último ponto da geometria original
    indices_selecionados.append(total_pontos - 1)

    amostras_pontos = [pontos[i] for i in indices_selecionados]
    amostras_distancias = [distancias_acumuladas[i] for i in indices_selecionados]
    return amostras_pontos, amostras_distancias


# ---------------------------------------------------------------------------
# Integração com o Provedor Open-Elevation
# ---------------------------------------------------------------------------


async def consultar_open_elevation(
    client: httpx.AsyncClient,
    coordenadas: list[tuple[float, float]],
    url: str = URL_OPEN_ELEVATION_PADRAO,
    timeout: float = TIMEOUT_PADRAO_S,
) -> list[float]:
    """Consulta elevações no Open-Elevation para as coordenadas informadas.

    Envia POST com {"locations": [{"latitude": lat, "longitude": lon}, ...]}.
    Valida status HTTP, estrutura do JSON, correspondência de quantidade e dados finitos.
    """
    if not coordenadas:
        return []

    payload = {
        "locations": [
            {"latitude": lat, "longitude": lon} for lat, lon in coordenadas
        ]
    }

    logger.info(
        "Consultando Open-Elevation (%s) para %d coordenadas com timeout de %.1fs.",
        url,
        len(coordenadas),
        timeout,
    )

    try:
        response = await client.post(url, json=payload, timeout=timeout)
    except httpx.TimeoutException as exc:
        logger.warning("Timeout (%s) na consulta ao Open-Elevation após %.1fs.", exc, timeout)
        raise OpenElevationTimeoutError(f"Timeout ao consultar Open-Elevation ({timeout}s).") from exc
    except httpx.RequestError as exc:
        logger.error("Falha de rede ao conectar ao Open-Elevation: %s", exc)
        raise OpenElevationConnectionError(f"Falha de conexão com o Open-Elevation: {exc}") from exc

    if response.status_code != 200:
        logger.error(
            "Open-Elevation retornou HTTP %d. Corpo: %.200s",
            response.status_code,
            response.text,
        )
        raise OpenElevationHTTPError(response.status_code, response.text[:200])

    try:
        dados = response.json()
    except Exception as exc:
        logger.error("Resposta do Open-Elevation não é um JSON válido: %s", exc)
        raise OpenElevationFormatError("Resposta do Open-Elevation não contém JSON válido.") from exc

    if not isinstance(dados, dict) or "results" not in dados or not isinstance(dados["results"], list):
        logger.error("Estrutura do JSON do Open-Elevation inválida: %s", dados)
        raise OpenElevationFormatError("Campo 'results' ausente ou inválido na resposta do provedor.")

    resultados = dados["results"]
    if len(resultados) != len(coordenadas):
        logger.error(
            "Quantidade de resultados (%d) diferente das coordenadas enviadas (%d).",
            len(resultados),
            len(coordenadas),
        )
        raise OpenElevationCountMismatchError(len(coordenadas), len(resultados))

    elevacoes: list[float] = []
    for i, item in enumerate(resultados):
        if not isinstance(item, dict):
            raise OpenElevationFormatError(f"Amostra {i} da resposta não é um objeto JSON.")
        elev_bruta = item.get("elevation")
        elev_valida = numero_finito(elev_bruta)
        if elev_valida is None:
            logger.error("Elevação ausente ou não finita na amostra %d: %s", i, elev_bruta)
            raise OpenElevationInvalidDataError(
                f"Amostra {i} possui elevação ausente ou inválida: {elev_bruta}"
            )
        elevacoes.append(elev_valida)

    return elevacoes


# ---------------------------------------------------------------------------
# Cálculo de Indicadores Topográficos e Ruído
# ---------------------------------------------------------------------------


def calcular_indicadores_topograficos(
    amostras_pontos: list[tuple[float, float]],
    distancias_acumuladas: list[float],
    elevacoes: list[float],
    limiar_ruido_m: float = LIMIAR_RUIDO_PADRAO_M,
) -> dict[str, Any]:
    """Calcula indicadores topográficos com filtragem explícita de pequenas oscilações (deadband).

    Fórmulas:
    - Ganho acumulado = soma dos deltas positivos onde delta >= limiar_ruido_m
    - Perda acumulada = soma do módulo dos deltas negativos onde |delta| >= limiar_ruido_m
    - Desnível líquido = elevacao_final - elevacao_inicial (independente de filtragem)

    Política de ruído:
    - O limiar_ruido_m (padrão 2.0 m) evita que micro-oscilações do modelo digital de elevação (SRTM)
      inflem artificialmente o ganho e a perda de elevação em estradas essencialmente planas.
    - Se limiar_ruido_m == 0, ganho - perda == desnivel_liquido é garantido aritmeticamente.
    """
    if not elevacoes:
        return {}

    altitude_minima = min(elevacoes)
    altitude_maxima = max(elevacoes)
    desnivel_liquido = elevacoes[-1] - elevacoes[0]

    ganho_acumulado = 0.0
    perda_acumulado = 0.0
    distancia_subida_m = 0.0
    distancia_descida_m = 0.0

    for i in range(1, len(elevacoes)):
        delta_h = elevacoes[i] - elevacoes[i - 1]
        dist_segmento = distancias_acumuladas[i] - distancias_acumuladas[i - 1]

        if abs(delta_h) >= limiar_ruido_m:
            if delta_h > 0:
                ganho_acumulado += delta_h
                distancia_subida_m += dist_segmento
            elif delta_h < 0:
                perda_acumulado += abs(delta_h)
                distancia_descida_m += dist_segmento

    distancia_total_m = distancias_acumuladas[-1]
    distancia_total_km = round(distancia_total_m / 1000.0, 3)

    # Métricas de consumo e relevo
    inclinacao_subida = (
        (ganho_acumulado / distancia_subida_m * 100.0)
        if distancia_subida_m > 0
        else 0.0
    )
    inclinacao_descida = (
        (perda_acumulado / distancia_descida_m * 100.0)
        if distancia_descida_m > 0
        else 0.0
    )

    ganho_por_km = (ganho_acumulado / distancia_total_km) if distancia_total_km > 0 else 0.0
    if ganho_por_km < 5.0:
        fator_terreno = "plano"
    elif ganho_por_km < 15.0:
        fator_terreno = "ondulado"
    else:
        fator_terreno = "montanhoso"

    # Estimativa de penalização percentual para integração com módulo de custos (Issue #16)
    penalizacao_estimada = max(
        -5.0,
        min(30.0, (ganho_acumulado / 100.0) * 0.7 - (perda_acumulado / 100.0) * 0.25),
    )

    pontos_topograficos: list[PontoTopografico] = []
    for (lat, lon), dist_m, elev_m in zip(
        amostras_pontos, distancias_acumuladas, elevacoes, strict=False
    ):
        pontos_topograficos.append(
            PontoTopografico(
                latitude=lat,
                longitude=lon,
                distancia_m=round(dist_m, 2),
                distancia_km=round(dist_m / 1000.0, 3),
                elevacao_m=round(elev_m, 2),
            )
        )

    dados_consumo = DadosConsumoRelevo(
        inclinacao_media_subida_percent=round(inclinacao_subida, 2),
        inclinacao_media_descida_percent=round(inclinacao_descida, 2),
        fator_terreno=fator_terreno,
        penalizacao_consumo_estimada_percent=round(penalizacao_estimada, 2),
    )

    return {
        "altitude_minima_m": round(altitude_minima, 2),
        "altitude_maxima_m": round(altitude_maxima, 2),
        "ganho_elevacao_m": round(ganho_acumulado, 2),
        "perda_elevacao_m": round(perda_acumulado, 2),
        "desnivel_liquido_m": round(desnivel_liquido, 2),
        "distancia_total_m": round(distancia_total_m, 2),
        "distancia_total_km": distancia_total_km,
        "total_amostras": len(pontos_topograficos),
        "pontos": pontos_topograficos,
        "dados_consumo": dados_consumo,
    }


# ---------------------------------------------------------------------------
# Serviço Principal de Altimetria
# ---------------------------------------------------------------------------


class AltimetriaService:
    """Serviço assíncrono para obtenção e cálculo do perfil altimétrico de rotas."""

    def __init__(
        self,
        client: httpx.AsyncClient | None = None,
        *,
        url_provedor: str = URL_OPEN_ELEVATION_PADRAO,
        max_amostras: int = MAX_AMOSTRAS_PADRAO,
        limiar_ruido_m: float = LIMIAR_RUIDO_PADRAO_M,
        timeout_s: float = TIMEOUT_PADRAO_S,
    ) -> None:
        self._client = client
        self.url_provedor = url_provedor
        self.max_amostras = max_amostras
        self.limiar_ruido_m = limiar_ruido_m
        self.timeout_s = timeout_s

    async def obter_perfil_topografico(
        self,
        geometria: Sequence[Any],
        client: httpx.AsyncClient | None = None,
        *,
        max_amostras: int | None = None,
        limiar_ruido_m: float | None = None,
    ) -> PerfilTopografico:
        """Processa a geometria rodoviária, consulta o Open-Elevation e retorna o perfil completo.

        Não gera perfis fictícios quando o serviço falhar.
        Diferencia com clareza SUCESSO, INDISPONIVEL, ERRO_PROVEDOR e GEOMETRIA_INVALIDA.
        """
        # 1. Validação defensiva da geometria
        try:
            pontos = validar_geometria(geometria)
        except GeometriaInvalidaError as exc:
            logger.warning("Geometria inválida rejeitada na altimetria: %s", exc)
            return PerfilTopografico(
                sucesso=False,
                status=StatusAltimetria.GEOMETRIA_INVALIDA,
                mensagem=str(exc),
            )

        # 2. Distância acumulada e amostragem controlada
        limite_amostras = max_amostras if max_amostras is not None else self.max_amostras
        limiar = limiar_ruido_m if limiar_ruido_m is not None else self.limiar_ruido_m

        distancias_originais = calcular_distancias_acumuladas(pontos)
        amostras_pontos, amostras_distancias = amostrar_percurso(
            pontos, distancias_originais, max_amostras=limite_amostras
        )

        # 3. Consulta ao provedor com cliente HTTP compartilhado
        http_client = client or self._client
        owns_client = False
        if http_client is None:
            http_client = httpx.AsyncClient(timeout=self.timeout_s)
            owns_client = True

        try:
            elevacoes = await consultar_open_elevation(
                client=http_client,
                coordenadas=amostras_pontos,
                url=self.url_provedor,
                timeout=self.timeout_s,
            )
        except OpenElevationTimeoutError as exc:
            return PerfilTopografico(
                sucesso=False,
                status=StatusAltimetria.INDISPONIVEL,
                mensagem=f"Serviço Open-Elevation indisponível por timeout: {exc}",
            )
        except OpenElevationConnectionError as exc:
            return PerfilTopografico(
                sucesso=False,
                status=StatusAltimetria.INDISPONIVEL,
                mensagem=f"Falha de conexão com Open-Elevation: {exc}",
            )
        except (
            OpenElevationHTTPError,
            OpenElevationFormatError,
            OpenElevationCountMismatchError,
            OpenElevationInvalidDataError,
        ) as exc:
            return PerfilTopografico(
                sucesso=False,
                status=StatusAltimetria.ERRO_PROVEDOR,
                mensagem=f"Erro retornado pelo Open-Elevation: {exc}",
            )
        finally:
            if owns_client:
                await http_client.aclose()

        # 4. Cálculo de indicadores topográficos
        indicadores = calcular_indicadores_topograficos(
            amostras_pontos=amostras_pontos,
            distancias_acumuladas=amostras_distancias,
            elevacoes=elevacoes,
            limiar_ruido_m=limiar,
        )

        return PerfilTopografico(
            sucesso=True,
            status=StatusAltimetria.SUCESSO,
            mensagem="Perfil topográfico obtido e calculado com sucesso.",
            **indicadores,
        )


# Instância funcional pronta para reuso
servico_altimetria = AltimetriaService()


async def obter_perfil_topografico(
    geometria: Sequence[Any],
    client: httpx.AsyncClient | None = None,
    *,
    max_amostras: int = MAX_AMOSTRAS_PADRAO,
    limiar_ruido_m: float = LIMIAR_RUIDO_PADRAO_M,
    timeout_s: float = TIMEOUT_PADRAO_S,
    url_provedor: str = URL_OPEN_ELEVATION_PADRAO,
) -> PerfilTopografico:
    """Função pública de conveniência para obter o perfil topográfico de uma rota."""
    servico = AltimetriaService(
        client=client,
        url_provedor=url_provedor,
        max_amostras=max_amostras,
        limiar_ruido_m=limiar_ruido_m,
        timeout_s=timeout_s,
    )
    return await servico.obter_perfil_topografico(
        geometria=geometria,
        client=client,
        max_amostras=max_amostras,
        limiar_ruido_m=limiar_ruido_m,
    )
