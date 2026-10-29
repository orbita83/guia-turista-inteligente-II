import type {
  AvailableValue,
  ConnectivityCondition,
  ProviderDiagnostic,
  RouteSummary,
  ServiceCondition,
  SessionSummary,
  TelemetryPanelState,
  TelemetrySnapshot,
} from '../types/domain';

export const unavailable = <T = never>(
  reason: 'missing' | 'invalid' | 'unsupported' = 'unsupported',
): AvailableValue<T> => ({ available: false, reason });

export const available = <T>(value: T): AvailableValue<T> => ({ available: true, value });

export const routeFixture: RouteSummary = {
  origin: 'Recife - PE',
  destination: 'Olinda - PE',
};

export const providersFixture: ProviderDiagnostic[] = [
  { provider: 'open-meteo', state: 'available', durationMs: unavailable() },
  { provider: 'osrm', state: 'available', durationMs: unavailable() },
  { provider: 'open-elevation', state: 'unknown', durationMs: unavailable() },
  { provider: 'gemini', state: 'available', durationMs: unavailable() },
];

export const sessionFixture: SessionSummary = {
  displayName: 'Pessoa visitante',
  kind: 'visitante',
  persistence: 'temporaria',
  sessionStartedAt: unavailable(),
  sessionDuration: unavailable(),
  userTripCount: 2,
};

export const serviceFixture: ServiceCondition = {
  state: 'available-last-request',
  uptime: unavailable(),
  activeConnections: unavailable(),
  systemTripCount: unavailable(),
};

export const connectivityFixture: ConnectivityCondition = {
  state: 'online',
  rtt: unavailable(),
  networkType: unavailable(),
};

export function telemetrySnapshotFixture(
  overrides: Partial<TelemetrySnapshot> = {},
): TelemetrySnapshot {
  return {
    attemptId: 1,
    sessionIdentityId: 'fixture-user',
    recordedAt: '2026-10-26T12:00:00.000Z',
    route: routeFixture,
    apiTimeMs: available(480),
    totalTimeMs: available(620),
    requestId: available('abcd1234-5678-90ef-abcd-123456789ef0'),
    providers: providersFixture,
    session: sessionFixture,
    service: serviceFixture,
    connectivity: connectivityFixture,
    ...overrides,
  };
}

export const hiddenTelemetryFixture = (): TelemetryPanelState => ({ kind: 'hidden' });

export const loadingTelemetryFixture = (
  overrides: Partial<Extract<TelemetryPanelState, { kind: 'loading' }>> = {},
): TelemetryPanelState => ({ kind: 'loading', attemptId: 1, route: routeFixture, ...overrides });

export const settledTelemetryFixture = (
  snapshot: TelemetrySnapshot = telemetrySnapshotFixture(),
): TelemetryPanelState => ({ kind: 'settled', snapshot });

export const errorTelemetryFixture = (
  overrides: Partial<Extract<TelemetryPanelState, { kind: 'error' }>> = {},
): TelemetryPanelState => ({ kind: 'error', attemptId: 1, route: routeFixture, ...overrides });
