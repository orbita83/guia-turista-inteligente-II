import { API_BASE_URL } from '../config';
import type { RoteiroFormData, Usuario, Viagem } from '../types/domain';

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

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  headers.set('Accept', 'application/json');
  if (init?.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...init,
    credentials: 'include',
    headers,
  });

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

export function criarViagem(data: RoteiroFormData): Promise<PlanTripResponse> {
  return request('/roteiros/planejar', {
    method: 'POST',
    body: JSON.stringify(data),
  });
}

export function excluirViagem(tripId: string): Promise<void> {
  return request(`/roteiros/${encodeURIComponent(tripId)}`, { method: 'DELETE' });
}

export const API_TRIPS_URL = `${API_BASE_URL}/roteiros/minhas-viagens/json`;
