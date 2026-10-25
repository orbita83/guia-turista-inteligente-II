import time
from typing import Any

import httpx
from fastapi import HTTPException, Request

VISITOR_TTL_SECONDS = 2 * 60 * 60


def get_http_client(request: Request) -> httpx.AsyncClient:
    return request.app.state.http_client


def get_storage(request: Request) -> Any:
    return request.app.state.trip_storage


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
            request.app.state.trip_storage.forget_visitor(str(user["id"]))
            request.session.clear()
            raise HTTPException(
                status_code=401, detail="A sessão de visitante expirou."
            )
    return user
