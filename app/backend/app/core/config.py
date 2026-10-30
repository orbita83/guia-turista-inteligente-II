import json
import secrets
import shutil
from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import AliasChoices, Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

REPOSITORY_ROOT = Path(__file__).resolve().parents[4]
BACKEND_ROOT = Path(__file__).resolve().parents[2]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=REPOSITORY_ROOT / ".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    secret_key: str = Field(default_factory=lambda: secrets.token_urlsafe(48), min_length=32)
    google_client_id: str = (
        "776335673676-dk7od4ljhh43bio4bppf94i8ou0u9v9i.apps.googleusercontent.com"
    )
    gemini_api_key: str = ""
    open_elevation_api_key: str = ""
    overpass_url: str = "https://overpass-api.de/api/interpreter"
    gemini_timeout_seconds: float = Field(
        default=60.0,
        validation_alias=AliasChoices(
            "GEMINI_TIMEOUT_SECONDS", "GEMINI_TIMEOUT_SEGUNDOS"
        ),
    )
    session_cookie_name: str = "guia_turista_session"
    session_cookie_secure: bool = False
    session_cookie_samesite: Literal["lax", "strict", "none"] = "lax"
    cors_origins: str = "http://localhost:5173,http://localhost:3000"
    trips_file: Path = BACKEND_ROOT / "static" / "data" / "viagens.json"
    legacy_trips_file: Path = REPOSITORY_ROOT / "static" / "data" / "viagens.json"
    states_file: Path = BACKEND_ROOT / "static" / "data" / "estados_brasil.json"

    def migrate_legacy_trips_file(self) -> None:
        """Copy the monolith history once, preserving its original file as backup."""
        if self.trips_file.exists() or not self.legacy_trips_file.exists():
            return
        try:
            data = json.loads(self.legacy_trips_file.read_text(encoding="utf-8"))
        except (OSError, ValueError) as exc:
            raise RuntimeError("O arquivo legado de viagens não pôde ser lido.") from exc
        if not isinstance(data, dict) or not isinstance(data.get("usuarios", {}), dict):
            raise TypeError("O arquivo legado de viagens tem estrutura inválida.")
        self.trips_file.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(self.legacy_trips_file, self.trips_file)

    @field_validator("gemini_timeout_seconds", mode="before")
    @classmethod
    def preserve_legacy_timeout_fallback(cls, value: object) -> float:
        if isinstance(value, bool) or not isinstance(value, (int, float, str)):
            return 60.0
        try:
            timeout = float(value)
        except ValueError:
            return 60.0
        return timeout if 0 < timeout <= 120 else 60.0

    @property
    def states(self) -> dict[str, str]:
        try:
            data = json.loads(self.states_file.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            return {}
        return data if isinstance(data, dict) else {}

    @property
    def allowed_origins(self) -> list[str]:
        return [
            origin.strip() for origin in self.cors_origins.split(",") if origin.strip()
        ]


@lru_cache
def get_settings() -> Settings:
    return Settings()
