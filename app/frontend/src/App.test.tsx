import { render, screen } from '@testing-library/react';
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
});
