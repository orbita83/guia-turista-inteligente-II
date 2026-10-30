import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vite-plus/test';

import type { PlanTripResponse } from '../services/api';
import { SAVED_GOOGLE_USER_KEY } from '../services/savedGoogleUser';
import { available, unavailable } from '../test/telemetryFixtures';
import { useApp } from './useApp';

const api = vi.hoisted(() => ({
  carregarSessao: vi.fn(),
  listarViagens: vi.fn(),
  criarViagem: vi.fn(),
  autenticarComGoogle: vi.fn(),
  restaurarGoogle: vi.fn(),
  entrarComoVisitante: vi.fn(),
  encerrarSessao: vi.fn(),
  excluirViagem: vi.fn(),
  verificarSaudeApi: vi.fn(),
  obterTelemetriaOperacional: vi.fn(),
  atualizarVisitaAtrativo: vi.fn(),
}));

vi.mock('../services/api', async (importOriginal) => {
  const original = await importOriginal<typeof import('../services/api')>();
  return { ...original, ...api };
});

const usuario = {
  id: 'user-1',
  nome: 'Pessoa Teste',
  email: 'person@example.invalid',
  foto: '',
  tipo: 'visitante' as const,
};

const viagem = {
  id: 'trip-1',
  origem: 'Recife - PE',
  destino: 'Olinda - PE',
  clima: { temperatura: '28 °C', umidade: '70%', vento: '12 km/h' },
  percurso: { distancia: '8 km', tempo: '20 min' },
  dicas_destino: 'Centro histórico',
};

