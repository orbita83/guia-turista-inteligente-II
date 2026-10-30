"""Relógio virtual: espera externa não pode inflar o processamento local."""

import asyncio
from contextvars import ContextVar
from dataclasses import dataclass
from types import SimpleNamespace
from typing import Any

import pytest

from app.core.circuit_breaker import CircuitBreaker
from app.services import trips


@dataclass
class Clock:
    seconds: float = 0.0

    async def external_wait(self, seconds: float) -> None:
        deadline = self.seconds + seconds
        await asyncio.sleep(0)
        self.seconds = max(self.seconds, deadline)


clock: ContextVar[Clock] = ContextVar("local_processing_test_clock")


@pytest.fixture
def integrations(monkeypatch):
    monkeypatch.setattr(trips, "perf_counter", lambda: clock.get().seconds)
    original_sanitize = trips.sanitize_input

    def sanitize(text, max_length=80):
        clock.get().seconds += 0.001
        return original_sanitize(text, max_length)

    def attractions(*args):
        clock.get().seconds += 0.003
        return [{"nome": "Museu", "categoria": "cultura"}]

    async def geocode(client, city, state, states):
        await clock.get().external_wait(2 if city == "Recife" else 3)
        return (-8.0, -34.0, f"{city} - {state}")

    async def weather(*args):
        await clock.get().external_wait(4)
        return {"temperatura": "20 °C", "umidade": "50%", "vento": "5 km/h"}

    async def route(*args):
        await clock.get().external_wait(5)
        return {"status": "disponivel", "geometria": [[-8, -34], [-9, -35]], "distancia_km": 100}

    async def guide(*args, **kwargs):
        await clock.get().external_wait(float(kwargs["api_key"] or 0))
        return "guia", {"status": "sucesso", "fallback_utilizado": False}

    async def elevation(*args, **kwargs):
        return SimpleNamespace(model_dump=lambda **kwargs: {"sucesso": False})

    def projection(*args, **kwargs):
        clock.get().seconds += 0.007
        return SimpleNamespace(model_dump=lambda **kwargs: {})

    def costs(**kwargs):
        clock.get().seconds += 0.011
        return SimpleNamespace(model_dump=lambda **kwargs: {})

    monkeypatch.setattr(trips, "sanitize_input", sanitize)
    monkeypatch.setattr(trips, "atrativos_por_destino", attractions)
    monkeypatch.setattr(trips, "geocode", geocode)
    monkeypatch.setattr(trips, "get_weather", weather)
    monkeypatch.setattr(trips, "get_route", route)
    monkeypatch.setattr(trips, "get_guide_with_diagnostics", guide)
    monkeypatch.setattr(trips, "obter_perfil_topografico", elevation)
    monkeypatch.setattr(trips, "projetar_paradas_rota", projection)
    monkeypatch.setattr(trips, "calcular_custos_viagem", costs)


async def plan(guide_seconds: str, *, vehicle=False, persist=False) -> dict[str, float]:
    token = clock.set(Clock())
    try:
        form: dict[str, Any] = {
            "origem_cidade": "Recife", "destino_cidade": "Olinda",
        }
        if vehicle:
            form["propulsao"] = "combustao"

        def save(*args):
            # Gravação lenta não pertence à métrica local.
            clock.get().seconds += 10

        trip = await trips.plan_trip(
            form, {"id": "visitor", "tipo": "visitante"},
            client=object(), storage=SimpleNamespace(add_for_user=save), states={},  # type: ignore[arg-type]
            gemini_api_key=guide_seconds, gemini_timeout_seconds=60,
            circuit_breakers={name: CircuitBreaker(name) for name in ("weather", "guide")},
            persist=persist,
        )
        return trip["telemetria"]["duracoes_etapas_ms"]
    finally:
        clock.reset(token)


@pytest.mark.asyncio
async def test_external_waits_do_not_inflate_local_processing(integrations):
    fast = await plan("6")
    slow = await plan("60")
    assert fast["processamento_interno_ms"] == slow["processamento_interno_ms"] == 5
    # Geocoding 2/3s e clima/rota 4/5s executam em paralelo: 3 + 5 + guia.
    assert fast["total_servicos_ms"] == 14005
    assert slow["total_servicos_ms"] == 68005


@pytest.mark.asyncio
async def test_local_thread_calculation_and_costs_are_included_but_not_storage(integrations):
    result = await plan("6", vehicle=True, persist=True)
    assert result["processamento_interno_ms"] == 23  # 5 + 7 autonomia + 11 custos
    assert result["total_servicos_ms"] == 14023


@pytest.mark.asyncio
async def test_concurrent_plans_keep_their_own_accumulators(integrations):
    first, second = await asyncio.gather(plan("60"), plan("6", vehicle=True))
    assert first["processamento_interno_ms"] == 5
    assert second["processamento_interno_ms"] == 23


@pytest.mark.asyncio
async def test_fallback_and_skipped_elevation_keep_local_measurement(integrations, monkeypatch):
    async def unavailable_route(*args):
        return {"status": "indisponivel"}

    async def fallback(*args, **kwargs):
        return "guia local", {"status": "fallback", "fallback_utilizado": True, "motivo": "chave_ausente"}

    async def unexpected_elevation(*args, **kwargs):
        pytest.fail("Altimetria não deve ser chamada sem rota disponível")

    monkeypatch.setattr(trips, "get_route", unavailable_route)
    monkeypatch.setattr(trips, "get_guide_with_diagnostics", fallback)
    monkeypatch.setattr(trips, "obter_perfil_topografico", unexpected_elevation)
    result = await plan("")
    assert result["processamento_interno_ms"] == 5
    assert "altimetria_ms" not in result
