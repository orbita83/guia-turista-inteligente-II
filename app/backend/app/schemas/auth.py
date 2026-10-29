from typing import Literal

from pydantic import BaseModel, Field


class User(BaseModel):
    id: str
    nome: str
    email: str = ""
    foto: str = ""
    tipo: Literal["google", "visitante"]


class GoogleLoginRequest(BaseModel):
    credential: str = Field(min_length=1)


class SessionResponse(BaseModel):
    usuario: User | None
    google_client_id: str
    ufs: list[str]
    session_started_at: str | None = None
    session_duration_ms: float | None = None
    visitor_remaining_ms: float | None = None


class UserResponse(BaseModel):
    usuario: User
    session_started_at: str | None = None
    session_duration_ms: float | None = None
