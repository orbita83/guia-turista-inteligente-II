"""Contratos Pydantic v2 para altimetria, relevo e roteiros rodoviários."""

from __future__ import annotations

import math
from decimal import Decimal
from enum import Enum
from typing import Any

from pydantic import BaseModel, Field, field_validator, model_validator


class StatusAltimetria(str, Enum):
    """Estado do processamento altimétrico e confiabilidade dos dados."""

    SUCESSO = "sucesso"
    PARCIAL = "parcial"
    INDISPONIVEL = "indisponivel"
    ERRO_PROVEDOR = "erro_provedor"
    GEOMETRIA_INVALIDA = "geometria_invalida"


class Coordenada(BaseModel):
    """Representação de coordenada geográfica WGS-84."""

    latitude: float = Field(..., description="Latitude em graus decimais (-90 a 90)")
    longitude: float = Field(..., description="Longitude em graus decimais (-180 a 180)")

    @field_validator("latitude")
    @classmethod
    def validar_latitude(cls, value: float) -> float:
        if not (-90.0 <= value <= 90.0):
            raise ValueError(f"Latitude fora do intervalo válido [-90, 90]: {value}")
        return value

    @field_validator("longitude")
    @classmethod
    def validar_longitude(cls, value: float) -> float:
        if not (-180.0 <= value <= 180.0):
            raise ValueError(f"Longitude fora do intervalo válido [-180, 180]: {value}")
        return value


class PontoTopografico(BaseModel):
    """Amostra ordenada do perfil topográfico ao longo do percurso."""

    latitude: float = Field(..., description="Latitude da amostra")
    longitude: float = Field(..., description="Longitude da amostra")
    distancia_m: float = Field(..., ge=0.0, description="Distância acumulada na rodovia em metros")
    distancia_km: float = Field(..., ge=0.0, description="Distância acumulada na rodovia em quilômetros")
    elevacao_m: float = Field(..., description="Elevação em metros acima do nível do mar")


class DadosConsumoRelevo(BaseModel):
    """Indicadores de relevo preparados para a integração de consumo e autonomia."""

    inclinacao_media_subida_percent: float = Field(
        default=0.0, description="Inclinação média dos trechos de subida em %"
    )
    inclinacao_media_descida_percent: float = Field(
        default=0.0, description="Inclinação média dos trechos de descida em %"
    )
    fator_terreno: str = Field(
        default="plano", description="Classificação do relevo: plano, ondulado ou montanhoso"
    )
    penalizacao_consumo_estimada_percent: float = Field(
        default=0.0, description="Estimativa preliminar de impacto do relevo no consumo (%)"
    )


class AltimetriaInfo(BaseModel):
    """Resumo executivo de altimetria para cartões de métricas e badges."""

    altitude_minima_m: float = Field(..., description="Menor altitude registrada no trajeto (m)")
    altitude_maxima_m: float = Field(..., description="Maior altitude registrada no trajeto (m)")
    ganho_elevacao_m: float = Field(..., ge=0.0, description="Ganho de elevação acumulado em subidas (m)")
    perda_elevacao_m: float = Field(..., ge=0.0, description="Perda de elevação acumulada em descidas (m)")
    desnivel_liquido_m: float = Field(..., description="Diferença entre altitude final e inicial (m)")
    distancia_total_km: float = Field(..., ge=0.0, description="Distância total percorrida (km)")
    total_pontos: int = Field(..., ge=0, description="Quantidade de pontos amostrados no perfil")
    fator_terreno: str = Field(default="plano", description="Classificação do relevo")


