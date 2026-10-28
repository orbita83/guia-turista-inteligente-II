"""Contratos Pydantic v2 para altimetria, relevo e roteiros rodoviários."""

from __future__ import annotations

from enum import Enum

from pydantic import BaseModel, Field, field_validator


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