const form = {
  origem_cidade: 'Recife',
  origem_uf: 'PE',
  destino_cidade: 'Olinda',
  destino_uf: 'PE',
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function response(totalTimeMs: number): PlanTripResponse {
  return {
    viagem,
    metadata: {
      apiTimeMs: available(400),
      totalTimeMs: available(totalTimeMs),
      requestId: unavailable('missing'),
    },
  };
}

describe('useApp telemetry lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.carregarSessao.mockResolvedValue({ usuario, google_client_id: '', ufs: ['PE'] });
    api.listarViagens.mockResolvedValue({ viagens: [] });
    api.verificarSaudeApi.mockResolvedValue(true);
    api.obterTelemetriaOperacional.mockResolvedValue({ uptimeSeconds: 2, totalPersistedTrips: 0 });
  });

  it('mantém os dados operacionais vindos da sessão se a consulta adicional falhar', async () => {
    api.carregarSessao.mockResolvedValue({
      usuario,
      google_client_id: '',
      ufs: ['PE'],
      operationalTelemetry: { uptimeSeconds: 120, totalPersistedTrips: 7 },
    });
    api.obterTelemetriaOperacional.mockRejectedValueOnce(
      new Error('Telemetria operacional: HTTP 404'),
    );
    const { result } = renderHook(() => useApp());
    await waitFor(() =>
      expect(result.current.operationalTelemetry).toEqual({
        uptimeSeconds: 120,
        totalPersistedTrips: 7,
      }),
    );
    await waitFor(() => expect(result.current.operationalError).toContain('HTTP 404'));
    expect(result.current.apiHealthStatus).toBe('online');
  });

  it('usa o tempo restante da sessão recebido do servidor', async () => {
    api.carregarSessao.mockResolvedValue({
      usuario,
      google_client_id: '',
      ufs: ['PE'],
      visitor_remaining_ms: 5_400_000,
    });
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.sessionTimerLabel).toBe('1h 30min'));
  });

  it('não reutiliza parâmetros de outra viagem ao selecionar histórico', async () => {
    api.criarViagem.mockResolvedValue(response(100));
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    await act(async () => {
      await result.current.submitTrip(form);
    });
    expect(result.current.activeTripForm).toEqual(form);
    const historica = { ...viagem, id: 'trip-antiga' };
    act(() => result.current.selectTrip(historica));
    expect(result.current.activeTripForm).toBeNull();
    act(() => result.current.selectTrip(viagem));
    expect(result.current.activeTripForm).toEqual(form);
  });

  it('recupera parâmetros persistidos ao selecionar uma viagem do histórico', async () => {
    const parametros = { ...form, duracao_dias: 3, perfis: ['cultural' as const] };
    const historical = { ...viagem, parametros };
    api.listarViagens.mockResolvedValue({ viagens: [historical] });
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.data.viagens).toHaveLength(1));
    act(() => result.current.selectTrip(result.current.data.viagens[0]));
    expect(result.current.activeTripForm).toEqual(parametros);
  });

  it('preserva o perfil Google, isola o histórico visitante e restaura pela sessão', async () => {
    const google = { ...usuario, id: 'google-1', nome: 'Maykol Sampaio', tipo: 'google' as const };
    const guest = { ...usuario, id: 'visitor-1' };
    let active: typeof google | typeof guest = google;
    api.carregarSessao.mockImplementation(async () => ({
      usuario: active,
      google_client_id: 'client',
      ufs: ['PE'],
    }));
    api.listarViagens.mockImplementation(async () => ({
      viagens: active.tipo === 'google' ? [viagem] : [],
    }));
    api.autenticarComGoogle.mockImplementation(async () => {
      active = google;
      return { usuario: google };
    });
    api.restaurarGoogle.mockImplementation(async () => {
      active = google;
      return { usuario: google };
    });
    api.entrarComoVisitante.mockImplementation(async () => {
      active = guest;
      return { usuario: guest };
    });

    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.data.viagens).toEqual([viagem]));
    await act(async () => result.current.loginWithGoogle('temporary-credential'));
    await act(async () => result.current.loginAsVisitor());

    expect(result.current.data.usuario?.tipo).toBe('visitante');
    expect(result.current.data.viagens).toEqual([]);
    expect(JSON.parse(localStorage.getItem(SAVED_GOOGLE_USER_KEY) ?? 'null')).toEqual(google);
    expect(result.current.savedGoogleUser).toEqual(google);

    await act(async () => result.current.restoreGoogleUser());
    expect(api.restaurarGoogle).toHaveBeenCalledOnce();
    expect(result.current.data.usuario).toEqual(google);
    expect(result.current.data.viagens).toEqual([viagem]);
    expect(localStorage.getItem(SAVED_GOOGLE_USER_KEY)).toBeNull();
  });

  it('não trata o perfil salvo como autenticação após recarregar a página', async () => {
    const google = { ...usuario, id: 'google-1', tipo: 'google' as const };
    api.restaurarGoogle.mockRejectedValueOnce(new Error('Sessão expirada'));
    localStorage.setItem(SAVED_GOOGLE_USER_KEY, JSON.stringify(google));
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => result.current.restoreGoogleUser());
    expect(api.autenticarComGoogle).not.toHaveBeenCalled();
    expect(api.restaurarGoogle).toHaveBeenCalledOnce();
    expect(result.current.savedGoogleUser).toEqual(google);
  });

  it('mantém a conta Google ativa quando a troca para visitante falha', async () => {
    const google = { ...usuario, id: 'google-1', tipo: 'google' as const };
    api.carregarSessao.mockResolvedValue({
      usuario: google,
      google_client_id: 'client',
      ufs: ['PE'],
    });
    api.entrarComoVisitante.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => result.current.loginAsVisitor());
    expect(result.current.data.usuario).toEqual(google);
    expect(result.current.savedGoogleUser).toBeNull();
    expect(localStorage.getItem(SAVED_GOOGLE_USER_KEY)).toBeNull();
  });

  it('moves from hidden to loading and settled', async () => {
    const pending = deferred<PlanTripResponse>();
    api.criarViagem.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    expect(result.current.telemetryState.kind).toBe('hidden');

    let submission!: Promise<void>;
    act(() => {
      submission = result.current.submitTrip(form);
    });
    expect(result.current.telemetryState.kind).toBe('loading');

    pending.resolve(response(650));
    await act(async () => submission);
    expect(result.current.telemetryState.kind).toBe('settled');
  });

  it('atualiza apenas a sessão autenticada com telemetria SSE', async () => {
    api.criarViagem.mockResolvedValue(response(650));
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    await act(async () => result.current.submitTrip(form));
    const update = {
      stage: 'streaming' as const,
      requestId: available('stream-id'),
      rttMs: unavailable<number>(),
      networkType: unavailable<string>(),
      elapsedStreamMs: available(100),
      session: {
        userId: 'outra-pessoa',
        displayName: 'Outra',
        kind: 'visitante' as const,
        persistence: 'temporaria' as const,
        sessionStartedAt: unavailable<string>(),
        sessionDuration: available(12000),
        userTripCount: 10,
      },
    };
    act(() => result.current.updateStreamSession(update));
    expect(
      result.current.telemetryState.kind === 'settled' &&
        result.current.telemetryState.snapshot.session.userTripCount,
    ).toBe(1);
    act(() =>
      result.current.updateStreamSession({
        ...update,
        session: { ...update.session, userId: usuario.id },
      }),
    );
    if (result.current.telemetryState.kind !== 'settled') throw new Error('Telemetria ausente');
    expect(result.current.telemetryState.snapshot.session.sessionDuration).toEqual(
      available(12000),
    );
    expect(result.current.telemetryState.snapshot.session.userTripCount).toBe(10);
    expect(result.current.telemetryState.snapshot.requestId).toEqual(unavailable('missing'));
  });

  it('ignores an older response after a newer attempt starts', async () => {
    const first = deferred<PlanTripResponse>();
    const second = deferred<PlanTripResponse>();
    api.criarViagem.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let firstSubmission!: Promise<void>;
    let secondSubmission!: Promise<void>;
    act(() => {
      firstSubmission = result.current.submitTrip(form);
      secondSubmission = result.current.submitTrip({ ...form, destino_cidade: 'Igarassu' });
    });
    second.resolve(response(300));
    await act(async () => secondSubmission);
    first.resolve(response(900));
    await act(async () => firstSubmission);

    expect(result.current.telemetryState.kind).toBe('settled');
    if (result.current.telemetryState.kind === 'settled') {
      expect(result.current.telemetryState.snapshot.totalTimeMs).toEqual(available(300));
    }
  });

  it('clears telemetry before logout and prevents an in-flight attempt from returning', async () => {
    const pendingTrip = deferred<PlanTripResponse>();
    const pendingLogout = deferred<void>();
    api.criarViagem.mockReturnValue(pendingTrip.promise);
    api.encerrarSessao.mockReturnValue(pendingLogout.promise);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    let submission!: Promise<void>;
    act(() => {
      submission = result.current.submitTrip(form);
    });
    expect(result.current.telemetryState.kind).toBe('loading');

    let logout!: Promise<void>;
    act(() => {
      logout = result.current.logout();
    });
    expect(result.current.telemetryState.kind).toBe('hidden');

    pendingTrip.resolve(response(700));
    pendingLogout.resolve();
    await act(async () => Promise.all([submission, logout]));
    expect(result.current.telemetryState.kind).toBe('hidden');
  });

  it('clears a completed snapshot before changing to visitor identity', async () => {
    api.criarViagem.mockResolvedValue(response(500));
    const pendingVisitor = deferred<unknown>();
    api.entrarComoVisitante.mockReturnValue(pendingVisitor.promise);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    await act(async () => result.current.submitTrip(form));
    expect(result.current.telemetryState.kind).toBe('settled');

    let visitorLogin!: Promise<void>;
    act(() => {
      visitorLogin = result.current.loginAsVisitor();
    });
    expect(result.current.telemetryState.kind).toBe('hidden');
    pendingVisitor.resolve({ usuario: { ...usuario, id: 'user-2' } });
    await act(async () => visitorLogin);
  });

  it('insere a viagem retornada sem recarregar sessão e remove localmente após exclusão', async () => {
    api.criarViagem.mockResolvedValue(response(500));
    api.listarViagens
      .mockResolvedValueOnce({ viagens: [] })
      .mockResolvedValue({ viagens: [viagem] });
    api.excluirViagem.mockResolvedValue(undefined);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => result.current.submitTrip(form));
    expect(result.current.data.viagens).toEqual([viagem]);
    expect(api.carregarSessao).toHaveBeenCalledTimes(1);

    const listCallsBeforeDelete = api.listarViagens.mock.calls.length;
    await act(async () => result.current.deleteTrip('trip-1'));
    expect(result.current.data.viagens).toEqual([]);
    expect(api.listarViagens).toHaveBeenCalledTimes(listCallsBeforeDelete);
  });

  it('preserva a viagem quando a exclusão falha', async () => {
    api.listarViagens.mockResolvedValue({ viagens: [viagem] });
    api.excluirViagem.mockRejectedValue(new Error('offline'));
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.data.viagens).toEqual([viagem]));

    await act(async () => result.current.deleteTrip('trip-1'));

    expect(result.current.data.viagens).toEqual([viagem]);
    expect(result.current.toasts.at(-1)?.mensagem).toMatch(/Não foi possível excluir/);
  });

  it('ignora uma listagem antiga depois da troca de identidade', async () => {
    const oldTrips = deferred<{ viagens: (typeof viagem)[] }>();
    const userB = { ...usuario, id: 'user-2', nome: 'Outra pessoa' };
    const tripB = { ...viagem, id: 'trip-2', destino: 'Natal - RN' };
    api.carregarSessao
      .mockResolvedValueOnce({ usuario, google_client_id: '', ufs: ['PE'] })
      .mockResolvedValueOnce({ usuario: userB, google_client_id: '', ufs: ['PE'] });
    api.listarViagens
      .mockReturnValueOnce(oldTrips.promise)
      .mockResolvedValueOnce({ viagens: [tripB] });
    api.entrarComoVisitante.mockResolvedValue({ usuario: userB });

    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(api.listarViagens).toHaveBeenCalledTimes(1));

    await act(async () => result.current.loginAsVisitor());
    expect(result.current.data.usuario?.id).toBe('user-2');
    expect(result.current.data.viagens).toEqual([tripB]);

    oldTrips.resolve({ viagens: [viagem] });
    await act(async () => Promise.resolve());
    expect(result.current.data.usuario?.id).toBe('user-2');
    expect(result.current.data.viagens).toEqual([tripB]);
  });
});

