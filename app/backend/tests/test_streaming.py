"""Contrato SSE: progressão, contingência, cancelamento e exclusão mútua."""
import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest
from fastapi import FastAPI
from starlette.middleware.sessions import SessionMiddleware

from app.core.dependencies import get_current_user
from app.routers import streaming
from app.services import guide

VALID = '📍 Pontos turísticos\nMuseu e praça.\n\n🍽️ Culinária\nPratos regionais.\n\n💡 Dica de ouro\nConfirme horários.'


class FakeProvider:
    def __init__(self, fragments, failure=None, waiting=None):
        self.fragments = fragments
        self.failure = failure
        self.waiting = waiting
        self.closed = False
        self.stream_closed = False
        self.models = self

    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        self.closed = True

    async def generate_content_stream(self, **kwargs):
        async def iterate():
            try:
                for text in self.fragments:
                    yield SimpleNamespace(text=text)
                if self.waiting is not None:
                    self.waiting.set()
                    await asyncio.Event().wait()
                if self.failure:
                    raise self.failure
            finally:
                self.stream_closed = True
        return iterate()


def install_provider(monkeypatch, provider):
    monkeypatch.setattr(guide.genai, 'Client', lambda **kw: SimpleNamespace(aio=provider))


@pytest.mark.asyncio
async def test_provider_streams_chunks_before_done_and_closes(monkeypatch):
    provider = FakeProvider([VALID[:30], VALID[30:]])
    install_provider(monkeypatch, provider)
    stream = guide.stream_guide_with_diagnostics('Recife', api_key='key', timeout_seconds=1)
    assert await anext(stream) == ('chunk', {'chunk': VALID[:30], 'done': False})
    assert not provider.closed
    rest = [event async for event in stream]
    assert rest[0] == ('chunk', {'chunk': VALID[30:], 'done': False})
    assert rest[-1][0] == 'done'
    assert rest[-1][1]['text'] == VALID
    assert rest[-1][1]['diagnostico_ia']['fallback_utilizado'] is False
    assert provider.closed and provider.stream_closed


@pytest.mark.asyncio
@pytest.mark.parametrize('failure,reason', [(TimeoutError(), 'timeout'), (ValueError(), 'resposta_inadequada'), (RuntimeError('secret-key'), 'falha_inesperada')])
async def test_provider_failure_replaces_partial_text_and_finishes(monkeypatch, failure, reason):
    provider = FakeProvider(['partial'], failure=failure)
    install_provider(monkeypatch, provider)
    events = [event async for event in guide.stream_guide_with_diagnostics('Recife', api_key='key', timeout_seconds=1)]
    assert events[0] == ('chunk', {'chunk': 'partial', 'done': False})
    assert events[1][0] == 'replace'
    assert events[1][1]['text'] == guide._fallback_guide('Recife')
    assert events[-1][1]['diagnostico_ia']['motivo'] == reason
    assert 'secret-key' not in json.dumps(events)
    assert provider.closed and provider.stream_closed


@pytest.mark.asyncio
async def test_missing_key_returns_contingency_without_contacting_provider(monkeypatch):
    monkeypatch.setattr(guide.genai, 'Client', lambda **kw: pytest.fail('network forbidden'))
    events = [event async for event in guide.stream_guide_with_diagnostics('Recife', api_key='', timeout_seconds=1)]
    assert [event[0] for event in events] == ['replace', 'done']
    assert events[-1][1]['text'] == guide._fallback_guide('Recife')
    assert events[-1][1]['diagnostico_ia']['motivo'] == 'chave_ausente'


@pytest.mark.asyncio
async def test_cancelling_provider_while_waiting_closes_stream_and_client(monkeypatch):
    waiting = asyncio.Event()
    provider = FakeProvider([], waiting=waiting)
    install_provider(monkeypatch, provider)
    stream = guide.stream_guide_with_diagnostics('Recife', api_key='key', timeout_seconds=30)
    task = asyncio.create_task(anext(stream))
    await asyncio.wait_for(waiting.wait(), 1)
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert provider.closed and provider.stream_closed


@pytest.mark.asyncio
async def test_provider_deadline_replaces_without_hanging(monkeypatch):
    provider = FakeProvider([], waiting=asyncio.Event())
    install_provider(monkeypatch, provider)
    events = [event async for event in guide.stream_guide_with_diagnostics('Recife', api_key='key', timeout_seconds=.01)]
    assert events[-1][1]['diagnostico_ia']['motivo'] == 'timeout'
    assert provider.closed and provider.stream_closed


def create_test_app(user_override=True):
    app = FastAPI()
    app.add_middleware(SessionMiddleware, secret_key='test-stream-session')
    app.include_router(streaming.router)
    if user_override:
        app.dependency_overrides[get_current_user] = lambda: {'id': 'user-1', 'tipo': 'visitante'}
    return app