class PerfilTopografico(BaseModel):
    """Resultado estruturado da análise topográfica da rota."""

    sucesso: bool = Field(..., description="Indica se o perfil foi gerado com sucesso")
    status: StatusAltimetria = Field(..., description="Classificação do estado da resposta")
    mensagem: str | None = Field(default=None, description="Mensagem diagnóstica ou causa de erro")

    altitude_minima_m: float | None = Field(default=None, description="Altitude mínima em metros")
    altitude_maxima_m: float | None = Field(default=None, description="Altitude máxima em metros")
    ganho_elevacao_m: float | None = Field(default=None, ge=0.0, description="Ganho de altitude acumulado (m)")
    perda_elevacao_m: float | None = Field(default=None, ge=0.0, description="Perda de altitude acumulada (m)")
    desnivel_liquido_m: float | None = Field(default=None, description="Desnível líquido (final - inicial) em metros")
    distancia_total_m: float | None = Field(default=None, ge=0.0, description="Distância total acumulada em metros")
    distancia_total_km: float | None = Field(default=None, ge=0.0, description="Distância total acumulada em km")

    total_amostras: int = Field(default=0, ge=0, description="Número de amostras topográficas válidas")
    pontos: list[PontoTopografico] = Field(default_factory=list, description="Série ordenada do perfil")
    dados_consumo: DadosConsumoRelevo | None = Field(
        default=None, description="Metadados de inclinação e terreno para cálculo de autonomia"
    )

    def to_info(self) -> AltimetriaInfo | None:
        """Converte para resumo AltimetriaInfo se os indicadores estiverem disponíveis."""
        if not self.sucesso or self.altitude_minima_m is None or self.altitude_maxima_m is None:
            return None
        return AltimetriaInfo(
            altitude_minima_m=self.altitude_minima_m,
            altitude_maxima_m=self.altitude_maxima_m,
            ganho_elevacao_m=self.ganho_elevacao_m or 0.0,
            perda_elevacao_m=self.perda_elevacao_m or 0.0,
            desnivel_liquido_m=self.desnivel_liquido_m or 0.0,
            distancia_total_km=self.distancia_total_km or 0.0,
            total_pontos=self.total_amostras,
            fator_terreno=self.dados_consumo.fator_terreno if self.dados_consumo else "plano",
        )


# ===========================================================================
# Schemas para Autonomia, Veículos e Paradas Estratégicas (Issue #28)
# ===========================================================================


class TipoPropulsao(str, Enum):
    """Tipo de propulsão veicular suportada."""

    COMBUSTAO = "combustao"
    ELETRICO = "eletrico"


class TipoParada(str, Enum):
    """Finalidade operacional da parada estratégica."""

    COMBUSTIVEL = "combustivel"
    RECARGA = "recarga"


class OrigemParada(str, Enum):
    """Origem da informação geográfica da parada."""

    PROJETADO = "projetado"
    VERIFICADO = "verificado"


class StatusAutonomia(str, Enum):
    """Classificação do resultado da projeção de autonomia e paradas."""

    SUCESSO = "sucesso"
    SEM_PARADAS_NECESSARIAS = "sem_paradas_necessarias"
    PARADAS_NECESSARIAS = "paradas_necessarias"
    AUTONOMIA_INSUFICIENTE = "autonomia_insuficiente"
    RESERVA_CRITICA_VIOLADA = "reserva_critica_violada"
    PARAMETROS_INVALIDOS = "parametros_invalidos"
    GEOMETRIA_INVALIDA = "geometria_invalida"
    ERRO_PROCESSAMENTO = "erro_processamento"


class VeiculoCombustao(BaseModel):
    """Parâmetros de veículo com motor a combustão interna."""

    capacidade_tanque_litros: float = Field(
        ..., gt=0.0, description="Capacidade volumétrica útil do tanque de combustível (L)"
    )
    consumo_km_por_litro: float = Field(
        ..., gt=0.0, description="Consumo médio de combustível em rodovia (km/L)"
    )
    nivel_inicial_percent: float = Field(
        default=100.0, ge=0.0, le=100.0, description="Nível inicial disponível no tanque (0 a 100%)"
    )

    @field_validator("capacidade_tanque_litros", "consumo_km_por_litro")
    @classmethod
    def validar_positivo(cls, valor: float) -> float:
        if not math.isfinite(valor) or valor <= 0.0:
            raise ValueError(f"Valor deve ser numérico finito e estritamente positivo: {valor}")
        return valor

    @field_validator("nivel_inicial_percent")
    @classmethod
    def validar_nivel(cls, valor: float) -> float:
        if not math.isfinite(valor) or not (0.0 <= valor <= 100.0):
            raise ValueError(f"Nível inicial deve estar entre 0.0% e 100.0%: {valor}")
        return valor

    @property
    def autonomia_maxima_km(self) -> float:
        """Autonomia nominal teórica com tanque cheio (km)."""
        return self.capacidade_tanque_litros * self.consumo_km_por_litro

    @property
    def autonomia_efetiva_km(self) -> float:
        """Autonomia disponível considerando o nível inicial (km)."""
        return self.autonomia_maxima_km * (self.nivel_inicial_percent / 100.0)