describe('useApp GPS suggestions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    api.carregarSessao.mockResolvedValue({ usuario, google_client_id: '', ufs: ['PE'] });
    api.listarViagens.mockResolvedValue({ viagens: [] });
    api.verificarSaudeApi.mockResolvedValue(true);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('busca coordenadas GPS, calcula e disponibiliza 4 sugestões acima de 400 km com toast de sucesso', async () => {
    const mockPosition = {
      coords: {
        latitude: -23.5505,
        longitude: -46.6333,
        accuracy: 10,
      },
    };

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((success) => success(mockPosition)),
      },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    expect(result.current.suggestionStatus).toBe('idle');
    expect(result.current.sugestoes).toEqual([]);

    await act(async () => {
      await result.current.solicitarSugestoesGps();
    });

    expect(result.current.suggestionStatus).toBe('available');
    expect(result.current.sugestoes).toHaveLength(4);
    for (const sugestao of result.current.sugestoes) {
      expect(sugestao.distanciaKm).toBeGreaterThanOrEqual(400);
    }
    expect(result.current.toasts.at(-1)?.mensagem).toMatch(
      /4 destinos recomendados acima de 400 km/,
    );
  });

  it('lida com negação de permissão de geolocalização sem quebrar a aplicação', async () => {
    const mockError = {
      code: 1, // PERMISSION_DENIED
      PERMISSION_DENIED: 1,
      POSITION_UNAVAILABLE: 2,
      TIMEOUT: 3,
      message: 'User denied Geolocation',
    };

    Object.defineProperty(navigator, 'geolocation', {
      value: {
        getCurrentPosition: vi.fn((_success, error) => error(mockError)),
      },
      configurable: true,
      writable: true,
    });

    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.solicitarSugestoesGps();
    });

    expect(result.current.suggestionStatus).toBe('unavailable');
    expect(result.current.sugestoes).toEqual([]);
    expect(result.current.toasts.at(-1)?.mensagem).toMatch(/Permissão de localização negada/);
  });

  it('hidrata histórico do servidor e aplica alterações locais pendentes', async () => {
    localStorage.setItem(
      'guia_turista_visitas_pendentes_user-1',
      JSON.stringify({ 'trip-1': { antigo: false, novo: true } }),
    );
    api.listarViagens.mockResolvedValue({
      viagens: [{ ...viagem, atrativosVisitadosIds: ['antigo', 'servidor'] }],
    });
    const { result } = renderHook(() => useApp());
    await waitFor(() =>
      expect(result.current.visitasPorViagem['trip-1']).toEqual(['servidor', 'novo']),
    );
    expect(result.current.visitPersistenceByTrip['trip-1']).toBe('local');
  });

  it('descarta valores inválidos nas visitas armazenadas sem impedir marcações', async () => {
    localStorage.setItem(
      'guia_turista_visitas_user-1',
      JSON.stringify({ 'trip-1': 7, 'trip-2': ['a', null], 'trip-3': [' b ', 'b'] }),
    );
    api.atualizarVisitaAtrativo.mockResolvedValue(['a']);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    expect(result.current.visitasPorViagem).toEqual({ 'trip-3': ['b'] });
    await act(async () => result.current.toggleVisitaAtrativo('trip-1', 'a'));
    expect(result.current.visitasPorViagem['trip-1']).toEqual(['a']);
  });

  it('descarta resposta de GPS após troca de sessão', async () => {
    let resolvePosition!: PositionCallback;
    Object.defineProperty(navigator, 'geolocation', {
      configurable: true,
      value: {
        getCurrentPosition: vi.fn((success: PositionCallback) => {
          resolvePosition = success;
        }),
      },
    });
    api.entrarComoVisitante.mockResolvedValue({ usuario });
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    let gps!: Promise<void>;
    act(() => {
      gps = result.current.solicitarSugestoesGps();
    });
    await act(async () => result.current.loginAsVisitor());
    await act(async () => {
      resolvePosition({
        coords: { latitude: -23.5505, longitude: -46.6333 },
      } as GeolocationPosition);
      await gps;
    });
    expect(result.current.sugestoes).toEqual([]);
    expect(result.current.suggestionStatus).toBe('idle');
  });

  it('permite alternar visita a atrativo com persistência local otimista e chamada à API', async () => {
    api.atualizarVisitaAtrativo.mockImplementation(
      async (_tripId: string, id: string, visited: boolean) => (visited ? [id] : []),
    );

    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));

    await act(async () => {
      await result.current.toggleVisitaAtrativo('trip-1', 'atrativo-marco-zero');
    });

    expect(result.current.visitasPorViagem['trip-1']).toEqual(['atrativo-marco-zero']);
    expect(result.current.visitPersistenceByTrip['trip-1']).toBe('confirmed');
    expect(api.atualizarVisitaAtrativo).toHaveBeenCalledWith('trip-1', 'atrativo-marco-zero', true);
    expect(localStorage.getItem('guia_turista_visitas_user-1')).toContain('atrativo-marco-zero');

    // Desmarcar visita
    await act(async () => {
      await result.current.toggleVisitaAtrativo('trip-1', 'atrativo-marco-zero');
    });

    expect(result.current.visitasPorViagem['trip-1']).toEqual([]);
    expect(api.atualizarVisitaAtrativo).toHaveBeenCalledWith(
      'trip-1',
      'atrativo-marco-zero',
      false,
    );
  });

  it('identifica persistência apenas local quando o endpoint está indisponível', async () => {
    api.atualizarVisitaAtrativo.mockResolvedValue(null);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    await act(async () => {
      await result.current.toggleVisitaAtrativo('trip-1', 'atrativo-marco-zero');
    });
    expect(result.current.visitasPorViagem['trip-1']).toEqual(['atrativo-marco-zero']);
    expect(result.current.visitPersistenceByTrip['trip-1']).toBe('local');
    expect(result.current.toasts.at(-1)?.mensagem).toMatch(/apenas neste dispositivo/);
  });

  it('sincroniza alterações locais pendentes quando a API se recupera', async () => {
    api.atualizarVisitaAtrativo
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(['atrativo-marco-zero']);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    await act(async () => {
      await result.current.toggleVisitaAtrativo('trip-1', 'atrativo-marco-zero');
    });
    expect(result.current.visitPersistenceByTrip['trip-1']).toBe('local');
    await act(async () => {
      await result.current.retryLocalVisits('trip-1');
    });
    expect(api.atualizarVisitaAtrativo).toHaveBeenCalledTimes(2);
    expect(result.current.visitPersistenceByTrip['trip-1']).toBe('confirmed');
  });

  it('não aceita outra alteração enquanto sincroniza visitas locais', async () => {
    const confirmation = deferred<string[] | null>();
    api.atualizarVisitaAtrativo
      .mockResolvedValueOnce(null)
      .mockReturnValueOnce(confirmation.promise);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    await act(async () => result.current.toggleVisitaAtrativo('trip-1', 'a'));
    let retry!: Promise<void>;
    act(() => {
      retry = result.current.retryLocalVisits('trip-1');
    });
    await act(async () => result.current.toggleVisitaAtrativo('trip-1', 'a'));
    expect(api.atualizarVisitaAtrativo).toHaveBeenCalledTimes(2);
    await act(async () => {
      confirmation.resolve(['a']);
      await retry;
    });
    expect(result.current.visitasPorViagem['trip-1']).toEqual(['a']);
    expect(result.current.visitPersistenceByTrip['trip-1']).toBe('confirmed');
  });

  it('reverte a marcação se a gravação falhar', async () => {
    api.atualizarVisitaAtrativo.mockRejectedValue(new Error('network'));
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    await act(async () => {
      await result.current.toggleVisitaAtrativo('trip-1', 'atrativo-marco-zero');
    });
    expect(result.current.visitasPorViagem['trip-1']).toEqual([]);
    expect(result.current.visitPersistenceByTrip['trip-1']).toBe('error');
    expect(result.current.toasts.at(-1)?.mensagem).toMatch(/Não foi possível salvar/);
  });

  it('não desfaz outra visita confirmada quando uma gravação concorrente falha', async () => {
    const failed = deferred<string[] | null>();
    const confirmed = deferred<string[] | null>();
    api.atualizarVisitaAtrativo.mockImplementation((_tripId: string, attrId: string) =>
      attrId === 'a' ? failed.promise : confirmed.promise,
    );
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.toggleVisitaAtrativo('trip-1', 'a');
      second = result.current.toggleVisitaAtrativo('trip-1', 'b');
    });
    await act(async () => {
      confirmed.resolve(['b']);
      await second;
    });
    await act(async () => {
      failed.reject(new Error('network'));
      await first;
    });
    expect(result.current.visitasPorViagem['trip-1']).toEqual(['b']);
  });

  it('recarrega estado do servidor após confirmações concorrentes fora de ordem', async () => {
    const firstResponse = deferred<string[] | null>();
    const secondResponse = deferred<string[] | null>();
    api.atualizarVisitaAtrativo.mockImplementation((_tripId: string, id: string) =>
      id === 'a' ? firstResponse.promise : secondResponse.promise,
    );
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    api.listarViagens.mockResolvedValue({
      viagens: [{ ...viagem, atrativosVisitadosIds: ['a', 'b'] }],
    });
    let first!: Promise<void>;
    let second!: Promise<void>;
    act(() => {
      first = result.current.toggleVisitaAtrativo('trip-1', 'a');
      second = result.current.toggleVisitaAtrativo('trip-1', 'b');
    });
    await act(async () => {
      secondResponse.resolve(['a', 'b']);
      await second;
    });
    await act(async () => {
      firstResponse.resolve(['a']);
      await first;
    });
    expect(result.current.visitasPorViagem['trip-1']).toEqual(['a', 'b']);
  });

  it('não libera a gravação da nova sessão quando uma requisição antiga termina', async () => {
    const oldRequest = deferred<string[] | null>();
    const newRequest = deferred<string[] | null>();
    const otherUser = { ...usuario, id: 'user-2' };
    api.carregarSessao
      .mockResolvedValueOnce({ usuario, google_client_id: '', ufs: ['PE'] })
      .mockResolvedValueOnce({ usuario: otherUser, google_client_id: '', ufs: ['PE'] });
    api.entrarComoVisitante.mockResolvedValue({ usuario: otherUser });
    api.atualizarVisitaAtrativo
      .mockReturnValueOnce(oldRequest.promise)
      .mockReturnValueOnce(newRequest.promise);
    const { result } = renderHook(() => useApp());
    await waitFor(() => expect(result.current.initialLoading).toBe(false));
    let old!: Promise<void>;
    act(() => {
      old = result.current.toggleVisitaAtrativo('trip-1', 'a');
    });
    await act(async () => result.current.loginAsVisitor());
    let current!: Promise<void>;
    act(() => {
      current = result.current.toggleVisitaAtrativo('trip-1', 'a');
    });
    await act(async () => {
      oldRequest.resolve(['a']);
      await old;
    });
    await act(async () => result.current.toggleVisitaAtrativo('trip-1', 'a'));
    expect(api.atualizarVisitaAtrativo).toHaveBeenCalledTimes(2);
    await act(async () => {
      newRequest.resolve(['a']);
      await current;
    });
    expect(result.current.visitasPorViagem['trip-1']).toEqual(['a']);
  });
});
