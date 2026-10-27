import { API_BASE_URL } from '../config';
import type {
  AvailableValue,
  PlanningResponseMetadata,
  RoteiroFormData,
  Usuario,
  Viagem,
} from '../types/domain';

export interface SessionResponse {
  usuario: Usuario | null;
  google_client_id: string;
  ufs: string[];
}

export interface TripsResponse {
  viagens: Viagem[];
}

export interface PlanTripResponse {
  viagem: Viagem;
  aviso?: string | null;
  metadata: PlanningResponseMetadata;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

function requestHeaders(init?: RequestInit): Headers {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) headers.set('Content-Type', 'application/json');
  return headers;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    let message = `O servidor respondeu com HTTP ${response.status}.`;
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && 'detail' in payload) {
        const detail = payload.detail;
        message = typeof detail === 'string' ? detail : message;
      }
    } catch {
      // Mantém uma mensagem segura quando não há corpo JSON legível.
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers: requestHeaders(init),
  });
  return parseResponse<T>(response);
}

function unavailable(reason: 'missing' | 'invalid'): AvailableValue<never> {
  return { available: false, reason };
}

export function parseProcessTime(value: string | null): AvailableValue<number> {
  if (value === null || value.trim() === '') return unavailable('missing');
  const normalized = value.trim();
  if (!/^\d+(?:\.\d+)?ms$/.test(normalized)) return unavailable('invalid');
  const milliseconds = Number(normalized.slice(0, -2));
  return Number.isFinite(milliseconds) && milliseconds >= 0
    ? { available: true, value: milliseconds }
    : unavailable('invalid');
}

export function parseRequestId(value: string | null): AvailableValue<string> {
  if (value === null || value.trim() === '') return unavailable('missing');
  const normalized = value.trim();
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  });
  if (normalized.length > 200 || hasControlCharacter) {
    return unavailable('invalid');
  }
  return { available: true, value: normalized };
}

export function carregarSessao(signal?: AbortSignal): Promise<SessionResponse> {
  return request('/auth/session', { signal });
}

export function autenticarComGoogle(credential: string): Promise<{ usuario: Usuario }> {
  return request('/auth/google', {
    method: 'POST',
    body: JSON.stringify({ credential }),
  });
}

export function entrarComoVisitante(): Promise<{ usuario: Usuario }> {
  return request('/auth/visitor', { method: 'POST' });
}

export function encerrarSessao(): Promise<void> {
  return request('/auth/logout', { method: 'POST' });
}

export function listarViagens(signal?: AbortSignal): Promise<TripsResponse> {
  return request('/roteiros/minhas-viagens', { signal });
}

export async function criarViagem(data: RoteiroFormData): Promise<PlanTripResponse> {
  const startedAt = performance.now();
  const init: RequestInit = {
    method: 'POST',
    body: JSON.stringify(data),
  };
  const response = await fetch(`${API_BASE_URL}/roteiros/planejar`, {
    ...init,
    credentials: 'include',
    headers: requestHeaders(init),
  });
  const apiTimeMs = parseProcessTime(response.headers.get('X-Process-Time'));
  const requestId = parseRequestId(response.headers.get('X-Request-ID'));
  const payload = await parseResponse<Omit<PlanTripResponse, 'metadata'>>(response);
  const elapsed = performance.now() - startedAt;
  const totalTimeMs: AvailableValue<number> =
    Number.isFinite(elapsed) && elapsed >= 0
      ? { available: true, value: elapsed }
      : { available: false, reason: 'invalid' };

  return { ...payload, metadata: { apiTimeMs, totalTimeMs, requestId } };
}

export function excluirViagem(tripId: string): Promise<void> {
  return request(`/roteiros/${encodeURIComponent(tripId)}`, { method: 'DELETE' });
}

export const API_TRIPS_URL = `${API_BASE_URL}/roteiros/minhas-viagens/json`;