class VeiculoEletrico(BaseModel):
    """Parâmetros de veículo 100% elétrico (BEV)."""

    capacidade_bateria_kwh: float = Field(
        ..., gt=0.0, description="Capacidade útil da bateria de tração (kWh)"
    )
    eficiencia_km_por_kwh: float = Field(
        ..., gt=0.0, description="Eficiência energética média na rodovia (km/kWh)"
    )
    nivel_inicial_percent: float = Field(
        default=100.0, ge=0.0, le=100.0, description="Nível inicial de carga da bateria (0 a 100%)"
    )

    @field_validator("capacidade_bateria_kwh", "eficiencia_km_por_kwh")
    @classmethod
    def validar_positivo(cls, valor: float) -> float:
        if not math.isfinite(valor) or valor <= 0.0:
            raise ValueError(f"Valor deve ser numérico finito e estritamente positivo: {valor}")
        return valor

    @field_validator("nivel_inicial_percent")
    @classmethod
    def validar_nivel(cls, valor: float) -> float:
        if not math.isfinite(valor) or not (0.0 <= valor <= 100.0):
            raise ValueError(f"Nível inicial deve estar entre 0.0% e 100.0%: {valor}")
        return valor

    @property
    def autonomia_maxima_km(self) -> float:
        """Autonomia nominal teórica com bateria a 100% (km)."""
        return self.capacidade_bateria_kwh * self.eficiencia_km_por_kwh

    @property
    def autonomia_efetiva_km(self) -> float:
        """Autonomia disponível considerando o estado de carga inicial (km)."""
        return self.autonomia_maxima_km * (self.nivel_inicial_percent / 100.0)


class ParametrosVeiculo(BaseModel):
    """Entrada flexível unificada para veículos a combustão ou elétricos."""

    propulsao: TipoPropulsao = Field(default=TipoPropulsao.COMBUSTAO, description="Tipo de propulsão")
    capacidade_tanque_l: float | None = Field(
        default=None, description="Capacidade do tanque (L) para veículo a combustão"
    )
    consumo_km_l: float | None = Field(
        default=None, description="Consumo médio (km/L) para veículo a combustão"
    )
    capacidade_bateria_kwh: float | None = Field(
        default=None, description="Capacidade da bateria (kWh) para veículo elétrico"
    )
    eficiencia_km_kwh: float | None = Field(
        default=None, description="Eficiência energética (km/kWh) para veículo elétrico"
    )
    nivel_inicial_percent: float = Field(
        default=100.0, ge=0.0, le=100.0, description="Nível inicial disponível (0 a 100%)"
    )

    def obter_veiculo_especifico(self) -> VeiculoCombustao | VeiculoEletrico:
        """Instancia o modelo específico correspondente ao tipo de propulsão."""
        if self.propulsao == TipoPropulsao.ELETRICO:
            if self.capacidade_bateria_kwh is None or self.eficiencia_km_kwh is None:
                raise ValueError(
                    "Veículo elétrico requer 'capacidade_bateria_kwh' e 'eficiencia_km_kwh' definidos."
                )
            return VeiculoEletrico(
                capacidade_bateria_kwh=self.capacidade_bateria_kwh,
                eficiencia_km_por_kwh=self.eficiencia_km_kwh,
                nivel_inicial_percent=self.nivel_inicial_percent,
            )
        else:
            if self.capacidade_tanque_l is None or self.consumo_km_l is None:
                raise ValueError(
                    "Veículo a combustão requer 'capacidade_tanque_l' e 'consumo_km_l' definidos."
                )
            return VeiculoCombustao(
                capacidade_tanque_litros=self.capacidade_tanque_l,
                consumo_km_por_litro=self.consumo_km_l,
                nivel_inicial_percent=self.nivel_inicial_percent,
            )