@pytest.mark.asyncio
async def test_stream_authentication_validation_and_no_trip_write(monkeypatch):
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_test_app(False)), base_url='http://test') as client:
        assert (await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})).status_code == 401
    app = create_test_app()
    monkeypatch.setattr(streaming, 'get_settings', lambda: SimpleNamespace(gemini_api_key='', gemini_timeout_seconds=1))
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        assert (await client.post('/api/v1/roteiros/stream-guia', json={'destino':' '})).status_code == 422
        assert (await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife', 'dias_estadia':0})).status_code == 422
        result = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
    assert result.status_code == 200
    assert result.headers['content-type'].startswith('text/event-stream')
    assert result.headers['x-accel-buffering'] == 'no'
    assert 'event: replace\n' in result.text
    assert 'event: done\n' in result.text
    assert not hasattr(app.state, 'trip_storage')


@pytest.mark.asyncio
async def test_real_simultaneous_calls_conflict_but_another_user_can_generate(monkeypatch):
    from fastapi import Request
    app = create_test_app()
    app.dependency_overrides[get_current_user] = lambda request: None
    async def user(request: Request):
        return {'id': request.headers.get('x-test-user', 'user-1')}
    app.dependency_overrides[get_current_user] = user
    started = asyncio.Event()
    release = asyncio.Event()
    async def fake_stream(*args, **kwargs):
        started.set()
        await release.wait()
        yield 'done', {'chunk':'', 'done': True, 'text':'ready'}
    monkeypatch.setattr(streaming, 'stream_guide_with_diagnostics', fake_stream)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        first = asyncio.create_task(client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'}))
        await asyncio.wait_for(started.wait(), 1)
        duplicate = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
        assert duplicate.status_code == 409
        other = asyncio.create_task(client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'}, headers={'x-test-user':'user-2'}))
        await asyncio.sleep(.01)
        assert not other.done()
        release.set()
        assert (await first).status_code == 200
        assert (await other).status_code == 200
        assert (await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})).status_code == 200
    assert not streaming._active_requests


@pytest.mark.asyncio
async def test_terminal_failure_is_safe_error_event_and_releases_lock(monkeypatch):
    async def broken(*args, **kwargs):
        raise RuntimeError('sensitive-provider-message')
        yield
    monkeypatch.setattr(streaming, 'stream_guide_with_diagnostics', broken)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_test_app()), base_url='http://test') as client:
        result = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
    assert 'event: error\n' in result.text
    assert 'stream_error' in result.text
    assert 'sensitive-provider-message' not in result.text
    assert not streaming._active_requests


@pytest.mark.asyncio
@pytest.mark.parametrize('finish', [True, False], ids=['complete', 'disconnect'])
async def test_uvicorn_delivers_fragment_before_completion_and_releases_on_disconnect(monkeypatch, finish):
    """TCP real: nenhum ASGITransport/TestClient pode provar entrega progressiva."""
    import socket

    import uvicorn

    continue_generation = asyncio.Event()
    closed = asyncio.Event()

    class GatedProvider(FakeProvider):
        async def __aexit__(self, *args):
            closed.set()
            await super().__aexit__(*args)

        async def generate_content_stream(self, **kwargs):
            async def iterate():
                try:
                    yield SimpleNamespace(text=VALID[:30])
                    await continue_generation.wait()
                    yield SimpleNamespace(text=VALID[30:])
                finally:
                    self.stream_closed = True
            return iterate()

    provider = GatedProvider([])
    install_provider(monkeypatch, provider)
    monkeypatch.setattr(streaming, 'get_settings', lambda: SimpleNamespace(gemini_api_key='key', gemini_timeout_seconds=5))
    from app import main
    app = main.app
    previous_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_user] = lambda: {'id': 'tcp-user'}
    monkeypatch.setattr(app.state, 'circuit_breakers', {}, raising=False)
    monkeypatch.setattr(app.state, 'stream_observer', main.STREAM_METRICS, raising=False)
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    sock.listen(128)
    port = sock.getsockname()[1]
    server = uvicorn.Server(uvicorn.Config(app, log_level='error', lifespan='off'))
    task = asyncio.create_task(server.serve(sockets=[sock]))
    try:
        async with asyncio.timeout(3):
            while not server.started:
                await asyncio.sleep(.01)
        async with httpx.AsyncClient(base_url=f'http://127.0.0.1:{port}') as client:
            before = metric_values((await client.get('/metrics')).text)
            async with client.stream('POST', '/api/v1/roteiros/stream-guia', json={'destino':'Recife'}) as response:
                assert response.status_code == 200
                iterator = response.aiter_lines()
                assert await asyncio.wait_for(anext(iterator), 1) == 'event: telemetry'
                telemetry_data = json.loads((await anext(iterator))[6:])
                assert telemetry_data['stage'] == 'connected'
                assert 'session' in telemetry_data
                assert await anext(iterator) == ''
                assert await asyncio.wait_for(anext(iterator), 1) == 'event: chunk'
                assert json.loads((await anext(iterator))[6:]) == {'chunk': VALID[:30], 'done':False}
                assert not provider.closed
                assert not continue_generation.is_set()
                active = metric_values((await client.get('/metrics')).text)
                assert active['guia_stream_active'] == 1
                assert active['guia_stream_first_content_seconds_count'] == before.get('guia_stream_first_content_seconds_count', 0) + 1
                duplicate = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
                assert duplicate.status_code == 409
                if finish:
                    continue_generation.set()
                    tail = '\n'.join([line async for line in iterator])
                    assert 'event: done' in tail
                    assert VALID in [json.loads(line[6:]).get('text') for line in tail.splitlines() if line.startswith('data: ')]
            await asyncio.wait_for(closed.wait(), 1)
            async with asyncio.timeout(1):
                while streaming._active_requests:
                    await asyncio.sleep(.01)
            assert provider.closed and provider.stream_closed
            after = metric_values((await client.get('/metrics')).text)
            assert after['guia_stream_active'] == 0
            assert after['guia_stream_conflicts_total'] == before.get('guia_stream_conflicts_total', 0) + 1
            outcome = 'completed' if finish else 'cancelled'
            finished_key = f'guia_stream_finished_total:outcome={outcome}'
            assert after[finished_key] == before.get(finished_key, 0) + 1
            continue_generation.set()
            retry = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
            assert retry.status_code == 200
            assert 'event: done' in retry.text
    finally:
        server.should_exit = True
        await asyncio.wait_for(task, 3)
        sock.close()
        app.dependency_overrides = previous_overrides


