import asyncio
import time
from typing import Any

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from pydantic import BaseModel, Field, field_validator
from starlette.concurrency import run_in_threadpool

from app.core.circuit_breaker import CircuitBreaker
from app.core.config import get_settings
from app.core.dependencies import (
    get_circuit_breakers,
    get_current_user,
    get_http_client,
    get_storage,
)
from app.schemas.trips import TripCreateRequest, TripCreateResponse, TripListResponse
from app.services.trips import delete_trip, list_trips, plan_trip

router = APIRouter(prefix="/api/v1/roteiros", tags=["roteiros"])
_locks_guard = asyncio.Lock()
_active_requests: set[str] = set()
_recent_requests: dict[str, float] = {}
_DISCONNECT_MESSAGE = "http.disconnect"

WARNING_TIMEOUT = (
    "O serviço Gemini excedeu o tempo limite da requisição. "
    "Um guia de contingência foi gerado."
)


class AttractionVisitUpdate(BaseModel):
    atrativo_id: str = Field(min_length=1, max_length=200)
    visitado: bool

    @field_validator("atrativo_id")
    @classmethod
    def normalize_attraction_id(cls, value: str) -> str:
        normalized = value.strip()
        if not normalized:
            raise ValueError("atrativo_id não pode ser vazio.")
        return normalized


def _request_key(user_id: str, payload: TripCreateRequest) -> str:
    values = (
        payload.origem_cidade.strip().lower(),
        payload.origem_uf.strip().upper(),
        payload.destino_cidade.strip().lower(),
        payload.destino_uf.strip().upper(),
    )
    return f"{user_id}:{':'.join(values)}"


async def _wait_for_disconnect(request: Request) -> None:
    while True:
        message = await request.receive()
        if message["type"] == _DISCONNECT_MESSAGE:
            return


@router.get("/minhas-viagens", response_model=TripListResponse)
async def get_my_trips(
    user: dict[str, Any] = Depends(get_current_user),  # noqa: B008
    storage: Any = Depends(get_storage),  # noqa: B008
) -> TripListResponse:
    trips = await run_in_threadpool(list_trips, storage, str(user["id"]))
    return TripListResponse(viagens=trips)


@router.get("/minhas-viagens/json")
async def get_my_trips_json(
    user: dict[str, Any] = Depends(get_current_user),  # noqa: B008
    storage: Any = Depends(get_storage),  # noqa: B008
) -> dict[str, Any]:
    """Expõe os metadados antigos da base, isolando a exportação ao usuário ativo."""
    return await run_in_threadpool(storage.data_for_user, str(user["id"]), user)


@router.post("/planejar", response_model=TripCreateResponse)
async def create_trip(
    payload: TripCreateRequest,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),  # noqa: B008
    client: httpx.AsyncClient = Depends(get_http_client),  # noqa: B008
    storage: Any = Depends(get_storage),  # noqa: B008
    circuit_breakers: dict[str, CircuitBreaker] = Depends(get_circuit_breakers),  # noqa: B008
) -> TripCreateResponse:
    settings = get_settings()
    key = _request_key(str(user["id"]), payload)
    now = time.monotonic()
    async with _locks_guard:
        expired_keys = [
            recent
            for recent, timestamp in _recent_requests.items()
            if now - timestamp > 60
        ]
        for expired in expired_keys:
            _recent_requests.pop(expired, None)
        if (
            key in _active_requests
            or now - _recent_requests.get(key, float("-inf")) < 4
        ):
            raise HTTPException(
                status_code=409,
                detail="Já existe um planejamento em andamento para esta rota.",
            )
        _active_requests.add(key)
        _recent_requests[key] = now

    try:
        form = payload.model_dump()
        planning = asyncio.create_task(
            plan_trip(
                form,
                user,
                client=client,
                storage=storage,
                states=settings.states,
                gemini_api_key=settings.gemini_api_key,
                gemini_timeout_seconds=settings.gemini_timeout_seconds,
                circuit_breakers=circuit_breakers,
            )
        )
        disconnect = asyncio.create_task(_wait_for_disconnect(request))
        try:
            done, _ = await asyncio.wait(
                (planning, disconnect),
                return_when=asyncio.FIRST_COMPLETED,
            )
            if disconnect in done:
                await disconnect
                planning.cancel()
                await asyncio.gather(planning, return_exceptions=True)
                raise asyncio.CancelledError
            trip = planning.result()
        finally:
            for task in (planning, disconnect):
                if not task.done():
                    task.cancel()
            await asyncio.gather(planning, disconnect, return_exceptions=True)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail="Não foi possível consultar os serviços da viagem.",
        ) from exc
    finally:
        async with _locks_guard:
            _active_requests.discard(key)

    diagnostic = trip.get("diagnostico_ia")
    warning = None
    if (
        isinstance(diagnostic, dict)
        and "timeout" in str(diagnostic.get("motivo", "")).lower()
    ):
        warning = WARNING_TIMEOUT
    return TripCreateResponse(viagem=trip, aviso=warning)


@router.delete("/{trip_id}", status_code=status.HTTP_204_NO_CONTENT)
async def remove_trip(
    trip_id: str,
    user: dict[str, Any] = Depends(get_current_user),  # noqa: B008
    storage: Any = Depends(get_storage),  # noqa: B008
) -> None:
    await run_in_threadpool(delete_trip, storage, str(user["id"]), trip_id)


@router.patch("/{trip_id}/visitas")
async def update_attraction_visit(
    trip_id: str,
    payload: AttractionVisitUpdate,
    user: dict[str, Any] = Depends(get_current_user),  # noqa: B008
    storage: Any = Depends(get_storage),  # noqa: B008
) -> dict[str, Any]:
    # TODO(integracao): validar se o ID pertence aos atrativos do roteiro quando
    # a coleção estruturada e seus IDs estáveis da issue #25 estiverem disponíveis.
    visited_ids = await run_in_threadpool(
        storage.update_attraction_visit,
        str(user["id"]),
        trip_id,
        payload.atrativo_id,
        payload.visitado,
    )
    if visited_ids is None:
        raise HTTPException(status_code=404, detail="Roteiro não encontrado.")
    # TODO(frontend): mapear atrativos_visitados_ids no histórico e na resposta
    # para hidratar as visitas confirmadas após recarga (issue #26).
    return {
        "roteiro_id": trip_id,
        "atrativo_id": payload.atrativo_id,
        "visitado": payload.visitado,
        "atrativos_visitados_ids": visited_ids,
    }
