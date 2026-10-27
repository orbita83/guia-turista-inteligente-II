import { useState } from 'react';

import type {
  AvailableValue,
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
  unknown: 'Sem dados',
};

function serviceLabel(service?: ServiceCondition): string {
  if (service?.state === 'available-last-request') return 'Disponível na última solicitação';
  if (service?.state === 'failed-last-request') return 'Falhou na última solicitação';
  return 'Aguardando dados';
}

function connectivityLabel(connectivity?: ConnectivityCondition): string {
  if (connectivity?.state === 'online') return 'Online (indício do navegador)';
  if (connectivity?.state === 'offline') return 'Offline (indício do navegador)';
  return 'Aguardando dados';
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="telemetry-metric">
      <dt>{label}</dt>
      <dd className={tone ? `is-${tone}` : undefined}>{value}</dd>
    </div>
  );
}

export function TelemetriaCard({ state, connectivity, onCopyRequestId }: TelemetriaCardProps) {
  const [copyFeedback, setCopyFeedback] = useState<string | null>(null);
  const snapshot: TelemetrySnapshot | undefined =
    state.kind === 'settled'
      ? state.snapshot
      : state.kind === 'loading' || state.kind === 'error'
        ? state.previous
        : undefined;
  const route =
    state.kind === 'settled'
      ? state.snapshot.route
      : state.kind === 'loading' || state.kind === 'error'
        ? state.route
        : undefined;
  const trigger = snapshot ? latencyAlertLabel(snapshot.totalTimeMs, snapshot.apiTimeMs) : null;
  const currentConnectivity = connectivity ?? snapshot?.connectivity;
  const missing = unavailableValue<number>();
  const displayDuration = (value: AvailableValue<number>) =>
    value.available ? formatDuration(value) : 'Aguardando dados';

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
          📊
        </span>
        <h2 id="telemetry-title">Telemetria &amp; Desempenho</h2>
      </header>

      {state.kind === 'hidden' ? (
        <p className="telemetry-empty" role="status">
          Os dados de desempenho da sua próxima viagem aparecerão aqui após o planejamento.
        </p>
      ) : (
        <>
          {state.kind === 'loading' ? (
            <p className="telemetry-notice telemetry-notice-loading" role="status">
              <span className="spinner-inline" aria-hidden="true" /> Medindo o tempo do planejamento
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
            <div className="telemetry-notice telemetry-notice-warning" role="status">
              <strong>⚠️ Aviso de latência</strong>
              <p>
                {trigger} ultrapassou 1.000 ms, uma referência de demonstração, não um limite de
                serviço.
              </p>
            </div>
          ) : null}
          {state.kind === 'loading' && snapshot ? (
            <p className="telemetry-previous">
              Exibindo dados da tentativa anterior enquanto medimos.
            </p>
          ) : null}

          <section className="telemetry-block" aria-labelledby="telemetry-trip-title">
            <h3 id="telemetry-trip-title">
              ⚡ Última viagem{route ? ` (${route.origin} → ${route.destination})` : ''}
            </h3>
            <dl className="telemetry-metrics">
              <Metric
                label="Tempo total"
                value={displayDuration(snapshot?.totalTimeMs ?? missing)}
                tone="total"
              />
              <Metric label="Geocoding" value="Aguardando dados" />
              <Metric label="APIs + IA Gemini" value="Aguardando dados" />
              <Metric
                label="Servidor local (Tempo da API)"
                value={displayDuration(snapshot?.apiTimeMs ?? missing)}
                tone="server"
              />
            </dl>
            <div className="telemetry-api-detail">
              <strong>Detalhamento por API:</strong>
              {snapshot ? (
                <ul>
                  {snapshot.providers.map((provider) => (
                    <li key={provider.provider}>
                      {providerNames[provider.provider]}:{' '}
                      <span>{providerStates[provider.state]}</span>
                      {' · Tempo: '}
                      {displayDuration(provider.durationMs)}
                    </li>
                  ))}
                </ul>
              ) : (
                <span> Aguardando dados da primeira viagem.</span>
              )}
            </div>
          </section>

          <section className="telemetry-block" aria-labelledby="telemetry-session-title">
            <h3 id="telemetry-session-title">👤 Sessão do usuário &amp; conexão</h3>
            <dl className="telemetry-details">
              <div>
                <dt>Usuário ativo</dt>
                <dd>{snapshot?.session.displayName ?? 'Aguardando dados'}</dd>
              </div>
              <div>
                <dt>Início da sessão</dt>
                <dd>
                  {snapshot?.session.sessionStartedAt.available
                    ? snapshot.session.sessionStartedAt.value
                    : 'Aguardando dados'}
                </dd>
              </div>
              <div>
                <dt>Tempo total da sessão</dt>
                <dd>
                  {snapshot?.session.sessionDuration.available
                    ? formatDuration(snapshot.session.sessionDuration)
                    : 'Aguardando dados'}
                </dd>
              </div>
              <div>
                <dt>Persistência dos dados</dt>
                <dd>
                  {snapshot
                    ? snapshot.session.persistence === 'permanente'
                      ? 'Permanente (conta Google)'
                      : 'Temporária (visitante)'
                    : 'Aguardando dados'}
                </dd>
              </div>
              <div>
                <dt>Meus roteiros</dt>
                <dd>{snapshot?.session.userTripCount ?? 'Aguardando dados'}</dd>
              </div>
              <div>
                <dt>Qualidade da conexão</dt>
                <dd>Aguardando dados</dd>
              </div>
              <div>
                <dt>Conectividade do navegador</dt>
                <dd>{connectivityLabel(currentConnectivity)}</dd>
              </div>
            </dl>
            {snapshot?.requestId.available ? (
              <div className="telemetry-correlation">
                <span>
                  Correlação: <code>{maskRequestId(snapshot.requestId.value)}</code>
                </span>
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
              <p className="telemetry-correlation-missing">Correlação: Aguardando dados</p>
            )}
            {copyFeedback ? (
              <p className="telemetry-copy-feedback" role="status">
                {copyFeedback}
              </p>
            ) : null}
          </section>

          <section className="telemetry-block" aria-label="Condição do serviço">
            <dl className="telemetry-service-grid">
              <Metric
                label="Status da API"
                value={serviceLabel(snapshot?.service)}
                tone={snapshot?.service.state === 'available-last-request' ? 'server' : undefined}
              />
              <Metric label="Uptime backend" value="Aguardando dados" />
              <Metric label="Roteiros totais" value="Aguardando dados" />
            </dl>
            <p className="telemetry-provider-summary">
              Provedores concorrentes:{' '}
              {snapshot
                ? snapshot.providers.map(({ provider }) => providerNames[provider]).join(', ')
                : 'Aguardando dados'}
            </p>
          </section>
        </>
      )}
    </section>
  );
}