class PoliticaReabastecimento(BaseModel):
    """Diretrizes de reserva crítica e política de abastecimento/recarga."""

    reserva_critica_percent: float = Field(
        default=18.0, ge=5.0, le=50.0, description="Reserva crítica de segurança (~18%)"
    )
    margem_seguranca_percent: float = Field(
        default=22.0, ge=5.0, le=60.0, description="Margem de planejamento para acionamento de parada (>= reserva crítica)"
    )
    nivel_reabastecimento_combustao_percent: float = Field(
        default=100.0, ge=50.0, le=100.0, description="Meta percentual após abastecimento (padrão 100%)"
    )
    nivel_recarga_eletrico_percent: float = Field(
        default=80.0, ge=50.0, le=100.0, description="Meta percentual de recarga rápida DC para elétricos (padrão 80%)"
    )

    @model_validator(mode="after")
    def validar_margem_seguranca(self) -> PoliticaReabastecimento:
        if self.margem_seguranca_percent < self.reserva_critica_percent:
            raise ValueError(
                f"A margem de segurança ({self.margem_seguranca_percent}%) não pode ser menor que a reserva crítica ({self.reserva_critica_percent}%)."
            )
        return self


class ParadaProjetada(BaseModel):
    """Representação de parada estimada por autonomia na rodovia."""

    id: str = Field(..., description="Identificador da parada (ex.: parada-1)")
    ordem: int = Field(..., ge=1, description="Ordem sequencial da parada")
    nome: str = Field(..., description="Rótulo identificador do ponto projetado")
    tipo: TipoParada = Field(..., description="Tipo da parada (combustivel ou recarga)")
    distancia_km: float = Field(..., ge=0.0, description="Distância acumulada desde a origem em km")
    distancia_m: float = Field(..., ge=0.0, description="Distância acumulada desde a origem em metros")
    coordenadas: Coordenada = Field(..., description="Posição geográfica sobre a geometria da rota")
    reserva_estimada_percent: float = Field(
        ..., ge=0.0, le=100.0, description="Reserva remanescente estimada na chegada (%)"
    )
    autonomia_restante_km: float = Field(
        ..., ge=0.0, description="Autonomia residual no momento da parada (km)"
    )
    nivel_pos_parada_percent: float = Field(
        ..., ge=0.0, le=100.0, description="Nível estimado após reabastecimento/recarga (%)"
    )
    origem: OrigemParada = Field(
        default=OrigemParada.PROJETADO, description="Origem da informação: projetado ou verificado"
    )
    eh_ponto_projetado: bool = Field(
        default=True, description="Identificação explícita de ponto projetado matematicamente"
    )
    estabelecimento_verificado: bool = Field(
        default=False, description="Garantia de que o ponto NÃO é apresentado como estabelecimento confirmado"
    )
    detalhes_estabelecimento: dict[str, Any] | None = Field(
        default=None, description="Metadados do estabelecimento quando verificado (None na Issue #28)"
    )
    descricao: str | None = Field(
        default=None, description="Descrição e orientações operacionais da parada"
    )


