import math
import time
from typing import Any

import httpx
from fastapi import HTTPException, Request

from app.core.circuit_breaker import CircuitBreaker

VISITOR_TTL_SECONDS = 2 * 60 * 60


def get_http_client(request: Request) -> httpx.AsyncClient:
    client = getattr(request.app.state, "http_client", None)
    if client is None:
        raise HTTPException(status_code=503, detail="Cliente HTTP indisponível.")
    return client


def get_storage(request: Request) -> Any:
    storage = getattr(request.app.state, "trip_storage", None)
    if storage is None:
        raise HTTPException(status_code=503, detail="Armazenamento indisponível.")
    return storage


def get_circuit_breakers(request: Request) -> dict[str, CircuitBreaker]:
    breakers = getattr(request.app.state, "circuit_breakers", None)
    if not isinstance(breakers, dict) or any(
        not isinstance(breakers.get(name), CircuitBreaker)
        for name in ("weather", "guide")
    ):
        raise HTTPException(
            status_code=503,
            detail="Disjuntores de integração indisponíveis.",
        )
    return breakers


def get_current_user(request: Request) -> dict[str, Any]:
    user = request.session.get("usuario")
    if not isinstance(user, dict) or not user.get("id"):
        raise HTTPException(status_code=401, detail="Autenticação necessária.")

    if user.get("tipo") == "visitante":
        expiration = request.session.get("visitor_expires_at")
        if isinstance(expiration, bool) or not isinstance(
            expiration, (int, float, str)
        ):
            expires_at: float = 0.0
        else:
            try:
                expires_at = float(expiration)
            except (TypeError, ValueError, OverflowError):
                expires_at = 0
        if not math.isfinite(expires_at) or time.time() >= expires_at:
            storage = getattr(request.app.state, "trip_storage", None)
            if storage is not None and hasattr(storage, "forget_visitor"):
                storage.forget_visitor(str(user["id"]))
            request.session.clear()
            raise HTTPException(
                status_code=401, detail="A sessão de visitante expirou."
            )
    return user
