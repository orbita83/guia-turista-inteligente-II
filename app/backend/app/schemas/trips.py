"""Contratos HTTP de viagens e parâmetros de planejamento."""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_serializer

UFS_BRASIL: frozenset[str] = frozenset(
    {
        "AC",
        "AL",
        "AP",
        "AM",
        "BA",
        "CE",
        "DF",
        "ES",
        "GO",
        "MA",
        "MT",
        "MS",
        "MG",
        "PA",
        "PB",
        "PR",
        "PE",
        "PI",
        "RJ",
        "RN",
        "RS",
        "RO",
        "RR",
        "SC",
        "SP",
        "SE",
        "TO",
    }
)

LIMITE_CIDADE = 80


def _normalizar_uf(valor: object) -> object:
    if not isinstance(valor, str):
        return valor
    uf = valor.strip().upper()
    if not uf:
        return ""
    if uf not in UFS_BRASIL:
        raise ValueError(
            f"UF inválida: {valor!r}. Informe uma das 27 siglas brasileiras válidas."
        )
    return uf


def _normalizar_cidade(valor: object) -> object:
    if not isinstance(valor, str):
        return valor
    cidade = valor.strip()
    if not cidade:
        raise ValueError("O nome da cidade não pode ser vazio ou conter apenas espaços.")
    return cidade


class TripCreateRequest(BaseModel):
    """Entrada do planejamento, preservando UFs opcionais por compatibilidade."""

    # TODO(aluno-3): integrar os schemas validados da issue #30 para duração,
    # perfis e veículo; coordenar compatibilidade com o Frontend na issue #20.


    model_config = ConfigDict(
        json_schema_extra={
            "examples": [
                {
                    "origem_cidade": "Recife",
                    "origem_uf": "PE",
                    "destino_cidade": "Salvador",
                    "destino_uf": "BA",
                }
            ]
        }
    )

    origem_cidade: str = Field(
        ...,
        min_length=1,
        max_length=LIMITE_CIDADE,
        description="Nome da cidade de origem, com acentos preservados",
    )
    origem_uf: str = Field(
        default="",
        max_length=2,
        description="Sigla da UF de origem; vazio mantém compatibilidade legada",
    )
    destino_cidade: str = Field(
        ...,
        min_length=1,
        max_length=LIMITE_CIDADE,
        description="Nome da cidade de destino, com acentos preservados",
    )
    destino_uf: str = Field(
        default="",
        max_length=2,
        description="Sigla da UF de destino; vazio mantém compatibilidade legada",
    )

    @field_validator("origem_uf", "destino_uf", mode="before")
    @classmethod
    def validar_uf(cls, valor: object) -> object:
        return _normalizar_uf(valor)

    @field_validator("origem_cidade", "destino_cidade", mode="before")
    @classmethod
    def validar_cidade(cls, valor: object) -> object:
        return _normalizar_cidade(valor)


class ModeloViagemLegado(BaseModel):
    """Base tolerante para leitura de viagens antigas, preservando campos extras."""

    model_config = ConfigDict(extra="allow")

    @model_serializer(mode="wrap")
    def serializar_campos_informados(self, handler: Any) -> dict[str, Any]:
        dados = handler(self)
        extras = set(self.__pydantic_extra__ or {})
        return {
            chave: valor
            for chave, valor in dados.items()
            if chave in self.model_fields_set or chave in extras
        }


class ClimaViagem(ModeloViagemLegado):
    temperatura: str | None = None
    umidade: str | None = None
    vento: str | None = None


class PercursoViagem(ModeloViagemLegado):
    distancia: str | None = None
    tempo: str | None = None


class ViagemLegada(ModeloViagemLegado):
    """Formato histórico de viagem, mantendo campos adicionais sem perda."""

    id: str
    criado_em: str | None = None
    origem: str | None = None
    destino: str | None = None
    clima: ClimaViagem | None = None
    percurso: PercursoViagem | None = None
    dicas_destino: str | None = None
    diagnostico_ia: dict[str, Any] | None = None


class TripCreateResponse(BaseModel):
    viagem: ViagemLegada
    aviso: str | None = None


class TripListResponse(BaseModel):
    viagens: list[ViagemLegada]
