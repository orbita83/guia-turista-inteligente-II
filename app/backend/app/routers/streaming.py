"""SSE do guia separado do planejamento; não cria nem altera viagens."""
import asyncio
import json
import time
import uuid
from collections.abc import AsyncIterator
from contextlib import suppress
from datetime import UTC, datetime
from time import perf_counter
from typing import Any

import anyio
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse

from app.core.config import get_settings
from app.core.dependencies import get_current_user, get_storage
from app.schemas.streaming import GuideStreamRequest
from app.services.guide import stream_guide_with_diagnostics

router = APIRouter(prefix='/api/v1/roteiros', tags=['roteiros'])
_locks_guard = asyncio.Lock()
_active_requests: set[str] = set()


def _frame(event: str, payload: dict[str, Any]) -> str:
    return f'event: {event}\ndata: {json.dumps(payload, ensure_ascii=False)}\n\n'


def _observe(request: Request, event: str, started: float) -> None:
    observer = getattr(request.app.state, 'stream_observer', None)
    if observer is not None:
        observer(event, perf_counter() - started)


def _resolve_request_id(request: Request) -> str:
    req_id = getattr(request.state, 'request_id', None)
    if req_id:
        return str(req_id)
    received = request.headers.get('X-Request-ID', '').strip()
    if received and len(received) <= 64:
        return received
    return uuid.uuid4().hex


def _resolve_user_trip_count(request: Request, user_id: str) -> int | None:
    override = request.app.dependency_overrides.get(get_storage)
    storage = None
    if override is not None:
        try:
            storage = override()
        except Exception:  # noqa: BLE001
            storage = None
    if storage is None:
        storage = getattr(request.app.state, 'trip_storage', None)
    if storage is not None:
        if hasattr(storage, 'count_for_user'):
            return storage.count_for_user(user_id)
        if hasattr(storage, 'list_for_user'):
            return len(storage.list_for_user(user_id))
    return None


def _resolve_session_timing(request: Request) -> tuple[str, float]:
    now = time.time()
    started_at = request.session.get('session_started_at')
    if started_at is None:
        started_at = now
        request.session['session_started_at'] = started_at
    try:
        started_at_f = float(started_at)
    except (TypeError, ValueError):
        started_at_f = now
        request.session['session_started_at'] = started_at_f

    iso = datetime.fromtimestamp(started_at_f, tz=UTC).isoformat()
    duration_ms = max(0.0, round((now - started_at_f) * 1000, 2))
    return iso, duration_ms


def _telemetry_data(
    request: Request,
    user: dict[str, Any],
    stage: str,
    started: float,
    request_id: str,
    extra: dict[str, Any] | None = None,
) -> dict[str, Any]:
    started_at_iso, duration_ms = _resolve_session_timing(request)
    trip_count = _resolve_user_trip_count(request, str(user.get('id', '')))
    data: dict[str, Any] = {
        'stage': stage,
        'requestId': request_id,
        'serverTimestamp': time.time(),
        'elapsedStreamMs': round((perf_counter() - started) * 1000, 2),
        'session': {
            'userId': str(user.get('id', '')),
            'displayName': str(user.get('nome') or 'Viajante'),
            'kind': user.get('tipo', 'visitante'),
            'persistence': 'permanente' if user.get('tipo') == 'google' else 'temporaria',
            'sessionStartedAt': started_at_iso,
            'sessionDurationMs': duration_ms,
        },
    }
    if trip_count is not None:
        data['session']['userTripCount'] = trip_count
    if extra:
        data.update(extra)
    return data


@router.post('/stream-guia', response_class=StreamingResponse)
async def stream_guide(
    payload: GuideStreamRequest,
    request: Request,
    user: dict[str, Any] = Depends(get_current_user),  # noqa: B008
) -> StreamingResponse:
    settings = get_settings()
    started = perf_counter()
    request_id = _resolve_request_id(request)
    context = payload.model_dump(exclude_none=True)
    key = f'{user["id"]}:{json.dumps(context, sort_keys=True, ensure_ascii=False).casefold()}'
    async with _locks_guard:
        if key in _active_requests:
            _observe(request, 'conflict', started)
            raise HTTPException(409, 'Já existe uma geração de guia em andamento para este destino.')
        _active_requests.add(key)

    async def events() -> AsyncIterator[str]:
        stream = stream_guide_with_diagnostics(
            payload.destino, api_key=settings.gemini_api_key,
            timeout_seconds=settings.gemini_timeout_seconds, context=context,
        )
        pending: asyncio.Task | None = None
        first_chunk = False
        outcome = 'cancelled'
        _observe(request, 'started', started)
        # 1. Telemetria inicial emitida imediatamente no canal de conexão
        yield _frame('telemetry', _telemetry_data(request, user, 'connected', started, request_id))
        try:
            while True:
                if await request.is_disconnected():
                    break
                pending = asyncio.create_task(anext(stream))
                # Poll while the provider is silent: disconnect must cancel its work.
                while not pending.done():
                    await asyncio.wait({pending}, timeout=.1)
                    if await request.is_disconnected():
                        return
                try:
                    event, data = pending.result()
                except StopAsyncIteration:
                    outcome = 'error'
                    yield _frame('error', {'code': 'incomplete_stream', 'message': 'A geração terminou sem confirmação.', 'done': True})
                    break
                pending = None
                if event == 'chunk' and data.get('chunk') and not first_chunk:
                    first_chunk = True
                    _observe(request, 'first_chunk', started)
                if event == 'done':
                    outcome = 'completed'
                    if data.get('diagnostico_ia', {}).get('fallback_utilizado'):
                        _observe(request, 'fallback', started)
                elif event == 'error':
                    outcome = 'error'
                yield _frame(event, data)
                if event == 'chunk':
                    yield _frame('telemetry', _telemetry_data(request, user, 'streaming', started, request_id))
                elif event == 'done':
                    extra_data = {'diagnostico_ia': data.get('diagnostico_ia')} if data.get('diagnostico_ia') else None
                    yield _frame('telemetry', _telemetry_data(request, user, 'completed', started, request_id, extra=extra_data))
                    break
                elif event == 'error':
                    break
        except asyncio.CancelledError:
            raise
        except Exception:  # noqa: BLE001 - stream failures use a safe terminal event
            outcome = 'error'
            yield _frame('error', {'code': 'stream_error', 'message': 'Não foi possível gerar o guia.', 'done': True})
        finally:
            # Starlette cancellation scopes can cancel cleanup awaits too.
            with anyio.CancelScope(shield=True):
                if pending is not None:
                    pending.cancel()
                    with suppress(asyncio.CancelledError, Exception):
                        await pending
                try:
                    await stream.aclose()
                finally:
                    async with _locks_guard:
                        _active_requests.discard(key)
                    _observe(request, outcome, started)

    return StreamingResponse(events(), media_type='text/event-stream', headers={
        'Cache-Control': 'no-cache, no-transform', 'X-Accel-Buffering': 'no',
    })
