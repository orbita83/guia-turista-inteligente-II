import type {
  AvailableValue,
  ConnectivityCondition,
  ProviderDiagnostic,
  RouteSummary,
  ServiceCondition,
  SessionSummary,
  Usuario,
  Viagem,
} from '../types/domain';

export const unavailableValue = <T = never>(
  reason: 'missing' | 'invalid' | 'unsupported' = 'unsupported',
): AvailableValue<T> => ({ available: false, reason });

export function formatDuration(value: AvailableValue<number>): string {
  if (!value.available) return 'Indisponível';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value.value)} ms`;
}

export function latencyAlertLabel(
  totalTimeMs: AvailableValue<number>,
  apiTimeMs: AvailableValue<number>,
): string | null {
  const totalSlow = totalTimeMs.available && totalTimeMs.value > 1_000;
  const apiSlow = apiTimeMs.available && apiTimeMs.value > 1_000;
  if (totalSlow && apiSlow) return 'Tempo total e Tempo da API';
  if (totalSlow) return 'Tempo total';
  if (apiSlow) return 'Tempo da API';
  return null;
}

export function safeRoute(origin: string, destination: string): RouteSummary {
  return {
    origin: origin.trim() || 'Origem',
    destination: destination.trim() || 'Destino',
  };
}

export function defaultProviders(): ProviderDiagnostic[] {
  return (['open-meteo', 'osrm', 'open-elevation', 'gemini'] as const).map((provider) => ({
    provider,
    state: 'unknown',
    durationMs: unavailableValue(),
  }));
}

function hasOperationData(values: string[]): boolean {
  return values.every((value) => {
    const normalized = value.trim().toLocaleLowerCase('pt-BR');
    return normalized !== '' && normalized !== 'n/d' && normalized !== 'indisponível';
  });
}

function geminiDiagnostic(value: unknown): ProviderDiagnostic {
  const unknown: ProviderDiagnostic = {
    provider: 'gemini',
    state: 'unknown',
    durationMs: unavailableValue(),
  };
  if (!value || typeof value !== 'object') return unknown;
  const status = 'status' in value ? value.status : undefined;
  const fallback = 'fallback_utilizado' in value ? value.fallback_utilizado : undefined;
  if (typeof status !== 'string' || typeof fallback !== 'boolean') return unknown;
  if (status === 'sucesso' && fallback === false) {
    return { ...unknown, state: 'available', reason: 'operation-data' };
  }
  if (status === 'fallback') return { ...unknown, state: 'degraded', reason: 'fallback' };
  return unknown;
}

export function providerDiagnostics(viagem: Viagem): ProviderDiagnostic[] {
  const climateAvailable = hasOperationData([
    viagem.clima.temperatura,
    viagem.clima.umidade,
    viagem.clima.vento,
  ]);
  const routeAvailable = hasOperationData([viagem.percurso.distancia, viagem.percurso.tempo]);
  return [
    {
      provider: 'open-meteo',
      state: climateAvailable ? 'available' : 'unknown',
      durationMs: unavailableValue(),
      ...(climateAvailable ? { reason: 'operation-data' as const } : {}),
    },
    {
      provider: 'osrm',
      state: routeAvailable ? 'available' : 'unknown',
      durationMs: unavailableValue(),
      ...(routeAvailable ? { reason: 'operation-data' as const } : {}),
    },
    {
      provider: 'open-elevation',
      state: 'unknown',
      durationMs: unavailableValue(),
    },
    geminiDiagnostic(viagem.diagnostico_ia),
  ];
}

export function sessionSummary(usuario: Usuario, userTripCount: number): SessionSummary {
  return {
    displayName: usuario.nome.trim() || (usuario.tipo === 'google' ? 'Conta Google' : 'Visitante'),
    kind: usuario.tipo,
    persistence: usuario.tipo === 'google' ? 'permanente' : 'temporaria',
    sessionStartedAt: unavailableValue(),
    sessionDuration: unavailableValue(),
    userTripCount: Math.max(0, Math.trunc(userTripCount)),
  };
}

export function serviceCondition(success: boolean): ServiceCondition {
  return {
    state: success ? 'available-last-request' : 'failed-last-request',
    uptime: unavailableValue(),
    activeConnections: unavailableValue(),
    systemTripCount: unavailableValue(),
  };
}

export function unknownConnectivity(): ConnectivityCondition {
  return { state: 'unknown', rtt: unavailableValue(), networkType: unavailableValue() };
}

export function connectivityCondition(
  state: ConnectivityCondition['state'],
): ConnectivityCondition {
  return { state, rtt: unavailableValue(), networkType: unavailableValue() };
}

export function maskRequestId(requestId: string): string {
  const normalized = requestId.trim();
  if (normalized.length <= 12) return normalized;
  return `${normalized.slice(0, 8)}…${normalized.slice(-4)}`;
}

export async function copyRequestId(requestId: string): Promise<boolean> {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(requestId);
    return true;
  } catch {
    return false;
  }
}
