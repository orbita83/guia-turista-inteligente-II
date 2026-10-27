import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { ApiContractError, ApiError, criarViagem, listarViagens } from './api';

const form = {
  origem_cidade: 'Recife',
  origem_uf: 'PE',
  destino_cidade: 'Olinda',
  destino_uf: 'PE',
};

const trip = {
  id: 'trip-1',
  origem: 'Recife - PE',
  destino: 'Olinda - PE',
  clima: { temperatura: '28 °C', umidade: '70%', vento: '12 km/h' },
  percurso: { distancia: '8 km', tempo: '20 min' },
  dicas_destino: 'Centro histórico',
};

describe('criarViagem telemetry metadata', () => {
  afterEach(() => vi.restoreAllMocks());

  it('reads valid operational headers and measures monotonic total time', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(100).mockReturnValueOnce(355.5);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ viagem: trip }), {
            status: 200,
            headers: {
              'Content-Type': 'application/json',
              'X-Process-Time': '245.25ms',
              'X-Request-ID': ' request-abc-123 ',
            },
          }),
      ),
    );

    const result = await criarViagem(form);

    expect(result.metadata.apiTimeMs).toEqual({ available: true, value: 245.25 });
    expect(result.metadata.totalTimeMs).toEqual({ available: true, value: 255.5 });
    expect(result.metadata.requestId).toEqual({ available: true, value: 'request-abc-123' });
  });

  it.each([null, '', '12', '-1ms', 'Infinityms', '12ms extra'])(
    'marks an absent or malformed process time as unavailable: %s',
    async (header) => {
      vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(20);
      vi.stubGlobal(
        'fetch',
        vi.fn(async () => {
          const headers = new Headers({ 'Content-Type': 'application/json' });
          if (header !== null) headers.set('X-Process-Time', header);
          return new Response(JSON.stringify({ viagem: trip }), { status: 200, headers });
        }),
      );

      const result = await criarViagem(form);
      expect(result.metadata.apiTimeMs.available).toBe(false);
    },
  );

  it('preserves the existing HTTP error and status', async () => {
    vi.spyOn(performance, 'now').mockReturnValueOnce(10).mockReturnValueOnce(20);
    vi.stubGlobal(
      'fetch',
      vi.fn(
        async () =>
          new Response(JSON.stringify({ detail: 'Roteiro em processamento.' }), {
            status: 409,
            headers: { 'Content-Type': 'application/json' },
          }),
      ),
    );

    await expect(criarViagem(form)).rejects.toMatchObject<ApiError>({
      name: 'ApiError',
      message: 'Roteiro em processamento.',
      status: 409,
    });
  });
});

describe('histórico na fronteira HTTP', () => {
  afterEach(() => vi.restoreAllMocks());

  it('normaliza campos ausentes sem rejeitar a viagem identificada', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ viagens: [{ id: 'partial', origem: 'Recife - PE' }] })),
    );

    const result = await listarViagens();

    expect(result.viagens).toEqual([
      expect.objectContaining({
        id: 'partial',
        origem: 'Recife - PE',
        destino: 'Aguardando dados',
        clima: expect.objectContaining({ temperatura: 'Aguardando dados' }),
        percurso: { distancia: 'Aguardando dados', tempo: 'Aguardando dados' },
      }),
    ]);
  });

  it('descarta itens sem identificador seguro e preserva os válidos', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ viagens: [{ origem: 'Sem id' }, trip] })),
    );

    await expect(listarViagens()).resolves.toMatchObject({
      viagens: [expect.objectContaining({ id: 'trip-1' })],
    });
  });

  it('rejeita envelope de listagem inválido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ viagens: 'não é lista' })),
    );

    await expect(listarViagens()).rejects.toBeInstanceOf(ApiContractError);
  });
});
