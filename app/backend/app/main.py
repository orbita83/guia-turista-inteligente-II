from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from time import perf_counter
from uuid import uuid4

import httpx
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response
from starlette.middleware.sessions import SessionMiddleware

from app.core.config import get_settings
from app.core.storage import TripStorage
from app.routers import auth, trips
from app.core.circuit_breaker import CircuitBreaker

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
    app.state.trip_storage = TripStorage(settings.trips_file)

    app.state.circuit_breakers = {
        "geocode": CircuitBreaker("geocode"),
        "weather": CircuitBreaker("weather"),
        "route": CircuitBreaker("route"),
    }

    try:
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


@app.middleware("http")
async def request_observability(
    request: Request, call_next
) -> Response:
    started_at = perf_counter()
    request_id = request.headers.get("X-Request-ID", "").strip() or uuid4().hex
    response = await call_next(request)
    elapsed = perf_counter() - started_at
    response.headers["X-Process-Time"] = f"{elapsed * 1000:.3f}ms"
    response.headers["X-Request-ID"] = request_id
    return response


@app.get("/healthz", tags=["operação"])
async def healthz() -> dict[str, str]:
    return {"status": "ok"}


@app.get("/readyz", tags=["operação"])
async def readyz() -> dict[str, str]:
    return {"status": "ready"}


