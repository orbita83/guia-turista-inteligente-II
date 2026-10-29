import logging
import math
import time
import uuid
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, Response

from app.core.config import get_settings
from app.core.dependencies import VISITOR_TTL_SECONDS, get_http_client, get_storage
from app.schemas.auth import GoogleLoginRequest, SessionResponse, User, UserResponse
from app.services.integrations import verify_google_token

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/v1/auth", tags=["autenticação"])
GOOGLE_RESTORE_TTL_SECONDS = VISITOR_TTL_SECONDS
PRESERVED_GOOGLE_USER = "google_usuario_preservado"
PRESERVED_GOOGLE_EXPIRATION = "google_usuario_expira_em"


def _session_expiration(value: object) -> float | None:
    if isinstance(value, bool) or not isinstance(value, (int, float, str)):
        return None
    try:
        expiration = float(value)
    except (TypeError, ValueError, OverflowError):
        return None
    return expiration if math.isfinite(expiration) else None


def _forget_active_visitor(request: Request, storage: Any) -> None:
    user = request.session.get("usuario")
    if isinstance(user, dict) and user.get("tipo") == "visitante":
        storage.forget_visitor(str(user.get("id", "")))


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
    if isinstance(user, dict) and user.get("tipo") == "visitante":
        expires_at = _session_expiration(request.session.get("visitor_expires_at"))
        if expires_at is None or time.time() >= expires_at:
            request.app.state.trip_storage.forget_visitor(str(user.get("id", "")))
            request.session.clear()
            user = None
    settings = get_settings()
    return SessionResponse(
        usuario=_user_response(user) if isinstance(user, dict) else None,
        google_client_id=settings.google_client_id,
        ufs=sorted(settings.states),
    )


@router.post("/google", response_model=UserResponse)
async def login_google(
    payload: GoogleLoginRequest,
    request: Request,
    client: httpx.AsyncClient = Depends(get_http_client),  # noqa: B008
    storage: Any = Depends(get_storage),  # noqa: B008
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
    _forget_active_visitor(request, storage)
    request.session.clear()
    request.session["usuario"] = user
    return UserResponse(usuario=_user_response(user))


@router.post("/visitor", response_model=UserResponse)
def login_visitor(
    request: Request,
    storage: Any = Depends(get_storage),  # noqa: B008
) -> UserResponse:
    visitor_id = f"visitante_{uuid.uuid4().hex[:8]}"
    current_user = request.session.get("usuario")
    preserved_user = None
    preserved_expiration = None
    now = time.time()
    if isinstance(current_user, dict) and current_user.get("tipo") == "google":
        preserved_user = current_user
        preserved_expiration = now + GOOGLE_RESTORE_TTL_SECONDS
    elif isinstance(current_user, dict) and current_user.get("tipo") == "visitante":
        existing_expiration = _session_expiration(
            request.session.get(PRESERVED_GOOGLE_EXPIRATION)
        )
        if (
            isinstance(request.session.get(PRESERVED_GOOGLE_USER), dict)
            and existing_expiration is not None
            and now < existing_expiration
        ):
            preserved_user = request.session[PRESERVED_GOOGLE_USER]
            preserved_expiration = existing_expiration
        _forget_active_visitor(request, storage)

    user = {
        "id": visitor_id,
        "nome": "Viajante Convidado",
        "email": "visitante@local.dev",
        "foto": "https://lh3.googleusercontent.com/a/default-user=s96-c",
        "tipo": "visitante",
    }
    storage.ensure_visitor(visitor_id)
    request.session.clear()
    request.session["usuario"] = user
    request.session["visitor_expires_at"] = now + VISITOR_TTL_SECONDS
    if preserved_user is not None and preserved_expiration is not None:
        request.session[PRESERVED_GOOGLE_USER] = preserved_user
        request.session[PRESERVED_GOOGLE_EXPIRATION] = preserved_expiration
    return UserResponse(usuario=_user_response(user))


@router.post("/restore-google", response_model=UserResponse)
def restore_google_user(
    request: Request,
    storage: Any = Depends(get_storage),  # noqa: B008
) -> UserResponse:
    visitor = request.session.get("usuario")
    visitor_expiration = _session_expiration(
        request.session.get("visitor_expires_at")
    )
    if (
        not isinstance(visitor, dict)
        or visitor.get("tipo") != "visitante"
        or visitor_expiration is None
        or time.time() >= visitor_expiration
    ):
        if isinstance(visitor, dict) and visitor.get("tipo") == "visitante":
            storage.forget_visitor(str(visitor.get("id", "")))
            request.session.clear()
        raise HTTPException(status_code=401, detail="Sessão de visitante inválida.")

    preserved_user = request.session.get(PRESERVED_GOOGLE_USER)
    preserved_expiration = _session_expiration(
        request.session.get(PRESERVED_GOOGLE_EXPIRATION)
    )
    if (
        not isinstance(preserved_user, dict)
        or preserved_user.get("tipo") != "google"
        or not str(preserved_user.get("id", "")).strip()
        or preserved_expiration is None
        or time.time() >= preserved_expiration
    ):
        request.session.pop(PRESERVED_GOOGLE_USER, None)
        request.session.pop(PRESERVED_GOOGLE_EXPIRATION, None)
        raise HTTPException(
            status_code=401,
            detail="Não há uma sessão Google válida para restaurar.",
        )

    google_user = {
        **preserved_user,
        "id": str(preserved_user["id"]),
        "tipo": "google",
    }
    storage.forget_visitor(str(visitor.get("id", "")))
    request.session.clear()
    request.session["usuario"] = google_user
    return UserResponse(usuario=_user_response(google_user))


@router.post("/logout", status_code=204)
def logout(request: Request, storage: Any = Depends(get_storage)) -> Response:  # noqa: B008
    _forget_active_visitor(request, storage)
    request.session.clear()
    return Response(status_code=204)
