import { useState } from 'react';

import type {
  ConnectivityCondition,
  ProviderName,
  ProviderState,
  ServiceCondition,
  TelemetryPanelState,
  TelemetrySnapshot,
} from '../types/domain';
import {
  formatDuration,
  latencyAlertLabel,
  maskRequestId,
  unavailableValue,
} from '../services/telemetry';

interface TelemetriaCardProps {
  state: TelemetryPanelState;
  onCopyRequestId: (requestId: string) => Promise<boolean>;
  connectivity?: ConnectivityCondition;
}

function TimingMetrics({ snapshot }: { snapshot?: TelemetrySnapshot }) {
  const missing = unavailableValue<number>();
  return (
    <dl className="telemetry-metrics">
      <div className="telemetry-metric telemetry-metric-primary">
        <dt>Tempo total</dt>
        <dd>{formatDuration(snapshot?.totalTimeMs ?? missing)}</dd>
      </div>
      <div className="telemetry-metric telemetry-metric-primary">
        <dt>Tempo da API</dt>
        <dd>{formatDuration(snapshot?.apiTimeMs ?? missing)}</dd>
      </div>
      <div className="telemetry-metric">
        <dt>Processamento interno</dt>
        <dd>Indisponível</dd>
      </div>
      <div className="telemetry-metric">
        <dt>Rede externa</dt>
        <dd>Indisponível</dd>
      </div>
    </dl>
  );
}

const providerNames: Record<ProviderName, string> = {
  'open-meteo': 'Open-Meteo',
  osrm: 'OSRM',
  'open-elevation': 'Open-Elevation',
  gemini: 'Gemini',
};

const providerStates: Record<ProviderState, string> = {
  available: 'Disponível na operação',
  degraded: 'Degradado',
  unavailable: 'Indisponível',
  unknown: 'Desconhecido',
};

function serviceLabel(service: ServiceCondition): string {
  if (service.state === 'available-last-request') return 'Disponível na última solicitação';
  if (service.state === 'failed-last-request') return 'Falhou na última solicitação';
  return 'Desconhecido';
}

function connectivityLabel(connectivity: ConnectivityCondition): string {
  if (connectivity.state === 'online') return 'Online (indício do navegador)';
  if (connectivity.state === 'offline') return 'Offline (indício do navegador)';
  return 'Desconhecida';
}