class ResultadoAutonomia(BaseModel):
    """Resultado estruturado do cálculo de autonomia e projeção de paradas."""

    sucesso: bool = Field(..., description="Indica se o processamento foi concluído com êxito")
    solucao_segura: bool = Field(
        ..., description="Indica se existe um plano seguro respeitando a reserva crítica"
    )
    status: StatusAutonomia = Field(..., description="Classificação do estado da resposta")
    mensagem: str | None = Field(default=None, description="Mensagem diagnóstica ou causa de erro")

    propulsao: TipoPropulsao | None = Field(default=None, description="Tipo de propulsão avaliado")
    autonomia_maxima_km: float | None = Field(default=None, ge=0.0, description="Autonomia máxima nominal (km)")
    autonomia_efetiva_km: float | None = Field(default=None, ge=0.0, description="Autonomia inicial efetiva (km)")
    distancia_total_km: float | None = Field(default=None, ge=0.0, description="Distância total do percurso (km)")
    distancia_total_m: float | None = Field(default=None, ge=0.0, description="Distância total em metros")

    reserva_critica_percent: float = Field(default=18.0, description="Reserva crítica aplicada (%)")
    total_paradas: int = Field(default=0, ge=0, description="Quantidade de paradas projetadas")
    paradas: list[ParadaProjetada] = Field(default_factory=list, description="Paradas ordenadas na rota")

    reserva_final_percent: float | None = Field(
        default=None, ge=0.0, le=100.0, description="Reserva residual estimada no destino (%)"
    )
    autonomia_final_km: float | None = Field(
        default=None, ge=0.0, description="Autonomia residual estimada no destino (km)"
    )
    politica_reabastecimento: PoliticaReabastecimento = Field(
        default_factory=PoliticaReabastecimento, description="Política de reabastecimento aplicada"
    )

    estabelecimentos_confirmados: bool = Field(
        default=False, description="Garante distinção contratual: estabelecimentos físicos não verificados"
    )
    observacao: str | None = Field(
        default=None, description="Nota técnica sobre distinção entre projeções e postos reais"
    )


# ===========================================================================
# Schemas para Custos, Pedágios e Rateio (Issue #29)
# ===========================================================================


class StatusAjusteRelevo(str, Enum):
    """Disponibilidade do ajuste de consumo por relevo."""

    APLICADO = "aplicado"
    INDISPONIVEL = "indisponivel"


class StatusPedagios(str, Enum):
    """Confiabilidade e completude do total de pedágios."""

    VERIFICADO = "verificado"
    ESTIMADO = "estimado"
    SEM_PEDAGIO_CONFIRMADO = "sem_pedagio_confirmado"
    INDISPONIVEL = "indisponivel"


class ConfiabilidadePedagio(str, Enum):
    """Procedência do valor de uma praça de pedágio individual."""

    VERIFICADO = "verificado"
    ESTIMADO = "estimado"
    INDISPONIVEL = "indisponivel"


class StatusCustosViagem(str, Enum):
    """Completude do custo total apresentado."""

    COMPLETO = "completo"
    PARCIAL = "parcial"
    INVALIDO = "invalido"