def metric_values(text):
    from prometheus_client.parser import text_string_to_metric_families
    result = {}
    for family in text_string_to_metric_families(text):
        for sample in family.samples:
            labels = ':'.join(f'{key}={value}' for key, value in sorted(sample.labels.items()))
            result[sample.name + (':' + labels if labels else '')] = sample.value
    return result


@pytest.mark.asyncio
async def test_metrics_record_fallback_and_safe_failure(monkeypatch):
    from app import main
    app = main.app
    previous = app.dependency_overrides.copy()
    app.dependency_overrides[get_current_user] = lambda: {'id':'metric-user'}
    monkeypatch.setattr(app.state, 'circuit_breakers', {}, raising=False)
    monkeypatch.setattr(app.state, 'stream_observer', main.STREAM_METRICS, raising=False)
    monkeypatch.setattr(streaming, 'get_settings', lambda: SimpleNamespace(gemini_api_key='', gemini_timeout_seconds=1))
    try:
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
            before = metric_values((await client.get('/metrics')).text)
            fallback = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
            assert 'event: replace' in fallback.text
            after = metric_values((await client.get('/metrics')).text)
            assert after['guia_stream_fallback_total'] == before.get('guia_stream_fallback_total',0) + 1
            assert after['guia_stream_first_content_seconds_count'] == before.get('guia_stream_first_content_seconds_count',0)
            async def broken(*args, **kwargs):
                raise RuntimeError('private')
                yield
            monkeypatch.setattr(streaming, 'stream_guide_with_diagnostics', broken)
            failed = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
            assert 'event: error' in failed.text
            end = metric_values((await client.get('/metrics')).text)
            assert end['guia_stream_finished_total:outcome=error'] == after.get('guia_stream_finished_total:outcome=error',0) + 1
            assert end['guia_stream_active'] == 0
    finally:
        app.dependency_overrides = previous


def test_real_visitor_cookie_can_stream_without_creating_trip(monkeypatch, tmp_path):
    from fastapi.testclient import TestClient

    from app import main
    from app.core.dependencies import get_storage
    from app.core.storage import TripStorage
    storage = TripStorage(tmp_path / 'trips.json')
    previous = main.app.dependency_overrides.copy()
    main.app.dependency_overrides[get_storage] = lambda: storage
    monkeypatch.setattr(streaming, 'get_settings', lambda: SimpleNamespace(gemini_api_key='', gemini_timeout_seconds=1))
    try:
        with TestClient(main.app) as client:
            main.app.state.trip_storage = storage
            assert client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'}).status_code == 401
            login = client.post('/api/v1/auth/visitor')
            assert login.status_code == 200
            visitor_id = login.json()['usuario']['id']
            result = client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
            assert result.status_code == 200
            assert 'event: done' in result.text
            assert storage.list_for_user(visitor_id) == []
    finally:
        main.app.dependency_overrides = previous


