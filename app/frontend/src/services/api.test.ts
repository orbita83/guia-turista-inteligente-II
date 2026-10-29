import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import {
  ApiContractError,
  atualizarVisitaAtrativo,
  criarViagem,
  listarViagens,
  parseTrip,
  verificarSaudeApi,
  obterTelemetriaOperacional,
  carregarSessao,
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

describe('telemetria operacional', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('lê o uptime e a contagem retornados pela API com sessão', async () => {
    const fetchMock = vi.fn(async () =>
      Response.json({ uptime_seconds: 65.2, total_roteiros_persistidos: 3 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    await expect(obterTelemetriaOperacional()).resolves.toEqual({
      uptimeSeconds: 65.2,
      totalPersistedTrips: 3,
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/operacao\/telemetria$/),
      expect.objectContaining({ credentials: 'include' }),
    );
  });

  it('rejeita respostas inválidas em vez de inventar métricas', async () => {
    vi.stubGlobal('fetch', vi.fn(async () =>
      Response.json({ uptime_seconds: -1, total_roteiros_persistidos: '42' }),
    ));
    await expect(obterTelemetriaOperacional()).rejects.toBeInstanceOf(ApiContractError);
  });
});

describe('métricas vindas do bootstrap de sessão', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('interpreta os indicadores da mesma resposta que autentica o usuário', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      usuario: { id: 'visitor-1', nome: 'Visitante', tipo: 'visitante' },
      google_client_id: '',
      ufs: ['PE'],
      telemetria_operacional: { uptime_seconds: 101.25, total_roteiros_persistidos: 0 },
    })));
    const session = await carregarSessao();
    expect(session.operationalTelemetry).toEqual({ uptimeSeconds: 101.25, totalPersistedTrips: 0 });
  });

  it('não inventa métricas quando uma sessão antiga não fornece o contrato', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({
      usuario: { id: 'visitor-1', nome: 'Visitante', tipo: 'visitante' },
      google_client_id: '',
      ufs: ['PE'],
    })));
    expect((await carregarSessao()).operationalTelemetry).toBeUndefined();
  });
});

describe('visitas persistidas', () => {
  afterEach(() => vi.restoreAllMocks());
  it('valida a confirmação e trata 404 como roteiro inexistente', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(
      Response.json({
        roteiro_id: 't',
        atrativo_id: 'a',
        visitado: true,
        atrativos_visitados_ids: ['a', 'b'],
      }),
    );
    await expect(atualizarVisitaAtrativo('t', 'a', true)).resolves.toEqual(['a', 'b']);
    fetchMock.mockResolvedValueOnce(new Response(null, { status: 404 }));
    await expect(atualizarVisitaAtrativo('t', 'a', true)).rejects.toMatchObject({ status: 404 });
    fetchMock.mockResolvedValueOnce(
      Response.json({
        roteiro_id: 'outro',
        atrativo_id: 'a',
        visitado: true,
        atrativos_visitados_ids: [],
      }),
    );
    await expect(atualizarVisitaAtrativo('t', 'a', true)).rejects.toBeInstanceOf(ApiContractError);
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
  it('preserva a origem do catálogo de atrativos retornado pelo backend', () => {
    expect(parseTrip({ ...trip, atrativos: [], atrativos_fonte: 'catalogo_local' })).toMatchObject({
      atrativos: [],
      atrativosFonte: 'catalogo_local',
    });
  });
  it('recupera parâmetros válidos de um roteiro persistido', () => {
    const parametros = {
      ...form,
      duracao_dias: 3,
      perfis: ['cultural'],
      propulsao: 'combustao',
      consumo_km_l: 12,
      capacidade_tanque_l: 50,
    };
    expect(parseTrip({ ...trip, parametros })?.parametros).toEqual(parametros);
    expect(
      parseTrip({ ...trip, parametros: { ...parametros, duracao_dias: -1, perfis: ['inválido'] } })
        ?.parametros,
    ).not.toHaveProperty('duracao_dias');
  });
  it('lê visitas persistidas no formato do backend', () => {
    expect(
      parseTrip({ ...trip, atrativos_visitados_ids: ['poi-1'] })?.atrativosVisitadosIds,
    ).toEqual(['poi-1']);
    expect(parseTrip({ ...trip, atrativos_visitados_ids: [] })?.atrativosVisitadosIds).toEqual([]);
    expect(
      parseTrip({ ...trip, atrativos_visitados_ids: [1] })?.atrativosVisitadosIds,
    ).toBeUndefined();
  });
  it('valida a telemetria do backend por campo', () => {
    const parsed = parseTrip({
      ...trip,
      telemetria: {
        duracoes_etapas_ms: { geocodificacao_origem_ms: 10, clima_ms: -1, guia_ms: '20' },
        provedores: { osrm: 'disponivel', gemini: 'inventado' },
      },
    });
    expect(parsed?.telemetria).toEqual({
      duracoes_etapas_ms: { geocodificacao_origem_ms: 10 },
      provedores: { osrm: 'disponivel' },
    });
  });
  it('normaliza a sensação térmica do backend e preserva o formato antigo', () => {
    expect(parseTrip({ ...trip, clima: { sensacao_termica: ' 29 °C ' } })?.clima.sensacao).toBe(
      '29 °C',
    );
    expect(
      parseTrip({ ...trip, clima: { sensacao_termica: 'N/D', sensacao: '28 °C' } })?.clima.sensacao,
    ).toBe('28 °C');
    expect(parseTrip({ ...trip, clima: { sensacao_termica: 29 } })?.clima.sensacao).toBeUndefined();
  });
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

    await expect(criarViagem(form)).rejects.toMatchObject({
      name: 'ApiError',
      message: 'Roteiro em processamento.',
      status: 409,
    });
  });

  it('preserva erros 422 estruturados por campo', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Response.json(
          {
            detail: [
              { loc: ['body', 'origem_cidade'], msg: 'Cidade inválida', type: 'value_error' },
              { loc: ['body', 'preco_combustivel_l'], msg: 'Preço inválido', type: 'value_error' },
              { loc: ['body', 'segredo'], msg: 'Não expor', type: 'value_error' },
            ],
          },
          { status: 422 },
        ),
      ),
    );
    await expect(criarViagem(form)).rejects.toMatchObject({
      status: 422,
      fieldErrors: { origem_cidade: 'Cidade inválida', preco_combustivel_l: 'Preço inválido' },
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
