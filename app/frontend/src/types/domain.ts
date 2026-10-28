export type AbaViagem = 'visao-geral' | 'mapa' | 'guia';

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
  sensacao?: string;
  condicao?: string;
  icone?: string;
}

export interface PercursoViagem {
  distancia: string;
  tempo: string;
  geometria?: CoordenadaGPS[];
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
  rotas?: RotaAlternativa[];
  atrativos?: AtrativoTuristico[];
  atrativosVisitadosIds?: string[];
}

export type CategoriaAtrativo =
  | 'historico'
  | 'natureza'
  | 'gastronomia'
  | 'mirante'
  | 'cultura'
  | 'outro';

export interface AtrativoTuristico {
  id: string;
  nome: string;
  categoria: CategoriaAtrativo;
  descricao: string;
  destaque?: string;
  linkMaps?: string;
  visitado?: boolean;
  horario?: string;
  enderecoOuReferencia?: string;
  icone?: string;
}

export type GuiaStreamingStatus = 'idle' | 'streaming' | 'completed' | 'error';

export interface GuiaStreamPayload {
  destino: string;
  dias_estadia?: number;
  estilo_viagem?: string;
  clima_info?: ClimaViagem;
  atrativos?: string[];
  gastronomia?: string[];
}

export type HistoryStatus = 'loading' | 'ready' | 'error' | 'offline';

export type PersistenceStatus = 'pending' | 'unavailable';

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
  | 'economico';

export interface MunicipioOption {
  nome: string;
  uf: string;
}

export interface SugestaoDestino extends MunicipioOption {
  distanciaKm: number;
}

export type SuggestionStatus = 'idle' | 'loading' | 'available' | 'unavailable';

export type CoordenadaGPS = [latitude: number, longitude: number];

export type TipoParada = 'combustivel' | 'recarga';

export interface ParadaEstrategica {
  id: string;
  nome: string;
  km: number;
  tipo: TipoParada;
  nivelBateriaOuTanquePct: number;
  coordenadas: CoordenadaGPS;
  descricao?: string;
}

export interface PerfilTopografico {
  altitudeMaximaM: number;
  desnivelSubidaM: number;
  desnivelDescidaM: number;
  desnivelLiquidoM: number;
  cotaMinimaM: number;
  cotaMaximaM: number;
  rendimentoRealKmL?: number;
  penalizacaoConsumoPct: number;
}

export interface CalculoCustosViagem {
  combustivelOuEnergia: number;
  pedagios: number;
  total: number;
  passageiros: number;
  valorPorPassageiro: number;
}

export interface RotaAlternativa {
  id: 'principal' | 'economica';
  titulo: string;
  tipoRotulo: string;
  descricao: string;
  resumoDestaque: string;
  percentualBrs?: number;
  distanciaBrsKm?: number;
  diferencaTempoMinutos?: number;
  distanciaKm: number;
  tempoFormatado: string;
  pedagios: number;
  autonomiaKm: number;
  topografia: PerfilTopografico;
  paradas: ParadaEstrategica[];
  coordenadas: CoordenadaGPS[];
  custos: CalculoCustosViagem;
}

export interface DadosMapaRota {
  rotas: RotaAlternativa[];
  rotaAtivaId: 'principal' | 'economica';
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
