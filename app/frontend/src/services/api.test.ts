import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import {
  ApiContractError,
  ApiError,
  criarViagem,
  listarViagens,
  parseTrip,
  verificarSaudeApi,
} from './api';

describe('saúde da API', () => {
  afterEach(() => vi.restoreAllMocks());

  it('confirma ONLINE somente com resposta ok de /healthz', async () => {
    const fetchMock = vi.fn(async () => Response.json({ status: 'ok' }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(verificarSaudeApi()).resolves.toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/healthz$/), expect.any(Object));

    fetchMock.mockResolvedValueOnce(Response.json({ status: 'degraded' }));
    await expect(verificarSaudeApi()).resolves.toBe(false);
  });
});

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

describe('F01 — campos opcionais da viagem', () => {
  const route = {
    id: 'principal',
    titulo: 'Rota principal',
    tipoRotulo: 'Mais rápida',
    descricao: 'Via PE-001',
    resumoDestaque: 'Trajeto principal',
    distanciaKm: 8,
    tempoFormatado: '20 min',
    pedagios: 0,
    autonomiaKm: 300,
    coordenadas: [
      [-8.05, -34.88],
      [-8.02, -34.85],
    ],
    topografia: {
      altitudeMaximaM: 30,
      desnivelSubidaM: 10,
      desnivelDescidaM: 5,
      desnivelLiquidoM: 5,
      cotaMinimaM: 2,
      cotaMaximaM: 30,
      penalizacaoConsumoPct: 1,
    },
    paradas: [],
    custos: {
      combustivelOuEnergia: 5,
      pedagios: 0,
      total: 5,
      passageiros: 1,
      valorPorPassageiro: 5,
    },
  };

  it('preserva dados opcionais válidos no planejamento completo', () => {
    const parsed = parseTrip({
      ...trip,
      clima: { ...trip.clima, sensacao: '29 °C', condicao: 'Chuva', icone: 'rain' },
      percurso: { ...trip.percurso, geometria: route.coordenadas },
      rotas: [route],
      atrativos: [
        {
          id: 'marco-1',
          nome: 'Marco Zero',
          categoria: 'historico',
          descricao: 'Praça histórica',
          linkMaps: 'https://maps.google.com/?q=marco',
          visitado: true,
        },
      ],
      atrativosVisitadosIds: ['marco-1'],
    });
    expect(parsed?.clima).toMatchObject({ sensacao: '29 °C', condicao: 'Chuva', icone: 'rain' });
    expect(parsed?.percurso.geometria).toEqual(route.coordenadas);
    expect(parsed?.rotas?.[0]).toMatchObject(route);
    expect(parsed?.atrativos?.[0]).toMatchObject({ id: 'marco-1', visitado: true });
    expect(parsed?.atrativosVisitadosIds).toEqual(['marco-1']);
  });

  it('mantém viagens antigas e descarta apenas extras inválidos', () => {
    const parsed = parseTrip({
      ...trip,
      clima: { ...trip.clima, sensacao: 30, condicao: 'N/D' },
      percurso: {
        ...trip.percurso,
        geometria: [
          [-8, -34],
          [100, -34],
        ],
      },
      rotas: [
        {
          ...route,
          coordenadas: [
            [-8, -34],
            [Number.NaN, -34],
          ],
        },
      ],
      atrativos: [{ id: 'x', nome: 'Local', categoria: 'inventada', descricao: 'Texto' }],
      atrativosVisitadosIds: ['x', 42],
    });
    expect(parsed).toMatchObject({ id: 'trip-1', origem: 'Recife - PE' });
    expect(parsed?.clima.sensacao).toBeUndefined();
    expect(parsed?.clima.condicao).toBeUndefined();
    expect(parsed?.percurso.geometria).toBeUndefined();
    expect(parsed?.rotas).toEqual([]);
    expect(parsed?.atrativos).toEqual([]);
    expect(parsed?.atrativosVisitadosIds).toBeUndefined();
    expect(parseTrip(trip)?.rotas).toBeUndefined();
  });

  it('valida a ordem e os limites da série de elevação', () => {
    const valid = parseTrip({
      ...trip,
      percurso: {
        ...trip.percurso,
        perfilElevacao: [
          { distanciaKm: 0, altitudeM: 2 },
          { distanciaKm: 8, altitudeM: 20 },
        ],
      },
    });
    expect(valid?.percurso.perfilElevacao).toHaveLength(2);

    const invalid = parseTrip({
      ...trip,
      percurso: {
        ...trip.percurso,
        perfilElevacao: [
          { distanciaKm: 4, altitudeM: 2 },
          { distanciaKm: 3, altitudeM: 20 },
        ],
      },
    });
    expect(invalid?.percurso.perfilElevacao).toBeUndefined();
  });
});

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