class AjusteRelevo(BaseModel):
    """Ajuste quantitativo de consumo por relevo com procedência explícita.

    O valor é uma variação percentual sobre o consumo base. Um valor positivo
    aumenta o consumo; um valor negativo representa ganho. O serviço não deriva
    esse percentual de dados altimétricos brutos sem um modelo validado: quem
    integra deve fornecer o ajuste, o método e a fonte.
    """

    variacao_consumo_percent: Decimal = Field(
        ..., description="Variação percentual sobre o consumo base (> -100%)"
    )
    metodo: str = Field(..., min_length=1, description="Método usado para obter o ajuste")
    fonte: str = Field(..., min_length=1, description="Fonte ou referência do ajuste")
    limitacoes: str | None = Field(default=None, description="Limitações conhecidas do ajuste")

    @field_validator("variacao_consumo_percent")
    @classmethod
    def validar_variacao(cls, valor: Decimal) -> Decimal:
        if not valor.is_finite() or valor <= Decimal(-100):
            raise ValueError(
                "A variação de consumo por relevo deve ser finita e maior que -100%."
            )
        return valor

    @field_validator("metodo", "fonte")
    @classmethod
    def validar_texto_obrigatorio(cls, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise ValueError("Método e fonte do ajuste de relevo são obrigatórios.")
        return valor


class AjusteRelevoResultado(BaseModel):
    """Resultado da tentativa de aplicar o ajuste de relevo ao consumo."""

    status: StatusAjusteRelevo = Field(..., description="Se o ajuste foi aplicado ou está indisponível")
    variacao_consumo_percent: Decimal | None = Field(
        default=None, description="Variação percentual aplicada ao consumo"
    )
    fator_consumo: Decimal | None = Field(
        default=None, gt=Decimal(0), description="Multiplicador aplicado ao consumo base"
    )
    metodo: str | None = Field(default=None, description="Método informado para o ajuste")
    fonte: str | None = Field(default=None, description="Fonte informada para o ajuste")
    limitacoes: str | None = Field(default=None, description="Limitações do ajuste ou motivo da indisponibilidade")


class Pedagio(BaseModel):
    """Praça de pedágio com valor, confiabilidade e procedência explícitas."""

    id_praca: str = Field(
        ...,
        min_length=1,
        max_length=128,
        description="Identificação estável da praça, por exemplo rodovia:sentido:km",
    )
    valor: Decimal | None = Field(
        default=None, ge=Decimal(0), description="Valor cobrado na praça em BRL"
    )
    confiabilidade: ConfiabilidadePedagio = Field(
        ..., description="Classificação da procedência do valor"
    )
    fonte: str | None = Field(default=None, description="Fonte identificável do valor")
    metodo_estimativa: str | None = Field(
        default=None, description="Método usado quando o valor é uma estimativa"
    )
    nome: str | None = Field(default=None, description="Nome da praça ou concessionária")
    rodovia: str | None = Field(default=None, description="Rodovia da praça")
    km: float | None = Field(default=None, ge=0.0, description="Quilômetro da praça na rodovia")
    atualizado_em: str | None = Field(default=None, description="Data ou referência de atualização")
    limitacoes: str | None = Field(default=None, description="Limitações do valor ou da fonte")

    @field_validator("id_praca")
    @classmethod
    def normalizar_id_praca(cls, valor: str) -> str:
        valor = valor.strip()
        if not valor:
            raise ValueError("A identificação da praça de pedágio não pode ser vazia.")
        return valor

    @field_validator("valor")
    @classmethod
    def validar_valor_finito(cls, valor: Decimal | None) -> Decimal | None:
        if valor is not None and not valor.is_finite():
            raise ValueError("O valor do pedágio deve ser um número finito.")
        return valor

    @model_validator(mode="after")
    def validar_procedencia(self) -> Pedagio:
        if self.confiabilidade == ConfiabilidadePedagio.INDISPONIVEL:
            if self.valor is not None:
                raise ValueError("Praça indisponível não pode ter valor numérico.")
            return self
        if self.valor is None:
            raise ValueError("Praça verificada ou estimada exige valor numérico.")
        if not (self.fonte and self.fonte.strip()):
            raise ValueError("Praça verificada ou estimada exige fonte identificável.")
        if self.confiabilidade == ConfiabilidadePedagio.ESTIMADO and not (
            self.metodo_estimativa and self.metodo_estimativa.strip()
        ):
            raise ValueError("Praça estimada exige método de estimativa.")
        return self


class ResumoPedagios(BaseModel):
    """Total e procedência dos pedágios de uma rota após deduplicação."""

    status: StatusPedagios = Field(..., description="Confiabilidade e completude do total")
    total: Decimal | None = Field(
        default=None,
        ge=Decimal(0),
        description="Total de pedágios quando determinável; None se indisponível",
    )
    total_conhecido: Decimal = Field(
        default=Decimal("0.00"),
        ge=Decimal(0),
        description="Soma dos valores conhecidos, mesmo quando o total está incompleto",
    )
    total_completo: bool = Field(..., description="Indica se todas as praças têm valor conhecido")
    pracas_unicas: int = Field(..., ge=0, description="Quantidade de praças após deduplicação")
    pracas: list[Pedagio] = Field(default_factory=list, description="Praças únicas consideradas")
    fontes: list[str] = Field(default_factory=list, description="Fontes identificáveis usadas")
    limitacoes: list[str] = Field(default_factory=list, description="Limitações do total de pedágios")


class ResultadoCustoPropulsao(BaseModel):
    """Consumo e custo de combustível ou energia para uma propulsão."""

    propulsao: TipoPropulsao = Field(..., description="Tipo de propulsão calculado")
    distancia_km: Decimal = Field(..., ge=Decimal(0), description="Distância rodoviária em km")
    consumo_base: Decimal = Field(..., ge=Decimal(0), description="Consumo antes do ajuste de relevo")
    consumo_estimado: Decimal = Field(..., ge=Decimal(0), description="Consumo após o ajuste de relevo")
    unidade_consumo: str = Field(..., description="Unidade do consumo: L ou kWh")
    preco_unitario: Decimal = Field(..., gt=Decimal(0), description="Preço unitário informado")
    unidade_preco: str = Field(..., description="Unidade do preço: BRL/L ou BRL/kWh")
    fator_relevo: Decimal = Field(..., gt=Decimal(0), description="Multiplicador de consumo por relevo")
    ajuste_relevo: AjusteRelevoResultado = Field(..., description="Estado do ajuste de relevo")
    custo: Decimal = Field(..., ge=Decimal(0), description="Custo de propulsão em BRL")


class CotaPassageiro(BaseModel):
    """Cota individual de um passageiro após o rateio monetário."""

    passageiro: int = Field(..., ge=1, le=8, description="Número do passageiro, iniciando em 1")
    valor: Decimal = Field(..., ge=Decimal(0), description="Cota individual em BRL")


class RateioPassageiros(BaseModel):
    """Rateio do custo total com soma das cotas igual ao total rateado."""

    quantidade: int = Field(..., ge=1, le=8, description="Quantidade de passageiros")
    total_rateado: Decimal = Field(..., ge=Decimal(0), description="Total efetivamente rateado em BRL")
    cotas: list[CotaPassageiro] = Field(..., min_length=1, description="Cotas individuais")


class ResultadoCustosViagem(BaseModel):
    """Contrato estruturado de custos, pedágios, relevo e rateio."""

    sucesso: bool = Field(..., description="Indica se o cálculo foi concluído")
    status: StatusCustosViagem = Field(..., description="Completude do custo apresentado")
    mensagem: str | None = Field(default=None, description="Mensagem diagnóstica")

    distancia_km: Decimal | None = Field(default=None, ge=Decimal(0), description="Distância em km")
    unidade_distancia: str = Field(default="km", description="Unidade da distância")
    propulsao: TipoPropulsao | None = Field(default=None, description="Tipo de propulsão")
    consumo_estimado: Decimal | None = Field(default=None, ge=Decimal(0), description="Consumo estimado")
    unidade_consumo: str | None = Field(default=None, description="Unidade do consumo: L ou kWh")

    custo_combustivel: Decimal | None = Field(default=None, ge=Decimal(0), description="Custo de combustível em BRL")
    custo_energia: Decimal | None = Field(default=None, ge=Decimal(0), description="Custo de energia em BRL")
    custo_propulsao: Decimal | None = Field(default=None, ge=Decimal(0), description="Custo de combustível ou energia em BRL")

    custo_pedagios: Decimal | None = Field(
        default=None, ge=Decimal(0), description="Total de pedágios em BRL; None se indisponível"
    )
    custo_pedagios_conhecido: Decimal = Field(
        default=Decimal("0.00"), ge=Decimal(0), description="Soma conhecida de pedágios em BRL"
    )
    pedagios: ResumoPedagios | None = Field(default=None, description="Detalhamento dos pedágios")

    ajuste_relevo: AjusteRelevoResultado | None = Field(default=None, description="Ajuste de relevo aplicado ou indisponível")
    custo_total: Decimal | None = Field(default=None, ge=Decimal(0), description="Total conhecido em BRL")
    total_completo: bool = Field(default=False, description="Indica se todos os componentes obrigatórios estão disponíveis")

    passageiros: int = Field(default=1, ge=1, le=8, description="Quantidade de passageiros")
    rateio: RateioPassageiros | None = Field(default=None, description="Rateio individual do custo total")

    hipoteses: list[str] = Field(default_factory=list, description="Hipóteses usadas no cálculo")
    fontes: list[str] = Field(default_factory=list, description="Fontes identificáveis usadas")
    limitacoes: list[str] = Field(default_factory=list, description="Limitações e ressalvas do resultado")
