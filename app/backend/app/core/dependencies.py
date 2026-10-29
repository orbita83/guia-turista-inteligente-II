import logging
import time
from typing import Any

import httpx
from fastapi import HTTPException, Request

VISITOR_TTL_SECONDS = 2 * 60 * 60
logger = logging.getLogger(__name__)


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


def get_current_user(request: Request) -> dict[str, Any]:
    user = request.session.get("usuario")
    if not isinstance(user, dict) or not user.get("id"):
        raise HTTPException(status_code=401, detail="Autenticação necessária.")

    expires_at = request.session.get("visitor_expires_at")
    if user.get("tipo") == "visitante" and expires_at:
        try:
            expired = time.time() >= float(expires_at)
        except (TypeError, ValueError):
            expired = True
        if expired:
            storage = getattr(request.app.state, "trip_storage", None)
            if storage is not None and hasattr(storage, "forget_visitor"):
                try:
                    storage.forget_visitor(str(user["id"]))
                except Exception as error:  # noqa: BLE001 - expiração invalida sessão mesmo se limpeza falhar
                    logger.warning(
                        "Falha ao limpar sessão visitante expirada: %s",
                        type(error).__name__,
                    )
            request.session.clear()
            raise HTTPException(
                status_code=401, detail="A sessão de visitante expirou."
            )
    return user
