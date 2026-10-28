import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import { App } from './App';

describe('App', () => {
  beforeEach(() => {
    localStorage.clear();
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

  it('persiste o tema escuro e permite voltar ao claro', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<App />);
    await user.click(screen.getByRole('button', { name: 'Ativar tema escuro' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(localStorage.getItem('guia_turista_theme')).toBe('dark');

    unmount();
    render(<App />);
    await user.click(screen.getByRole('button', { name: 'Ativar tema claro' }));
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');
    expect(localStorage.getItem('guia_turista_theme')).toBe('light');
  });

  afterEach(() => vi.unstubAllGlobals());

  it('identifica a aplicação e apresenta a entrada de visitante', async () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Guia do Turista Brasil' })).toBeInTheDocument();
    expect(
      await screen.findByRole('button', { name: '👤 Entrar como Visitante' }),
    ).toBeInTheDocument();
  });

  it('mostra o painel desde a sessão e atualiza seus dados após planejamento', async () => {
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
        if (url.endsWith('/healthz')) {
          return Response.json({ status: 'ok' });
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
    await screen.findByRole('heading', { name: 'Planejador de Viagens' });
    expect(screen.getByRole('region', { name: 'Telemetria & Desempenho' })).toBeInTheDocument();
    expect(screen.getByText(/dados de desempenho da sua próxima viagem/i)).toBeInTheDocument();
    expect(screen.getByRole('complementary', { name: 'Painéis da viagem' })).toBeInTheDocument();
    expect(document.querySelector('.planning-layout')).toHaveClass('planning-layout-with-sidebar');

    await user.type(screen.getByLabelText('Cidade de origem'), 'Recife');
    await user.selectOptions(screen.getByLabelText('UF de origem'), 'PE');
    await user.type(screen.getByLabelText('Cidade de destino'), 'Olinda');
    await user.selectOptions(screen.getByLabelText('UF de destino'), 'PE');
    await user.click(screen.getByRole('button', { name: /Cultural/i }));
    await user.click(screen.getByRole('button', { name: /Planejar viagem/i }));

    expect(
      await screen.findByRole('region', { name: 'Telemetria & Desempenho' }),
    ).toBeInTheDocument();
    expect(await screen.findByText('ONLINE')).toBeInTheDocument();
    const planner = screen.getByRole('region', { name: 'Planejamento da viagem' });
    const telemetryAside = screen.getByRole('complementary', { name: 'Painéis da viagem' });
    const planningLayout = document.querySelector('.planning-layout');
    expect(planningLayout).toHaveClass('planning-layout-with-sidebar');
    expect(planningLayout?.firstElementChild).toBe(planner);
    expect(planningLayout?.lastElementChild).toBe(telemetryAside);
    expect(telemetryAside.firstElementChild).toHaveClass('telemetry-panel');
    expect(telemetryAside.lastElementChild).toHaveClass('history-panel');
    expect(await screen.findByText(/Sessão do usuário & conexão/)).toBeInTheDocument();
    expect(screen.getByText('Degradado')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Pessoa' }));
    await user.click(screen.getByRole('button', { name: '🚪 Sair do Modo Visitante' }));
    expect(
      await screen.findByRole('button', { name: '👤 Entrar como Visitante' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('region', { name: 'Telemetria e desempenho' }),
    ).not.toBeInTheDocument();
  });
});
