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
  render(
    <TelemetriaCard
      state={state}
      apiHealthStatus="online"
      onCopyRequestId={vi.fn(async () => true)}
    />,
  );

describe('TelemetriaCard', () => {
  it('aparece antes da primeira viagem com uma orientação apropriada', () => {
    renderPanel(hiddenTelemetryFixture());
    expect(screen.getByRole('region', { name: 'Telemetria & Desempenho' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('aparecerão aqui após o planejamento');
    expect(screen.queryByText('Última viagem')).not.toBeInTheDocument();
  });

  it('organiza as métricas e seções como no wireframe sem inventar valores', () => {
    renderPanel();
    expect(screen.getByText('Tempo total').nextElementSibling).toHaveTextContent('620 ms');
    expect(screen.getByText('Geocoding').nextElementSibling).toHaveTextContent('Aguardando dados');
    expect(screen.getByText('APIs + IA Gemini').nextElementSibling).toHaveTextContent(
      'Aguardando dados',
    );
    expect(screen.getByText('Servidor local (Tempo da API)').nextElementSibling).toHaveTextContent(
      '480 ms',
    );
    expect(screen.getByText('Uptime backend').nextElementSibling).toHaveTextContent(
      'Aguardando dados',
    );
    expect(screen.getByText('Roteiros totais').nextElementSibling).toHaveTextContent(
      'Aguardando dados',
    );
    expect(screen.getByText('Status da API').nextElementSibling).toHaveTextContent('ONLINE');
    expect(screen.getByText(/última verificação de \/healthz/)).toBeInTheDocument();
    expect(screen.getByText('Pessoa visitante')).toBeInTheDocument();
    expect(screen.getByText('Temporária (visitante)')).toBeInTheDocument();
    expect(screen.getByText('Conectividade do navegador').nextElementSibling).toHaveTextContent(
      'Online (indício do navegador)',
    );
    expect(screen.getByText(/Provedores concorrentes:/)).toHaveTextContent(
      'Open-Meteo, OSRM, Open-Elevation, Gemini',
    );
  });

  it('usa fallback para medição ausente e não declara provedor desconhecido como disponível', () => {
    const snapshot = telemetrySnapshotFixture({
      apiTimeMs: unavailable('missing'),
      providers: [
        { provider: 'open-meteo', state: 'unknown', durationMs: unavailable() },
        { provider: 'osrm', state: 'degraded', durationMs: unavailable() },
        { provider: 'open-elevation', state: 'unknown', durationMs: unavailable() },
        { provider: 'gemini', state: 'unknown', durationMs: unavailable() },
      ],
    });
    renderPanel(settledTelemetryFixture(snapshot));
    expect(screen.getByText('Servidor local (Tempo da API)').nextElementSibling).toHaveTextContent(
      'Aguardando dados',
    );
    expect(screen.getByText('Degradado').closest('li')).toHaveTextContent('OSRM');
    expect(screen.getAllByText('Sem dados')[0].closest('li')).toHaveTextContent('Open-Meteo');
  });

  it('não declara a API offline quando a verificação não foi confirmada', () => {
    render(
      <TelemetriaCard
        state={settledTelemetryFixture()}
        apiHealthStatus="unavailable"
        onCopyRequestId={vi.fn(async () => true)}
      />,
    );
    expect(screen.getByText('Status da API').nextElementSibling).toHaveTextContent(
      'Sem confirmação',
    );
  });

  it('mantém a medição anterior durante uma nova tentativa e em erro', () => {
    const previous = telemetrySnapshotFixture();
    const { rerender } = render(
      <TelemetriaCard
        state={loadingTelemetryFixture({ attemptId: 2, previous })}
        apiHealthStatus="online"
        onCopyRequestId={vi.fn(async () => true)}
      />,
    );
    expect(screen.getByText(/dados da tentativa anterior/i)).toBeInTheDocument();
    expect(screen.getByRole('region', { name: 'Telemetria & Desempenho' })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    rerender(
      <TelemetriaCard
        state={errorTelemetryFixture({ attemptId: 2, previous })}
        apiHealthStatus="online"
        onCopyRequestId={vi.fn(async () => true)}
      />,
    );
    expect(screen.getByText(/Não foi possível medir a nova tentativa/i)).toBeInTheDocument();
    expect(screen.getByText('Tempo total').nextElementSibling).toHaveTextContent('620 ms');
  });

  it('avisa sobre limiar medido sem atribuir o atraso à rede', () => {
    renderPanel(
      settledTelemetryFixture(
        telemetrySnapshotFixture({ totalTimeMs: available(1240), apiTimeMs: available(1100) }),
      ),
    );
    expect(screen.getByRole('status')).toHaveTextContent('Aviso de latência');
    expect(screen.getByRole('status')).toHaveTextContent('Tempo total e Tempo da API');
    expect(screen.getByRole('status')).not.toHaveTextContent('rede externa');
  });

  it('mascara e copia o identificador apenas por ação explícita', async () => {
    const user = userEvent.setup();
    const copy = vi.fn(async () => true);
    render(
      <TelemetriaCard
        state={settledTelemetryFixture()}
        apiHealthStatus="online"
        onCopyRequestId={copy}
      />,
    );
    expect(screen.getByText('abcd1234…9ef0')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Copiar identificador de correlação' }));
    expect(copy).toHaveBeenCalledWith('abcd1234-5678-90ef-abcd-123456789ef0');
    expect(screen.getByRole('status')).toHaveTextContent('Identificador copiado');
  });
});
