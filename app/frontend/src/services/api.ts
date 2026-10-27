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

export class ApiContractError extends Error {
  constructor(message = 'A API retornou dados de viagem inválidos.') {
    super(message);
    this.name = 'ApiContractError';
  }
}

const UNAVAILABLE = 'Aguardando dados';

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function availableText(value: unknown, fallback = UNAVAILABLE): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized && normalized.toUpperCase() !== 'N/D' ? normalized : fallback;
}

export function parseTrip(value: unknown): Viagem | null {
  const trip = recordValue(value);
  if (!trip) return null;
  const id = availableText(trip.id, '');
  if (!id) return null;
  const weather = recordValue(trip.clima);
  const route = recordValue(trip.percurso);
  const diagnostics = recordValue(trip.diagnostico_ia);
  const createdAt = availableText(trip.criado_em, '');

  return {
    id,
    ...(createdAt ? { criado_em: createdAt } : {}),
    origem: availableText(trip.origem),
    destino: availableText(trip.destino),
    clima: {
      temperatura: availableText(weather?.temperatura),
      umidade: availableText(weather?.umidade),
      vento: availableText(weather?.vento),
    },
    percurso: {
      distancia: availableText(route?.distancia),
      tempo: availableText(route?.tempo),
    },
    dicas_destino: availableText(trip.dicas_destino, ''),
    ...(diagnostics ? { diagnostico_ia: diagnostics } : {}),
  };
}

function parseTripsResponse(value: unknown): TripsResponse {
  const payload = recordValue(value);
  if (!payload || !Array.isArray(payload.viagens)) throw new ApiContractError();
  return {
    viagens: payload.viagens.map(parseTrip).filter((trip): trip is Viagem => trip !== null),
  };
}

function parsePlanTripResponse(value: unknown): Omit<PlanTripResponse, 'metadata'> {
  const payload = recordValue(value);
  const viagem = parseTrip(payload?.viagem);
  if (!payload || !viagem) throw new ApiContractError();
  return {
    viagem,
    aviso: typeof payload.aviso === 'string' || payload.aviso === null ? payload.aviso : null,
  };
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
  return request<unknown>('/roteiros/minhas-viagens', { signal }).then(parseTripsResponse);
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
  const payload = parsePlanTripResponse(await parseResponse<unknown>(response));
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
