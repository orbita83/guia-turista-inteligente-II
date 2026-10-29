import logging
import time
import uuid
from datetime import UTC, datetime
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.config import get_settings
from app.core.dependencies import VISITOR_TTL_SECONDS, get_http_client, get_storage
from app.schemas.auth import GoogleLoginRequest, SessionResponse, User, UserResponse
from app.services.integrations import verify_google_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["autenticação"])


def _session_timing(request: Request) -> tuple[str | None, float | None]:
    started_at = request.session.get("session_started_at")
    now = time.time()
    if started_at is None:
        if request.session.get("usuario"):
            started_at = now
            request.session["session_started_at"] = started_at
        else:
            return None, None
    try:
        started_at_f = float(started_at)
    except (TypeError, ValueError):
        started_at_f = now
        request.session["session_started_at"] = started_at_f

    iso = datetime.fromtimestamp(started_at_f, tz=UTC).isoformat()
    duration_ms = max(0.0, round((now - started_at_f) * 1000, 2))
    return iso, duration_ms


def _user_response(data: dict[str, Any]) -> User:
    return User(
        id=str(data["id"]),
        nome=str(data.get("nome") or "Viajante"),
        email=str(data.get("email") or ""),
        foto=str(data.get("foto") or ""),
        tipo="visitante" if data.get("tipo") == "visitante" else "google",
    )


@router.get("/session", response_model=SessionResponse)
def get_session(request: Request) -> SessionResponse:
    user = request.session.get("usuario")
    expires_at = request.session.get("visitor_expires_at")
    if isinstance(user, dict) and user.get("tipo") == "visitante" and expires_at:
        try:
            is_expired = time.time() >= float(expires_at)
        except (TypeError, ValueError):
            is_expired = True
        if is_expired:
            request.app.state.trip_storage.forget_visitor(str(user.get("id", "")))
            request.session.clear()
            user = None
    settings = get_settings()
    session_started_at, session_duration_ms = (
        _session_timing(request) if isinstance(user, dict) else (None, None)
    )
    return SessionResponse(
        usuario=_user_response(user) if isinstance(user, dict) else None,
        google_client_id=settings.google_client_id,
        ufs=sorted(settings.states),
        session_started_at=session_started_at,
        session_duration_ms=session_duration_ms,
    )


@router.post("/google", response_model=UserResponse)
async def login_google(
    payload: GoogleLoginRequest,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),  # noqa: B008
) -> UserResponse:
    settings = get_settings()
    try:
        profile = await verify_google_token(
            client,
            payload.credential.strip(),
            google_client_id=settings.google_client_id,
        )
    except (httpx.HTTPError, ValueError) as exc:
        logger.warning(
            "Falha na validação da credencial Google: %s", type(exc).__name__
        )
        profile = None
    if not isinstance(profile, dict):
        raise HTTPException(status_code=401, detail="Credencial Google inválida.")

    user_id = str(profile.get("sub") or profile.get("id") or "").strip()
    if not user_id:
        raise HTTPException(
            status_code=401,
            detail="A credencial Google não contém uma identidade válida.",
        )
    user = {
        "id": user_id,
        "nome": profile.get("name") or profile.get("nome") or "Usuário Google",
        "email": profile.get("email") or "",
        "foto": profile.get("picture") or profile.get("foto") or "",
        "tipo": "google",
    }
    now = time.time()
    request.session.clear()
    request.session["usuario"] = user
    request.session["session_started_at"] = now
    iso = datetime.fromtimestamp(now, tz=UTC).isoformat()
    return UserResponse(
        usuario=_user_response(user),
        session_started_at=iso,
        session_duration_ms=0.0,
    )


@router.post("/visitor", response_model=UserResponse)
def login_visitor(
    request: Request,
    storage: Any = Depends(get_storage),  # noqa: B008
) -> UserResponse:
    visitor_id = f"visitante_{uuid.uuid4().hex[:8]}"
    user = {
        "id": visitor_id,
        "nome": "Viajante Convidado",
        "email": "visitante@local.dev",
        "foto": "https://lh3.googleusercontent.com/a/default-user=s96-c",
        "tipo": "visitante",
    }
    now = time.time()
    storage.ensure_visitor(visitor_id)
    request.session.clear()
    request.session["usuario"] = user
    request.session["session_started_at"] = now
    request.session["visitor_expires_at"] = now + VISITOR_TTL_SECONDS
    iso = datetime.fromtimestamp(now, tz=UTC).isoformat()
    return UserResponse(
        usuario=_user_response(user),
        session_started_at=iso,
        session_duration_ms=0.0,
    )


@router.post("/logout", status_code=204)
def logout(request: Request, storage: Any = Depends(get_storage)) -> Response:  # noqa: B008
    active_user = request.session.get("usuario")
    if isinstance(active_user, dict) and active_user.get("tipo") == "visitante":
        storage.forget_visitor(str(active_user.get("id", "")))
    request.session.clear()
    return Response(status_code=204)
