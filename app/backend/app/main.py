import re
from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from time import perf_counter
from typing import Any
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from prometheus_client import (
    CONTENT_TYPE_LATEST,
    CollectorRegistry,
    Counter,
    Gauge,
    Histogram,
    generate_latest,
)
from starlette.middleware.sessions import SessionMiddleware

from app.core.circuit_breaker import CircuitBreaker, CircuitState
from app.core.config import get_settings
from app.core.storage import TripStorage
from app.routers import auth, trips

REQUEST_ID_PATTERN = re.compile(r"[A-Za-z0-9._-]{1,64}")

# Registro próprio: evita métricas duplicadas se o módulo for recarregado (--reload).
METRICS = CollectorRegistry()
HTTP_REQUESTS = Counter(
    "http_requests_total",
    "Total de requisições HTTP.",
    ["method", "path", "status"],
    registry=METRICS,
)
HTTP_LATENCY = Histogram(
    "http_request_duration_seconds",
    "Latência das requisições HTTP em segundos.",
    ["method", "path"],
    registry=METRICS,
)
BREAKER_OPEN = Gauge(
    "circuit_breaker_open",
    "1 quando o circuito está aberto, 0 caso contrário.",
    ["name"],
    registry=METRICS,
)
BREAKER_FALLBACKS = Gauge(
    "circuit_breaker_fallbacks_total",
    "Total de respostas de contingência servidas pelo circuito.",
    ["name"],
    registry=METRICS,
)


def build_circuit_breakers() -> dict[str, CircuitBreaker]:
    """Um disjuntor por integração cujo serviço sinaliza falha real do provedor."""
    return {
        "weather": CircuitBreaker("weather", failure_threshold=3, recovery_timeout=30),
        "guide": CircuitBreaker("guide", failure_threshold=2, recovery_timeout=60),
    }


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    settings.migrate_legacy_trips_file()

    limits = httpx.Limits(
        max_keepalive_connections=5,
        max_connections=10,
    )
    app.state.http_client = httpx.AsyncClient(
        timeout=15.0,
        limits=limits,
    )
    try:
        # O try começa logo após criar o client: se algo abaixo falhar,
        # o pool de conexões ainda é fechado.
        app.state.trip_storage = TripStorage(settings.trips_file)
        app.state.circuit_breakers = build_circuit_breakers()
        yield
    finally:
        await app.state.http_client.aclose()


settings = get_settings()
app = FastAPI(
    title="Guia do Turista Inteligente API",
    version="1.0.0",
    lifespan=lifespan,
)
app.add_middleware(
    SessionMiddleware,
    secret_key=settings.secret_key,
    session_cookie=settings.session_cookie_name,
    same_site=settings.session_cookie_samesite,
    https_only=settings.session_cookie_secure,
    max_age=None,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "DELETE", "OPTIONS"],
    allow_headers=["Content-Type", "X-Request-ID"],
    expose_headers=["X-Process-Time", "X-Request-ID"],
)
app.include_router(auth.router)
app.include_router(trips.router)


def _request_id(request: Request) -> str:
    """Reaproveita o X-Request-ID do cliente só se for seguro; senão gera um novo."""
    received = request.headers.get("X-Request-ID", "").strip()
    if REQUEST_ID_PATTERN.fullmatch(received):
        return received
    return uuid4().hex


def _route_template(request: Request) -> str:
    """Rota declarada (ex.: /api/v1/roteiros/{trip_id}); evita cardinalidade alta."""
    route = request.scope.get("route")
    return str(getattr(route, "path", "não_mapeada"))


@app.middleware("http")
async def request_observability(request: Request, call_next) -> Response:
    started_at = perf_counter()
    request_id = _request_id(request)
    status_code = 500
    try:
        response = await call_next(request)
        status_code = response.status_code
    finally:
        elapsed = perf_counter() - started_at
        if request.url.path != "/metrics":
            path = _route_template(request)
            HTTP_REQUESTS.labels(request.method, path, str(status_code)).inc()
            HTTP_LATENCY.labels(request.method, path).observe(elapsed)
    response.headers["X-Process-Time"] = f"{elapsed * 1000:.3f}ms"
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/healthz", tags=["operação"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", tags=["operação"])
async def readyz() -> dict[str, str]:
    return {"status": "ready"}


@app.get("/circuits", tags=["operação"])
async def circuits(request: Request) -> dict[str, list[dict[str, Any]]]:
    """Estado atual de cada disjuntor de circuito (diagnóstico)."""
    breakers: dict[str, CircuitBreaker] = request.app.state.circuit_breakers
    return {"circuit_breakers": [b.status() for b in breakers.values()]}


@app.get("/metrics", tags=["operação"], include_in_schema=False)
async def metrics(request: Request) -> Response:
    """Métricas no formato Prometheus/OpenMetrics."""
    breakers: dict[str, CircuitBreaker] = request.app.state.circuit_breakers
    for name, breaker in breakers.items():
        BREAKER_OPEN.labels(name).set(1 if breaker.state == CircuitState.OPEN else 0)
        BREAKER_FALLBACKS.labels(name).set(breaker.total_fallbacks)
    return Response(generate_latest(METRICS), media_type=CONTENT_TYPE_LATEST)