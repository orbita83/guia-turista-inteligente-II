import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vite-plus/test';

import {
  available,
  errorTelemetryFixture,
  hiddenTelemetryFixture,
  loadingTelemetryFixture,
  settledTelemetryFixture,
  telemetrySnapshotFixture,
  unavailable,
} from '../test/telemetryFixtures';
import { TelemetriaCard } from './TelemetriaCard';

const renderPanel = (state = settledTelemetryFixture()) =>
  render(<TelemetriaCard state={state} onCopyRequestId={vi.fn(async () => true)} />);

describe('TelemetriaCard timing states', () => {
  it('renders nothing while telemetry is hidden', () => {
    const { container } = renderPanel(hiddenTelemetryFixture());
    expect(container).toBeEmptyDOMElement();
  });

  it('announces measurement during the first attempt', () => {
    renderPanel(loadingTelemetryFixture());
    expect(screen.getByRole('status')).toHaveTextContent('Medindo o tempo do planejamento');
    expect(screen.getByRole('region', { name: 'Telemetria e desempenho' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
  });

  it('separates total and API duration without inventing internal metrics', () => {
    renderPanel();
    expect(screen.getByText('Tempo total').nextElementSibling).toHaveTextContent('620 ms');
    expect(screen.getByText('Tempo da API').nextElementSibling).toHaveTextContent('480 ms');
    expect(screen.getByText('Processamento interno').nextElementSibling).toHaveTextContent(
      'Indisponível',
    );
    expect(screen.getByText('Rede externa').nextElementSibling).toHaveTextContent('Indisponível');
  });

  it('identifies exactly which measured value crossed the demonstration threshold', () => {
    renderPanel(
      settledTelemetryFixture(
        telemetrySnapshotFixture({ totalTimeMs: available(1_240), apiTimeMs: available(1_100) }),
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Tempo total e Tempo da API');
    expect(screen.getByRole('status')).toHaveTextContent('referência de demonstração');
  });

  it('renders missing measurements as unavailable', () => {
    renderPanel(
      settledTelemetryFixture(telemetrySnapshotFixture({ apiTimeMs: unavailable('missing') })),
    );
    expect(screen.getByText('Tempo da API').nextElementSibling).toHaveTextContent('Indisponível');
  });

  it('keeps the previous snapshot visible and labelled during retry and failure', () => {
    const previous = telemetrySnapshotFixture();
    const { rerender } = render(
      <TelemetriaCard
        state={loadingTelemetryFixture({ attemptId: 2, previous })}
        onCopyRequestId={vi.fn(async () => true)}
      />,
    );
    expect(screen.getByText(/dados da tentativa anterior/i)).toBeInTheDocument();

    rerender(
      <TelemetriaCard
        state={errorTelemetryFixture({ attemptId: 2, previous })}
        onCopyRequestId={vi.fn(async () => true)}
      />,
    );
    expect(screen.getByText(/não foi possível medir a nova tentativa/i)).toBeInTheDocument();
    expect(screen.getByText('Tempo total').nextElementSibling).toHaveTextContent('620 ms');
  });
});

describe('TelemetriaCard provider diagnostics', () => {
  it('lists all providers with a textual state and an honest summary', () => {
    renderPanel();
    expect(screen.getByText('3 de 4 provedores com dados confirmados')).toBeInTheDocument();
    for (const name of ['Open-Meteo', 'OSRM', 'Open-Elevation', 'Gemini']) {
      expect(screen.getByText(name)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Tempo do provedor: Indisponível')).toHaveLength(4);
  });

  it('renders degraded and unknown as explicit text rather than color alone', () => {
    const snapshot = telemetrySnapshotFixture({
      providers: [
        { provider: 'open-meteo', state: 'available', durationMs: unavailable() },
        { provider: 'osrm', state: 'available', durationMs: unavailable() },
        { provider: 'open-elevation', state: 'unknown', durationMs: unavailable() },
        {
          provider: 'gemini',
          state: 'degraded',
          durationMs: unavailable(),
          reason: 'fallback',
        },
      ],
    });
    renderPanel(settledTelemetryFixture(snapshot));
    expect(screen.getByText('Degradado')).toBeInTheDocument();
    expect(screen.getByText('Desconhecido')).toBeInTheDocument();
  });

  it('describes service availability as limited to the last request', () => {
    renderPanel();
    expect(screen.getByText('Disponível na última solicitação')).toBeInTheDocument();
    expect(screen.queryByText(/^online$/i)).not.toBeInTheDocument();
  });
});

describe('TelemetriaCard session, connectivity and correlation', () => {
  it('shows a safe session summary and unavailable operational metrics', () => {
    renderPanel();
    expect(screen.getByText('Pessoa visitante')).toBeInTheDocument();
    expect(screen.getByText('Temporária (visitante)')).toBeInTheDocument();
    expect(screen.getByText('Meus roteiros').nextElementSibling).toHaveTextContent('2');
    expect(screen.getByText('Conectividade do navegador').nextElementSibling).toHaveTextContent(
      'Online (indício do navegador)',
    );
    expect(screen.getByText('Qualidade da conexão').nextElementSibling).toHaveTextContent(
      'Indisponível',
    );
    expect(screen.getByText('Uptime do backend').nextElementSibling).toHaveTextContent(
      'Indisponível',
    );
  });

  it('masks the request ID and copies only after an explicit action', async () => {
    const user = userEvent.setup();
    const copy = vi.fn(async () => true);
    const fullId = 'abcd1234-5678-90ef-abcd-123456789ef0';
    render(<TelemetriaCard state={settledTelemetryFixture()} onCopyRequestId={copy} />);

    expect(screen.getByText('abcd1234…9ef0')).toBeInTheDocument();
    expect(screen.queryByText(fullId)).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar identificador de correlação' }));
    expect(copy).toHaveBeenCalledWith(fullId);
    expect(screen.getByRole('status')).toHaveTextContent('Identificador copiado');
  });

  it('announces a clipboard failure without removing the masked ID', async () => {
    const user = userEvent.setup();
    render(
      <TelemetriaCard
        state={settledTelemetryFixture()}
        onCopyRequestId={vi.fn(async () => false)}
      />,
    );
    await user.click(screen.getByRole('button', { name: 'Copiar identificador de correlação' }));
    expect(screen.getByRole('status')).toHaveTextContent('Não foi possível copiar');
    expect(screen.getByText('abcd1234…9ef0')).toBeInTheDocument();
  });
});
