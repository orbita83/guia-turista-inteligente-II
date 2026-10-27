import asyncio

import time

from typing import Any

import httpx

from fastapi import APIRouter, Depends, HTTPException, Request, status

from starlette.concurrency import run_in_threadpool

from app.core.config import get_settings

from app.core.dependencies import get_current_user, get_http_client, get_storage

from app.schemas.trips import TripCreateRequest, TripCreateResponse, TripListResponse

from app.services.trips import delete_trip, list_trips, plan_trip

router = APIRouter(prefix='/api/v1/roteiros', tags=['roteiros'])

_locks_guard = asyncio.Lock()

_active_requests = set()

_recent_requests = {}

WARNING_TIMEOUT = (

'O servico Gemini excedeu o tempo limite da requisi%º%úo. '

'Um guia de contingencia foi gerado.'

)

