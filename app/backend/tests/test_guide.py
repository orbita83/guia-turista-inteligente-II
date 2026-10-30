import asyncio
import threading
import time

import httpx
import pytest

from app.services import guide

VALID_GUIDE = (
    "📍 Pontos turísticos\nPraça central e museu local.\n\n"
    "🍽️ Culinária\nPrato regional e fruta da estação.\n\n"
    "💡 Dica de ouro\nConfirme horários com fontes locais."
)


def test_guide_instructions_cover_required_concise_itinerary() -> None:
    instructions = guide.GUIDE_INSTRUCTIONS.lower()
    for required in ("20 palavras", "manha", "tarde", "noite", "15 palavras", "clima", "indisponivel"):
        assert required in instructions


@pytest.mark.asyncio
async def test_guide_receives_planning_preferences(monkeypatch) -> None:
    captured = {}

    def request(destination, api_key, timeout_seconds, context):
        captured.update(context)
        return VALID_GUIDE

    monkeypatch.setattr(guide, "_request_guide", request)
    text, diagnostics = await guide.get_guide_with_diagnostics(
        "Recife", api_key="test-key", timeout_seconds=1,
        context={"duracao_dias": 3, "perfis": ["cultural", "familia"]},
    )
    assert text == VALID_GUIDE
    assert diagnostics["status"] == "sucesso"
    assert captured == {"duracao_dias": 3, "perfis": ["cultural", "familia"]}


@pytest.mark.asyncio
async def test_guide_wait_does_not_block_other_coroutines(monkeypatch) -> None:
    started = threading.Event()
    release = threading.Event()
    released_at: list[float] = []
    progressed_at: list[float] = []

    def release_worker() -> None:
        released_at.append(time.monotonic())
        release.set()

    def slow_request(destination: str, api_key: str, timeout_seconds: float) -> str:
        started.set()
        release.wait()
        return VALID_GUIDE

    async def progress() -> None:
        await asyncio.sleep(0)
        progressed_at.append(time.monotonic())

    monkeypatch.setattr(guide, "_request_guide", slow_request)
    timer = threading.Timer(0.2, release_worker)
    timer.start()
    request = asyncio.create_task(
        guide.get_guide_with_diagnostics(
            "Recife",
            api_key="test-key",
            timeout_seconds=2,
        )
    )

    try:
        assert await asyncio.to_thread(started.wait, 1)
        await progress()
        text, diagnostics = await request
    finally:
        release.set()
        timer.cancel()
        if not request.done():
            request.cancel()
            await asyncio.gather(request, return_exceptions=True)

    assert progressed_at[0] < released_at[0]
    assert text == VALID_GUIDE
    assert diagnostics == {
        "status": "sucesso",
        "modelo": guide.MODEL,
        "fallback_utilizado": False,
    }


@pytest.mark.asyncio
async def test_guide_timeout_returns_existing_fallback_and_diagnostic(
    monkeypatch,
) -> None:
    started = threading.Event()
    release = threading.Event()
    finished = threading.Event()

    def slow_request(destination: str, api_key: str, timeout_seconds: float) -> str:
        started.set()
        release.wait()
        finished.set()
        return VALID_GUIDE

    monkeypatch.setattr(guide, "_request_guide", slow_request)
    request = asyncio.create_task(
        guide.get_guide_with_diagnostics(
            "Recife",
            api_key="test-key",
            timeout_seconds=0.02,
        )
    )
    try:
        assert await asyncio.to_thread(started.wait, 1)
        text, diagnostics = await request
        assert not finished.is_set()
    finally:
        release.set()

    assert await asyncio.to_thread(finished.wait, 1)
    assert "Guia de contingência para Recife" in text
    assert diagnostics == {
        "status": "fallback",
        "modelo": guide.MODEL,
        "fallback_utilizado": True,
        "motivo": "timeout",
    }


@pytest.mark.asyncio
async def test_guide_cancellation_propagates_without_returning_fallback(
    monkeypatch,
) -> None:
    started = threading.Event()
    release = threading.Event()
    finished = threading.Event()

    def slow_request(destination: str, api_key: str, timeout_seconds: float) -> str:
        started.set()
        release.wait()
        finished.set()
        return VALID_GUIDE

    monkeypatch.setattr(guide, "_request_guide", slow_request)
    request = asyncio.create_task(
        guide.get_guide_with_diagnostics(
            "Recife",
            api_key="test-key",
            timeout_seconds=2,
        )
    )
    try:
        assert await asyncio.to_thread(started.wait, 1)
        request.cancel()
        with pytest.raises(asyncio.CancelledError):
            await request
        assert not finished.is_set()
    finally:
        release.set()

    assert await asyncio.to_thread(finished.wait, 1)


@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("failure", "reason"),
    [
        (httpx.ConnectError("network unavailable"), "falha_rede"),
        (ValueError("resposta_inadequada"), "resposta_inadequada"),
    ],
)
async def test_guide_provider_failures_keep_existing_diagnostics(
    monkeypatch,
    failure: Exception,
    reason: str,
) -> None:
    def failed_request(destination: str, api_key: str, timeout_seconds: float) -> str:
        raise failure

    monkeypatch.setattr(guide, "_request_guide", failed_request)
    text, diagnostics = await guide.get_guide_with_diagnostics(
        "Recife",
        api_key="test-key",
        timeout_seconds=1,
    )

    assert "Guia de contingência para Recife" in text
    assert diagnostics["status"] == "fallback"
    assert diagnostics["fallback_utilizado"] is True
    assert diagnostics["motivo"] == reason


@pytest.mark.asyncio
async def test_guide_missing_key_keeps_existing_fallback_and_diagnostic(
    monkeypatch,
) -> None:
    def unexpected_request(destination: str, api_key: str, timeout_seconds: float) -> str:
        raise AssertionError("Gemini must not be called without an API key")

    monkeypatch.setattr(guide, "_request_guide", unexpected_request)
    text, diagnostics = await guide.get_guide_with_diagnostics(
        "Recife",
        api_key=" ",
        timeout_seconds=1,
    )

    assert "Guia de contingência para Recife" in text
    assert diagnostics == {
        "status": "fallback",
        "modelo": guide.MODEL,
        "fallback_utilizado": True,
        "motivo": "chave_ausente",
    }
