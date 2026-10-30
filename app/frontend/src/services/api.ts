import { API_BASE_URL } from '../config';
import type {
  AvailableValue,
  PlanningResponseMetadata,
  RoteiroFormData,
  Usuario,
  Viagem,
  TelemetriaViagem,
  PerfilViajante,
} from '../types/domain';
import { parseTripOptionalFields } from './tripOptionalFields';

export interface SessionResponse {
  usuario: Usuario | null;
  google_client_id: string;
  ufs: string[];
  session_started_at?: string | null;
  session_duration_ms?: number | null;
  visitor_remaining_ms?: number | null;
  telemetria_operacional?: unknown;
  operationalTelemetry?: OperationalTelemetry;
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
    readonly fieldErrors: Readonly<Record<string, string>> = {},
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const FORM_FIELDS = new Set([
  'origem_cidade',
  'origem_uf',
  'destino_cidade',
  'destino_uf',
  'perfis',
  'consumo_km_l',
  'capacidade_tanque_l',
  'preco_combustivel_l',
  'eficiencia_km_kwh',
  'capacidade_bateria_kwh',
  'preco_energia_kwh',
  'passageiros',
]);

function parseValidationErrors(detail: unknown): Record<string, string> {
  if (!Array.isArray(detail)) return {};
  const errors: Record<string, string> = {};
  for (const value of detail) {
    const issue = recordValue(value);
    if (!issue || !Array.isArray(issue.loc) || typeof issue.msg !== 'string') continue;
    let field: string | undefined;
    for (const entry of issue.loc) {
      if (typeof entry === 'string' && FORM_FIELDS.has(entry)) field = entry;
    }
    if (typeof field === 'string' && !errors[field]) errors[field] = issue.msg;
  }
  return errors;
}

export class ApiContractError extends Error {
  constructor(message = 'A API retornou dados de viagem inválidos.') {
    super(message);
    this.name = 'ApiContractError';
  }
}

const UNAVAILABLE = 'Aguardando dados';

export async function buscarMunicipiosIbge(signal?: AbortSignal): Promise<unknown> {
  const response = await fetch(
    'https://servicodados.ibge.gov.br/api/v1/localidades/municipios?orderBy=nome',
    {
      signal,
      headers: { Accept: 'application/json' },
    },
  );
  if (!response.ok) throw new Error(`O catálogo do IBGE respondeu com HTTP ${response.status}.`);
  return response.json();
}

export interface OperationalTelemetry {
  uptimeSeconds: number;
  totalPersistedTrips: number;
}

export function parseOperationalTelemetry(value: unknown): OperationalTelemetry {
  const fields = recordValue(value);
  const uptime = fields?.uptime_seconds;
  const total = fields?.total_roteiros_persistidos;
  if (
    typeof uptime !== 'number' ||
    !Number.isFinite(uptime) ||
    uptime < 0 ||
    typeof total !== 'number' ||
    !Number.isSafeInteger(total) ||
    total < 0
  ) {
    throw new ApiContractError('Resposta de telemetria operacional inválida.');
  }
  return { uptimeSeconds: uptime, totalPersistedTrips: total };
}

export async function obterTelemetriaOperacional(
  signal?: AbortSignal,
): Promise<OperationalTelemetry> {
  const response = await fetch(`${API_BASE_URL}/operacao/telemetria`, {
    signal,
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  if (!response.ok) throw new Error(`Telemetria operacional: HTTP ${response.status}`);
  return parseOperationalTelemetry(await response.json());
}

/** Verifica apenas a saúde do processo da API; não representa provedores externos. */
export async function verificarSaudeApi(signal?: AbortSignal): Promise<boolean> {
  const healthUrl = `${API_BASE_URL.replace(/\/api\/v1$/, '')}/healthz`;
  const response = await fetch(healthUrl, { signal, headers: { Accept: 'application/json' } });
  if (!response.ok) return false;
  const payload: unknown = await response.json();
  return recordValue(payload)?.status === 'ok';
}

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

function parseTelemetry(value: unknown): TelemetriaViagem | undefined {
  const telemetry = recordValue(value);
  if (!telemetry) return undefined;
  const durations = recordValue(telemetry.duracoes_etapas_ms);
  const providers = recordValue(telemetry.provedores);
  const result: TelemetriaViagem = { duracoes_etapas_ms: {}, provedores: {} };
  for (const key of [
    'geocodificacao_origem_ms',
    'geocodificacao_destino_ms',
    'clima_ms',
    'roteamento_ms',
    'guia_ms',
    'altimetria_ms',
    'total_servicos_ms',
    'processamento_interno_ms',
  ] as const) {
    const duration = durations?.[key];
    if (typeof duration === 'number' && Number.isFinite(duration) && duration >= 0)
      result.duracoes_etapas_ms[key] = duration;
  }
  for (const key of [
    'open_meteo_geocoding',
    'open_meteo_weather',
    'osrm',
    'gemini',
    'open_elevation',
  ] as const) {
    const state = providers?.[key];
    if (
      state === 'disponivel' ||
      state === 'indisponivel' ||
      state === 'nao_consultado' ||
      state === 'nao_integrado'
    )
      result.provedores[key] = state;
  }
  return result;
}

function parseParameters(value: unknown): RoteiroFormData | undefined {
  const params = recordValue(value);
  if (!params) return undefined;
  const origem_cidade = availableText(params.origem_cidade, '');
  const origem_uf = availableText(params.origem_uf, '');
  const destino_cidade = availableText(params.destino_cidade, '');
  const destino_uf = availableText(params.destino_uf, '');
  if (!origem_cidade || !destino_cidade) return undefined;
  const result: RoteiroFormData = { origem_cidade, origem_uf, destino_cidade, destino_uf };
  if (
    typeof params.duracao_dias === 'number' &&
    Number.isInteger(params.duracao_dias) &&
    params.duracao_dias >= 1 &&
    params.duracao_dias <= 5
  )
    result.duracao_dias = params.duracao_dias;
  const validProfiles: PerfilViajante[] = [
    'cultural',
    'gastronomico',
    'ecoturismo-aventura',
    'familia',
    'economico',
  ];
  if (
    Array.isArray(params.perfis) &&
    params.perfis.every((profile) => validProfiles.includes(profile))
  )
    result.perfis = params.perfis;
  if (params.propulsao === 'combustao' || params.propulsao === 'eletrico')
    result.propulsao = params.propulsao;
  if (
    typeof params.passageiros === 'number' &&
    Number.isInteger(params.passageiros) &&
    params.passageiros >= 1 &&
    params.passageiros <= 8
  )
    result.passageiros = params.passageiros;
  for (const key of [
    'consumo_km_l',
    'capacidade_tanque_l',
    'preco_combustivel_l',
    'eficiencia_km_kwh',
    'capacidade_bateria_kwh',
    'preco_energia_kwh',
  ] as const) {
    const number = params[key];
    if (typeof number === 'number' && Number.isFinite(number) && number > 0) result[key] = number;
  }
  return result;
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
  const optionalFields = parseTripOptionalFields(trip);

  const telemetry = parseTelemetry(trip.telemetria);
  const parameters = parseParameters(trip.parametros);
  return {
    id,
    ...(createdAt ? { criado_em: createdAt } : {}),
    origem: availableText(trip.origem),
    destino: availableText(trip.destino),
    clima: {
      temperatura: availableText(weather?.temperatura),
      umidade: availableText(weather?.umidade),
      vento: availableText(weather?.vento),
      ...optionalFields.clima,
    },
    percurso: {
      distancia: availableText(route?.distancia),
      tempo: availableText(route?.tempo),
      ...optionalFields.percurso,
    },
    dicas_destino: availableText(trip.dicas_destino, ''),
    ...(diagnostics ? { diagnostico_ia: diagnostics } : {}),
    ...(telemetry ? { telemetria: telemetry } : {}),
    ...(parameters ? { parametros: parameters } : {}),
    ...(optionalFields.rotas ? { rotas: optionalFields.rotas } : {}),
    ...(optionalFields.atrativos ? { atrativos: optionalFields.atrativos } : {}),
    ...(trip.atrativos_fonte === 'catalogo_local'
      ? { atrativosFonte: 'catalogo_local' as const }
      : {}),
    ...(optionalFields.atrativosVisitadosIds
      ? { atrativosVisitadosIds: optionalFields.atrativosVisitadosIds }
      : {}),
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
    let fieldErrors: Record<string, string> = {};
    try {
      const payload: unknown = await response.json();
      if (payload && typeof payload === 'object' && 'detail' in payload) {
        const detail = payload.detail;
        message = typeof detail === 'string' ? detail : message;
        if (response.status === 422) fieldErrors = parseValidationErrors(detail);
      }
    } catch {
      // Mantém uma mensagem segura quando não há corpo JSON legível.
    }
    throw new ApiError(message, response.status, fieldErrors);
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

export async function carregarSessao(signal?: AbortSignal): Promise<SessionResponse> {
  // A própria sessão já é consultada no bootstrap; aproveita as métricas do mesmo backend.
  const session = await request<SessionResponse>('/auth/session', { signal });
  if (!session.telemetria_operacional) return session;
  try {
    return {
      ...session,
      operationalTelemetry: parseOperationalTelemetry(session.telemetria_operacional),
    };
  } catch {
    // Contrato legado ou inválido: uma consulta independente pode diagnosticar a falha.
    return session;
  }
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

export function restaurarGoogle(): Promise<{ usuario: Usuario }> {
  return request('/auth/restore-google', { method: 'POST' });
}

export function encerrarSessao(): Promise<void> {
  return request('/auth/logout', { method: 'POST' });
}

export function listarViagens(signal?: AbortSignal): Promise<TripsResponse> {
  return request<unknown>('/roteiros/minhas-viagens', { signal }).then(parseTripsResponse);
}

export async function criarViagem(
  data: RoteiroFormData,
  signal?: AbortSignal,
): Promise<PlanTripResponse> {
  const startedAt = performance.now();
  const init: RequestInit = {
    method: 'POST',
    body: JSON.stringify(data),
    signal,
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

export async function baixarGpxViagem(tripId: string, alternative = -1): Promise<void> {
  const response = await fetch(
    `${API_BASE_URL}/roteiros/${encodeURIComponent(tripId)}/exportar/gpx?alternative=${alternative}`,
    { credentials: 'include', headers: { Accept: 'application/gpx+xml' } },
  );
  if (!response.ok) {
    let message = `Não foi possível exportar a viagem (HTTP ${response.status}).`;
    try {
      const payload: unknown = await response.json();
      if (
        payload &&
        typeof payload === 'object' &&
        'detail' in payload &&
        typeof payload.detail === 'string'
      ) {
        message = payload.detail;
      }
    } catch {
      // Mantém mensagem segura se a resposta de erro não for JSON.
    }
    throw new ApiError(message, response.status);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  try {
    link.href = url;
    link.download = `rota-${tripId.replace(/[^a-zA-Z0-9_-]/g, '-')}.gpx`;
    document.body.appendChild(link);
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(url);
  }
}

// TODO(integracao): validar o consumo SSE existente em streamingGuide.ts contra o backend real.

export async function atualizarVisitaAtrativo(
  tripId: string,
  atrativoId: string,
  visitado: boolean,
): Promise<string[] | null> {
  try {
    const response = recordValue(
      await request<unknown>(`/roteiros/${encodeURIComponent(tripId)}/visitas`, {
        method: 'PATCH',
        body: JSON.stringify({ atrativo_id: atrativoId, visitado }),
      }),
    );
    const ids = response?.atrativos_visitados_ids;
    if (
      response?.roteiro_id !== tripId ||
      response?.atrativo_id !== atrativoId ||
      response?.visitado !== visitado ||
      !Array.isArray(ids) ||
      !ids.every((id) => typeof id === 'string' && id.trim().length > 0) ||
      ids.some((id: string) => id.trim() === atrativoId) !== visitado
    ) {
      throw new ApiContractError('A API retornou uma confirmação de visita inválida.');
    }
    return [...new Set(ids.map((id: string) => id.trim()))];
  } catch (error) {
    // Apenas respostas que indicam método não implementado permitem modo local.
    if (error instanceof ApiError && (error.status === 405 || error.status === 501)) {
      return null;
    }
    throw error;
  }
}

export const API_TRIPS_URL = `${API_BASE_URL}/roteiros/minhas-viagens/json`;
