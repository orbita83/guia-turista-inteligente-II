"""Payload da aba de guia, independente da criação de uma viagem."""
from typing import Annotated

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

ShortText = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=256)]


class GuideStreamRequest(BaseModel):
    model_config = ConfigDict(extra='forbid')

    destino: ShortText
    dias_estadia: int | None = Field(default=None, ge=1, le=365)
    estilo_viagem: ShortText | None = None
    clima_info: dict[str, str] | None = Field(default=None, max_length=10)
    atrativos: list[ShortText] | None = Field(default=None, max_length=30)
    gastronomia: list[ShortText] | None = Field(default=None, max_length=30)