@pytest.mark.asyncio
async def test_close_failure_still_releases_reservation_and_metrics(monkeypatch):
    events = []
    app = create_test_app()
    app.state.stream_observer = lambda event, elapsed: events.append(event)
    class BrokenClose:
        async def __anext__(self):
            return 'done', {'chunk':'', 'done':True, 'text':'ready'}
        async def aclose(self):
            raise RuntimeError('private-close-error')
    monkeypatch.setattr(streaming, 'stream_guide_with_diagnostics', lambda *args, **kwargs: BrokenClose())
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app, raise_app_exceptions=False), base_url='http://test') as client:
        result = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
    assert 'private-close-error' not in result.text
    assert not streaming._active_requests
    assert events == ['started', 'completed']


@pytest.mark.asyncio
async def test_error_event_is_counted_as_error_and_empty_chunk_has_no_first_content(monkeypatch):
    events = []
    app = create_test_app()
    app.state.stream_observer = lambda event, elapsed: events.append(event)
    async def emit_error(*args, **kwargs):
        yield 'chunk', {'chunk':'', 'done':False}
        yield 'error', {'code':'provider_error', 'message':'Indisponível', 'done':True}
    monkeypatch.setattr(streaming, 'stream_guide_with_diagnostics', emit_error)
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        result = await client.post('/api/v1/roteiros/stream-guia', json={'destino':'Recife'})
    assert 'event: error' in result.text
    assert events == ['started', 'error']
    assert not streaming._active_requests


@pytest.mark.asyncio
async def test_deadline_survives_separate_tasks_for_each_fragment(monkeypatch):
    provider = FakeProvider(['partial'], waiting=asyncio.Event())
    install_provider(monkeypatch, provider)
    stream = guide.stream_guide_with_diagnostics('Recife', api_key='key', timeout_seconds=.02)
    assert (await asyncio.create_task(anext(stream)))[0] == 'chunk'
    await asyncio.sleep(.03)
    assert (await asyncio.wait_for(asyncio.create_task(anext(stream)), .2))[0] == 'replace'
    final = await asyncio.create_task(anext(stream))
    assert final[1]['diagnostico_ia']['motivo'] == 'timeout'
    await stream.aclose()
    assert provider.closed and provider.stream_closed


@pytest.mark.asyncio
@pytest.mark.parametrize('invalid', ['<script>unsafe</script>', 'x' * (32 * 1024 + 1)], ids=['html', 'excessivo'])
async def test_invalid_or_excessive_content_is_replaced_by_contingency(monkeypatch, invalid):
    provider = FakeProvider([invalid])
    install_provider(monkeypatch, provider)
    events = [event async for event in guide.stream_guide_with_diagnostics('Recife', api_key='key', timeout_seconds=1)]
    assert events[-2][0] == 'replace'
    assert events[-1][1]['text'] == guide._fallback_guide('Recife')
    assert events[-1][1]['diagnostico_ia']['motivo'] == 'resposta_inadequada'
    assert provider.closed and provider.stream_closed


@pytest.mark.asyncio
async def test_stream_emits_telemetry_events_with_session_and_request_id(monkeypatch):
    provider = FakeProvider([VALID[:30], VALID[30:]])
    install_provider(monkeypatch, provider)
    monkeypatch.setattr(streaming, 'get_settings', lambda: SimpleNamespace(gemini_api_key='key', gemini_timeout_seconds=2))
    app = create_test_app()
    async with httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url='http://test') as client:
        response = await client.post('/api/v1/roteiros/stream-guia', json={'destino': 'Recife'}, headers={'X-Request-ID': 'custom-corr-123'})
    assert response.status_code == 200
    assert 'event: telemetry\n' in response.text
    # Extract telemetry data payloads
    blocks = response.text.split('\n\n')
    telemetry_frames = []
    for b in blocks:
        if b.startswith('event: telemetry'):
            for line in b.splitlines():
                if line.startswith('data: '):
                    telemetry_frames.append(json.loads(line[6:]))
    assert len(telemetry_frames) >= 2
    initial = telemetry_frames[0]
    assert initial['stage'] == 'connected'
    assert initial['requestId'] == 'custom-corr-123'
    assert initial['session']['displayName'] == 'Viajante'
    assert initial['session']['kind'] == 'visitante'
    assert initial['session']['persistence'] == 'temporaria'
    assert 'sessionStartedAt' in initial['session']
    assert isinstance(initial['session']['sessionDurationMs'], (int, float))

    completed = telemetry_frames[-1]
    assert completed['stage'] == 'completed'
    assert completed['diagnostico_ia']['fallback_utilizado'] is False
