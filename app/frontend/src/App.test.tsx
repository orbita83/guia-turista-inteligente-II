import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({ usuario: null, google_client_id: 'client-id', ufs: ['PE', 'BA'] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } },
          ),
      ),
    );
  });

  afterEach(() => vi.unstubAllGlobals());

  it('identifica a aplicação e apresenta a entrada de visitante', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: '🇧🇷 Guia do Turista Brasil' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '👤 Entrar como Visitante' }),
    ).toBeInTheDocument();
  });

  it('integra o painel após o planejamento e o remove antes do logout', async () => {
    const user = userEvent.setup();
    let loggedIn = true;
    const usuario = {
      id: 'user-1',
      nome: 'Pessoa Teste',
      email: 'person@example.invalid',
      foto: '',
      tipo: 'visitante',
    };
    const viagem = {
      id: 'trip-1',
      origem: 'Recife - PE',
      destino: 'Olinda - PE',
      clima: { temperatura: '28 °C', umidade: '70%', vento: '12 km/h' },
      percurso: { distancia: '8 km', tempo: '20 min' },
      dicas_destino: 'Centro histórico',
      diagnostico_ia: { status: 'fallback', fallback_utilizado: true },
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
        const url =
          typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
        if (url.endsWith('/auth/session')) {
          return Response.json({
            usuario: loggedIn ? usuario : null,
            google_client_id: '',
            ufs: ['PE'],
          });
        }
        if (url.endsWith('/roteiros/minhas-viagens')) {
          return Response.json({ viagens: [] });
        }
        if (url.endsWith('/roteiros/planejar')) {
          return Response.json(
            { viagem },
            { headers: { 'X-Process-Time': '420ms', 'X-Request-ID': 'request-1234567890' } },
          );
        }
        if (url.endsWith('/auth/logout') && init?.method === 'POST') {
          loggedIn = false;
          return new Response(null, { status: 204 });
        }
        return Response.json({ detail: 'Not found' }, { status: 404 });
      }),
    );

    render(<App />);
    await screen.findByRole('heading', { name: '🚗 Planejar Novo Roteiro' });
    expect(
      screen.queryByRole('region', { name: 'Telemetria e desempenho' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('complementary', { name: 'Telemetria' })).not.toBeInTheDocument();
    expect(document.querySelector('.planning-layout')).not.toHaveClass(
      'planning-layout-with-telemetry',
    );

    await user.type(screen.getByLabelText('Origem:'), 'Recife');
    await user.selectOptions(screen.getByLabelText('UF de origem'), 'PE');
    await user.type(screen.getByLabelText('Destino:'), 'Olinda');
    await user.selectOptions(screen.getByLabelText('UF de destino'), 'PE');
    await user.click(screen.getByRole('button', { name: 'Gerar Guia com APIs & IA (Python)' }));

    expect(
      await screen.findByRole('region', { name: 'Telemetria e desempenho' }),
    ).toBeInTheDocument();
    const planner = screen.getByRole('region', { name: 'Planejamento da viagem' });
    const telemetryAside = screen.getByRole('complementary', { name: 'Telemetria' });
    const planningLayout = document.querySelector('.planning-layout');
    expect(planningLayout).toHaveClass('planning-layout-with-telemetry');
    expect(planningLayout?.firstElementChild).toBe(planner);
    expect(planningLayout?.lastElementChild).toBe(telemetryAside);
    expect(await screen.findByText('Sessão e conexão')).toBeInTheDocument();
    expect(screen.getByText('Degradado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Sair ➜' }));
    expect(
      await screen.findByRole('button', { name: '👤 Entrar como Visitante' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Telemetria e desempenho' }),
    ).not.toBeInTheDocument();
  });
});
