from typing import Any

from pydantic import BaseModel, Field


class TripCreateRequest(BaseModel):
    # TODO(aluno-3): integrar os schemas validados da issue #30 para duração,
    # perfis e veículo; coordenar compatibilidade com o Frontend na issue #20.
    origem_cidade: str = Field(max_length=256)
    origem_uf: str = Field(default="", max_length=16)
    destino_cidade: str = Field(max_length=256)
    destino_uf: str = Field(default="", max_length=16)


class TripCreateResponse(BaseModel):
    viagem: dict[str, Any]
    aviso: str | None = None


class TripListResponse(BaseModel):
    viagens: list[dict[str, Any]]
