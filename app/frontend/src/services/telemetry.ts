import type {
  AvailableValue,
  ConnectivityCondition,
  ProviderDiagnostic,
  RouteSummary,
  ServiceCondition,
  SessionSummary,
  StreamTelemetryUpdate,
  TelemetrySnapshot,
  Usuario,
  Viagem,
} from '../types/domain';

export const unavailableValue = <T = never>(
  reason: 'missing' | 'invalid' | 'unsupported' = 'unsupported',
): AvailableValue<T> => ({ available: false, reason });

export function formatSessionStartedAt(value: string | null | undefined): AvailableValue<string> {
  if (!value || typeof value !== 'string' || value.trim() === '') {
    return unavailableValue('missing');
  }
  const normalized = value.trim();
  const date = new Date(normalized);
  if (!Number.isNaN(date.getTime())) {
    try {
      const formatted = new Intl.DateTimeFormat('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      }).format(date);
      return { available: true, value: formatted };
    } catch {
      return { available: true, value: normalized };
    }
  }
  return { available: true, value: normalized };
}

export function connectionQualityLabel(connectivity?: ConnectivityCondition): string {
  if (!connectivity || !connectivity.rtt.available) return 'Aguardando dados';
  const rtt = connectivity.rtt.value;
  const formatted = formatDuration(connectivity.rtt);
  let quality = 'Excelente';
  if (rtt > 400) quality = 'Elevada';
  else if (rtt > 150) quality = 'Boa';

  const type = connectivity.networkType.available ? connectivity.networkType.value : '';
  if (type) {
    return `${formatted} (${type} · ${quality})`;
  }
  return `${formatted} (${quality})`;
}

export function formatDuration(value: AvailableValue<number>): string {
  if (!value.available) return 'Indisponível';
  return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(value.value)} ms`;
}

export function formatSessionDuration(value: AvailableValue<number>): string {
  if (!value.available) return 'Aguardando dados';
  const ms = Math.max(0, value.value);
  const totalSeconds = Math.floor(ms / 1000);
  if (totalSeconds < 60) {
    return `${totalSeconds} s`;
  }
  const totalMinutes = Math.floor(totalSeconds / 60);
  const remainingSeconds = totalSeconds % 60;
  if (totalMinutes < 60) {
    return remainingSeconds === 0
      ? `${totalMinutes} min`
      : `${totalMinutes} min ${remainingSeconds} s`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const remainingMinutes = totalMinutes % 60;
  return remainingMinutes === 0 ? `${hours} h` : `${hours} h ${remainingMinutes} min`;
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
  // TODO(backend): substituir durações desconhecidas quando o planejamento retornar métricas por provedor.
  return (['open-meteo', 'osrm', 'open-elevation', 'gemini'] as const).map((provider) => ({
    provider,
    state: 'unknown',
    durationMs: unavailableValue(),
  }));
}

function hasOperationData(values: string[]): boolean {
  return values.every((value) => {
    const normalized = value.trim().toLocaleLowerCase('pt-BR');
    return (
      normalized !== '' &&
      normalized !== 'n/d' &&
      normalized !== 'indisponível' &&
      normalized !== 'aguardando dados'
    );
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
  // TODO(backend): trocar os estados inferidos do resultado por diagnósticos explícitos quando vierem no contrato.
  // TODO(backend): incluir dados reais de Open-Elevation; o payload atual não confirma sua execução.
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

export function sessionSummary(
  usuario: Usuario,
  userTripCount: number,
  timing?: { sessionStartedAt?: string | null; sessionDurationMs?: number | null },
): SessionSummary {
  const startedAt = timing?.sessionStartedAt
    ? formatSessionStartedAt(timing.sessionStartedAt)
    : unavailableValue();
  const duration: AvailableValue<number> =
    timing?.sessionDurationMs !== undefined &&
    timing?.sessionDurationMs !== null &&
    timing.sessionDurationMs >= 0
      ? { available: true, value: timing.sessionDurationMs }
      : unavailableValue();

  return {
    displayName: usuario.nome.trim() || (usuario.tipo === 'google' ? 'Conta Google' : 'Visitante'),
    kind: usuario.tipo,
    persistence: usuario.tipo === 'google' ? 'permanente' : 'temporaria',
    sessionStartedAt: startedAt,
    sessionDuration: duration,
    userTripCount: Math.max(0, Math.trunc(userTripCount)),
  };
}

export function mergeStreamTelemetry(
  snapshot: TelemetrySnapshot,
  update: StreamTelemetryUpdate,
): TelemetrySnapshot {
  const next = { ...snapshot };
  if (update.requestId.available) {
    next.requestId = update.requestId;
  }
  if (update.rttMs.available) {
    next.connectivity = {
      state: 'online',
      rtt: update.rttMs,
      networkType: update.networkType.available
        ? update.networkType
        : next.connectivity.networkType,
    };
  }
  if (update.session) {
    next.session = {
      ...next.session,
      displayName: update.session.displayName || next.session.displayName,
      kind: update.session.kind || next.session.kind,
      persistence: update.session.persistence || next.session.persistence,
      sessionStartedAt: update.session.sessionStartedAt.available
        ? update.session.sessionStartedAt
        : next.session.sessionStartedAt,
      sessionDuration: update.session.sessionDuration.available
        ? update.session.sessionDuration
        : next.session.sessionDuration,
      userTripCount:
        update.session.userTripCount !== undefined
          ? update.session.userTripCount
          : next.session.userTripCount,
    };
  }
  if (update.stage === 'completed') {
    const geminiDiagnosticObj = update.diagnosticoIa;
    next.providers = next.providers.map((p) => {
      if (p.provider === 'gemini') {
        const fallback = geminiDiagnosticObj?.fallback_utilizado === true;
        return {
          ...p,
          state: fallback ? 'degraded' : 'available',
          durationMs: update.elapsedStreamMs.available ? update.elapsedStreamMs : p.durationMs,
          reason: fallback ? 'fallback' : 'operation-data',
        };
      }
      return p;
    });
  }
  return next;
}

export function serviceCondition(success: boolean): ServiceCondition {
  // TODO(backend): ler uptime, conexões ativas e total sistêmico de um contrato operacional.
  // O sucesso desta operação indica apenas disponibilidade na última solicitação.
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
  estimates?: { rtt?: unknown; type?: unknown; effectiveType?: unknown },
): ConnectivityCondition {
  const rtt =
    typeof estimates?.rtt === 'number' && Number.isFinite(estimates.rtt) && estimates.rtt >= 0
      ? { available: true as const, value: estimates.rtt }
      : unavailableValue<number>(estimates?.rtt === undefined ? 'unsupported' : 'invalid');
  const validTypes = ['bluetooth', 'cellular', 'ethernet', 'wifi', 'wimax', 'other'] as const;
  const validEffectiveTypes = ['slow-2g', '2g', '3g', '4g'] as const;
  const type =
    typeof estimates?.type === 'string' &&
    validTypes.includes(estimates.type as (typeof validTypes)[number])
      ? estimates.type
      : undefined;
  const effectiveType =
    typeof estimates?.effectiveType === 'string' &&
    validEffectiveTypes.includes(estimates.effectiveType as (typeof validEffectiveTypes)[number])
      ? estimates.effectiveType
      : undefined;
  const networkType = type
    ? { available: true as const, value: `Tipo: ${type}` }
    : effectiveType
      ? { available: true as const, value: `Efetiva: ${effectiveType}` }
      : unavailableValue<string>();
  return { state, rtt, networkType };
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