export function TelemetriaCard({ state, connectivity, onCopyRequestId }: TelemetriaCardProps) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  if (state.kind === 'hidden') return null;

  const snapshot = state.kind === 'settled' ? state.snapshot : state.previous;
  const route = state.kind === 'settled' ? state.snapshot.route : state.route;
  const trigger = snapshot ? latencyAlertLabel(snapshot.totalTimeMs, snapshot.apiTimeMs) : null;
  const hasPrevious = state.kind !== 'settled' && Boolean(state.previous);
  const currentConnectivity = connectivity ?? snapshot?.connectivity;

  const handleCopy = async (requestId: string) => {
    setCopyFeedback(null);
    const copied = await onCopyRequestId(requestId).catch(() => false);
    setCopyFeedback(
      copied ? 'Identificador copiado.' : 'Não foi possível copiar. Selecione o ID mascarado.',
    );
  };

  return (
    <section
      className="card telemetry-panel"
      aria-labelledby="telemetry-title"
      aria-busy={state.kind === 'loading'}
    >
      <header className="telemetry-heading">
        <span className="telemetry-heading-mark" aria-hidden="true">
          ▥
        </span>
        <div>
          <h2 id="telemetry-title">Telemetria e desempenho</h2>
          <p>Leitura da operação mais recente neste navegador.</p>
        </div>
      </header>

      {state.kind === 'loading' ? (
        <p className="telemetry-notice telemetry-notice-loading" role="status">
          <span className="spinner-inline" aria-hidden="true" />
          Medindo o tempo do planejamento
        </p>
      ) : null}

      {state.kind === 'error' ? (
        <p className="telemetry-notice telemetry-notice-error" role="status">
          {snapshot
            ? 'Não foi possível medir a nova tentativa. Mantivemos os dados da tentativa anterior.'
            : 'Não foi possível medir esta tentativa. Nenhum valor foi estimado.'}
        </p>
      ) : null}

      {trigger && state.kind === 'settled' ? (
        <p className="telemetry-notice telemetry-notice-warning" role="status">
          <strong>{trigger}</strong> ultrapassou 1.000 ms, uma referência de demonstração — não um
          SLO.
        </p>
      ) : null}

      {hasPrevious && state.kind === 'loading' ? (
        <p className="telemetry-previous">Exibindo dados da tentativa anterior enquanto medimos.</p>
      ) : null}

      <section className="telemetry-block" aria-labelledby="telemetry-trip-title">
        <div className="telemetry-block-heading">
          <h3 id="telemetry-trip-title">Última viagem</h3>
          <p>
            {route.origin} <span aria-hidden="true">→</span> {route.destination}
          </p>
        </div>
        <TimingMetrics snapshot={snapshot} />
      </section>

      {snapshot ? (
        <section className="telemetry-block" aria-labelledby="telemetry-session-title">
          <div className="telemetry-block-heading">
            <h3 id="telemetry-session-title">Sessão e conexão</h3>
            <p>Dados limitados à identidade ativa.</p>
          </div>
          <dl className="telemetry-details">
            <div>
              <dt>Usuário ativo</dt>
              <dd>{snapshot.session.displayName}</dd>
            </div>
            <div>
              <dt>Persistência</dt>
              <dd>
                {snapshot.session.persistence === 'permanente'
                  ? 'Permanente (conta Google)'
                  : 'Temporária (visitante)'}
              </dd>
            </div>
            <div>
              <dt>Meus roteiros</dt>
              <dd>{snapshot.session.userTripCount}</dd>
            </div>
            <div>
              <dt>Conectividade do navegador</dt>
              <dd>
                {currentConnectivity ? connectivityLabel(currentConnectivity) : 'Desconhecida'}
              </dd>
            </div>
            <div>
              <dt>Qualidade da conexão</dt>
              <dd>Indisponível</dd>
            </div>
            <div>
              <dt>Uptime do backend</dt>
              <dd>Indisponível</dd>
            </div>
          </dl>
          {snapshot.requestId.available ? (
            <div className="telemetry-correlation">
              <div>
                <span>Correlação</span>
                <code>{maskRequestId(snapshot.requestId.value)}</code>
              </div>
              <button
                type="button"
                className="telemetry-copy"
                onClick={() =>
                  void handleCopy(snapshot.requestId.available ? snapshot.requestId.value : '')
                }
              >
                Copiar identificador de correlação
              </button>
            </div>
          ) : (
            <p className="telemetry-correlation-missing">Correlação: Indisponível</p>
          )}
          {copyFeedback ? (
            <p className="telemetry-copy-feedback" role="status">
              {copyFeedback}
            </p>
          ) : null}
        </section>
      ) : null}

      {snapshot ? (
        <section className="telemetry-block" aria-labelledby="telemetry-service-title">
          <div className="telemetry-block-heading">
            <h3 id="telemetry-service-title">Condição do serviço</h3>
            <p>{serviceLabel(snapshot.service)}</p>
          </div>
          <p className="telemetry-provider-summary">
            {
              snapshot.providers.filter(({ state: providerState }) => providerState === 'available')
                .length
            }{' '}
            de {snapshot.providers.length} provedores com dados confirmados
          </p>
          <ul className="telemetry-providers">
            {snapshot.providers.map((provider) => (
              <li key={provider.provider}>
                <div>
                  <strong>{providerNames[provider.provider]}</strong>
                  <span className={`telemetry-state telemetry-state-${provider.state}`}>
                    {providerStates[provider.state]}
                  </span>
                </div>
                <small>Tempo do provedor: Indisponível</small>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </section>
  );
}
