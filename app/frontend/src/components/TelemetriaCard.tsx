import { useState } from 'react';

import type {
  AvailableValue,
  ConnectivityCondition,
  ProviderName,
  ProviderState,
  TelemetryPanelState,
  TelemetrySnapshot,
} from '../types/domain';
import {
  formatDuration,
  formatSessionDuration,
  latencyAlertLabel,
  maskRequestId,
  unavailableValue,
} from '../services/telemetry';

interface TelemetriaCardProps {
  state: TelemetryPanelState;
  apiHealthStatus: 'checking' | 'online' | 'unavailable';
  operationalTelemetry?: { uptimeSeconds: number; totalPersistedTrips: number } | null;
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

function connectivityLabel(connectivity?: ConnectivityCondition): string {
  if (
    connectivity?.networkType.available &&
    (connectivity.networkType.value === 'SSE ativo' ||
      connectivity.networkType.value === 'SSE concluído')
  ) {
    return `Online (${connectivity.networkType.value})`;
  }
  if (connectivity?.state === 'online') return 'Online (indício do navegador)';
  if (connectivity?.state === 'offline') return 'Offline (indício do navegador)';
  return 'Aguardando dados';
}

function formatUptime(seconds: number): string {
  const whole = Math.floor(seconds);
  const days = Math.floor(whole / 86400);
  const hours = Math.floor((whole % 86400) / 3600);
  const minutes = Math.floor((whole % 3600) / 60);
  const secs = whole % 60;
  return [days ? `${days}d` : '', days || hours ? `${hours}h` : '', `${minutes}min`, `${secs}s`].filter(Boolean).join(' ');
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div className="telemetry-metric">
      <dt>{label}</dt>
      <dd className={tone ? `is-${tone}` : undefined}>{value}</dd>
    </div>
  );
}

export function TelemetriaCard({
  state,
  apiHealthStatus,
  operationalTelemetry,
  connectivity,
  onCopyRequestId,
}: TelemetriaCardProps) {
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
  const sessionData =
    snapshot?.session ??
    (state.kind === 'loading' || state.kind === 'error' ? state.session : undefined);
  const trigger = snapshot ? latencyAlertLabel(snapshot.totalTimeMs, snapshot.apiTimeMs) : null;
  const effectiveConnectivity = connectivity ?? snapshot?.connectivity;
  const currentConnectivity: ConnectivityCondition = {
    state: effectiveConnectivity?.state ?? connectivity?.state ?? 'unknown',
    rtt: effectiveConnectivity?.rtt ?? unavailableValue(),
    networkType: effectiveConnectivity?.networkType ?? unavailableValue(),
  };
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
              {(
                [
                  ['Geocodificação da origem', 'geocodificacao_origem_ms'],
                  ['Geocodificação do destino', 'geocodificacao_destino_ms'],
                  ['Clima', 'clima_ms'],
                  ['Roteamento', 'roteamento_ms'],
                  ['Guia', 'guia_ms'],
                  ['Altimetria', 'altimetria_ms'],
                  ['Total dos serviços', 'total_servicos_ms'],
                ] as const
              ).map(([label, key]) => {
                const duration = snapshot?.etapas?.[key];
                return (
                  <Metric
                    key={key}
                    label={label}
                    value={displayDuration(
                      duration === undefined ? missing : { available: true, value: duration },
                    )}
                  />
                );
              })}
              <Metric
                label="Servidor local (Tempo da API)"
                value={displayDuration(snapshot?.apiTimeMs ?? missing)}
                tone="server"
              />
            </dl>
            <p>
              O tempo total inclui a requisição e a leitura da resposta; não inclui a renderização
              da tela.
            </p>
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
                <dd>{sessionData?.displayName ?? 'Aguardando dados'}</dd>
              </div>
              <div>
                <dt>Início da sessão</dt>
                <dd>
                  {sessionData?.sessionStartedAt.available
                    ? sessionData.sessionStartedAt.value
                    : 'Aguardando dados'}
                </dd>
              </div>
              <div>
                <dt>Tempo total da sessão</dt>
                <dd>
                  {sessionData?.sessionDuration.available
                    ? formatSessionDuration(sessionData.sessionDuration)
                    : 'Aguardando dados'}
                </dd>
              </div>
              <div>
                <dt>Persistência dos dados</dt>
                <dd>
                  {sessionData
                    ? sessionData.persistence === 'permanente'
                      ? 'Permanente (conta Google)'
                      : 'Temporária (visitante)'
                    : 'Aguardando dados'}
                </dd>
              </div>
              <div>
                <dt>Meus roteiros</dt>
                <dd>{sessionData?.userTripCount ?? 'Aguardando dados'}</dd>
              </div>
              <div>
                <dt>Qualidade da conexão</dt>
                <dd>
                  {currentConnectivity?.rtt.available
                    ? `RTT estimado: ${currentConnectivity.rtt.value === 0 ? '≤ 25' : currentConnectivity.rtt.value} ms`
                    : 'Aguardando dados'}
                  {currentConnectivity?.networkType.available
                    ? ` · ${currentConnectivity.networkType.value}`
                    : ''}
                </dd>
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
                value={
                  apiHealthStatus === 'online'
                    ? 'ONLINE'
                    : apiHealthStatus === 'checking'
                      ? 'Verificando…'
                      : 'Sem confirmação'
                }
                tone={apiHealthStatus === 'online' ? 'server' : undefined}
              />
              <Metric label="Uptime backend" value={operationalTelemetry ? formatUptime(operationalTelemetry.uptimeSeconds) : 'Aguardando dados'} />
              <Metric label="Roteiros totais" value={operationalTelemetry ? String(operationalTelemetry.totalPersistedTrips) : 'Aguardando dados'} />
            </dl>
            <p className="telemetry-health-note">
              Status da API: última verificação de /healthz; não é monitoramento contínuo.
            </p>
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
