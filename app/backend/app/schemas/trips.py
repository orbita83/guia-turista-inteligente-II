from typing import Any

from pydantic import BaseModel, Field


class TripCreateRequest(BaseModel):
    origem_cidade: str = Field(max_length=256)
    origem_uf: str = Field(default="", max_length=16)
    destino_cidade: str = Field(max_length=256)
    destino_uf: str = Field(default="", max_length=16)


class TripCreateResponse(BaseModel):
    viagem: dict[str, Any]
    aviso: str | None = None


class TripListResponse(BaseModel):
    viagens: list[dict[str, Any]]
