export type TipoUsuario = 'google' | 'visitante';

export interface Usuario {
  id: string;
  nome: string;
  email: string;
  foto: string;
  tipo: TipoUsuario;
}

export interface ClimaViagem {
  temperatura: string;
  umidade: string;
  vento: string;
}

export interface PercursoViagem {
  distancia: string;
  tempo: string;
}

export interface Viagem {
  id: string;
  criado_em?: string;
  origem: string;
  destino: string;
  clima: ClimaViagem;
  percurso: PercursoViagem;
  dicas_destino: string;
  diagnostico_ia?: Record<string, unknown>;
}

export interface RoteiroFormData {
  origem_cidade: string;
  origem_uf: string;
  destino_cidade: string;
  destino_uf: string;
  duracao_dias?: number;
  perfis?: PerfilViajante[];
  propulsao?: TipoPropulsao;
  consumo_km_l?: number;
  capacidade_tanque_l?: number;
  preco_combustivel_l?: number;
  eficiencia_km_kwh?: number;
  capacidade_bateria_kwh?: number;
  preco_energia_kwh?: number;
}

export type TipoPropulsao = 'combustao' | 'eletrico';

export type PerfilViajante =
  | 'cultural'
  | 'gastronomico'
  | 'ecoturismo-aventura'
  | 'familia'
  | 'romantico-economico';

export interface MunicipioOption {
  nome: string;
  uf: string;
}

export interface SugestaoDestino extends MunicipioOption {
  distanciaKm: number;
}

export type TipoToast = 'erro' | 'error' | 'danger' | 'sucesso' | 'success' | 'info';

export interface ToastMessage {
  id: string;
  mensagem: string;
  tipo?: TipoToast;
  titulo?: string;
}

export type UnavailableReason = 'missing' | 'invalid' | 'unsupported';

export type AvailableValue<T> =
  | { available: true; value: T }
  | { available: false; reason: UnavailableReason };

export interface PlanningResponseMetadata {
  apiTimeMs: AvailableValue<number>;
  totalTimeMs: AvailableValue<number>;
  requestId: AvailableValue<string>;
}

export interface RouteSummary {
  origin: string;
  destination: string;
}

export type ProviderName = 'open-meteo' | 'osrm' | 'open-elevation' | 'gemini';
export type ProviderState = 'available' | 'degraded' | 'unavailable' | 'unknown';

export interface ProviderDiagnostic {
  provider: ProviderName;
  state: ProviderState;
  durationMs: AvailableValue<number>;
  reason?: 'operation-data' | 'fallback' | 'explicit-failure';
}

export interface SessionSummary {
  displayName: string;
  kind: TipoUsuario;
  persistence: 'permanente' | 'temporaria';
  sessionStartedAt: AvailableValue<string>;
  sessionDuration: AvailableValue<number>;
  userTripCount: number;
}

export interface ServiceCondition {
  state: 'available-last-request' | 'failed-last-request' | 'unknown';
  uptime: AvailableValue<number>;
  activeConnections: AvailableValue<number>;
  systemTripCount: AvailableValue<number>;
}

export interface ConnectivityCondition {
  state: 'online' | 'offline' | 'unknown';
  rtt: AvailableValue<number>;
  networkType: AvailableValue<string>;
}

export interface TelemetrySnapshot {
  attemptId: number;
  sessionIdentityId: string;
  recordedAt: string;
  route: RouteSummary;
  apiTimeMs: AvailableValue<number>;
  totalTimeMs: AvailableValue<number>;
  requestId: AvailableValue<string>;
  providers: ProviderDiagnostic[];
  session: SessionSummary;
  service: ServiceCondition;
  connectivity: ConnectivityCondition;
}

export type TelemetryPanelState =
  | { kind: 'hidden' }
  | {
      kind: 'loading';
      attemptId: number;
      route: RouteSummary;
      previous?: TelemetrySnapshot;
    }
  | { kind: 'settled'; snapshot: TelemetrySnapshot }
  | {
      kind: 'error';
      attemptId: number;
      route: RouteSummary;
      previous?: TelemetrySnapshot;
    };
