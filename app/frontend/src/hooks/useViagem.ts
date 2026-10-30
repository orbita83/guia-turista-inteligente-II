import { useCallback, useEffect, useRef, useState } from 'react';

import { UFS_BRASIL } from '../constants/ufs';
import {
  ApiError,
  atualizarVisitaAtrativo,
  carregarSessao,
  criarViagem,
  excluirViagem,
  listarViagens,
  verificarSaudeApi,
  obterTelemetriaOperacional,
  type SessionResponse,
} from '../services/api';
import { obterCoordenadasNavegador, obterSugestoesDestino } from '../services/geolocation';
import {
  copyRequestId,
  providerDiagnostics,
  safeRoute,
  serviceCondition,
  sessionSummary,
} from '../services/telemetry';
import type {
  HistoryStatus,
  PersistenceStatus,
  RoteiroFormData,
  SugestaoDestino,
  SuggestionStatus,
  TelemetryPanelState,
  TelemetrySnapshot,
  Viagem,
  StreamTelemetryUpdate,
} from '../types/domain';
import { useConnectivity } from './useConnectivity';
import { useAuth } from './useAuth';
import { useToasts } from './useToasts';
import { useTripSelection } from './useTripSelection';

interface AppData extends SessionResponse {
  viagens: Viagem[];
}

const EMPTY_DATA: AppData = {
  usuario: null,
  viagens: [],
  ufs: [...UFS_BRASIL],
  google_client_id: '',
};

interface PendingRoute {
  origem: string;
  destino: string;
}

function routeLabel(city: string, state: string): string {
  return state ? `${city} - ${state}` : city;
}

function mergeTripFirst(trips: readonly Viagem[], trip: Viagem): Viagem[] {
  return [trip, ...trips.filter((current) => current.id !== trip.id)];
}

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

function getVisitasStorageKey(userId?: string | null): string {
  return `guia_turista_visitas_${userId || 'anonimo'}`;
}

function readSavedVisitas(userId?: string | null): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(getVisitasStorageKey(userId));
    if (!raw) return {};
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).flatMap(([tripId, ids]) =>
        tripId.trim() &&
        Array.isArray(ids) &&
        ids.every((id) => typeof id === 'string' && id.trim())
          ? [[tripId, [...new Set(ids.map((id: string) => id.trim()))]]]
          : [],
      ),
    );
  } catch {
    return {};
  }
}

function saveVisitas(userId: string | null | undefined, visitas: Record<string, string[]>): void {
  try {
    localStorage.setItem(getVisitasStorageKey(userId), JSON.stringify(visitas));
  } catch {
    // Continua utilizável em memória caso o armazenamento local esteja bloqueado.
  }
}

type PendingVisits = Record<string, Record<string, boolean>>;

function pendingKey(userId: string): string {
  return `guia_turista_visitas_pendentes_${userId}`;
}

function readPendingVisits(userId: string): PendingVisits {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(pendingKey(userId)) ?? '{}');
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    const result: PendingVisits = {};
    for (const [tripId, changes] of Object.entries(parsed)) {
      if (!changes || typeof changes !== 'object' || Array.isArray(changes)) continue;
      const valid = Object.entries(changes).filter(
        ([id, value]) => id.trim() && typeof value === 'boolean',
      );
      if (valid.length) result[tripId] = Object.fromEntries(valid) as Record<string, boolean>;
    }
    return result;
  } catch {
    return {};
  }
}

function savePendingVisits(userId: string | undefined, changes: PendingVisits): void {
  if (!userId) return;
  try {
    localStorage.setItem(pendingKey(userId), JSON.stringify(changes));
  } catch {
    // Mantém as alterações pendentes em memória quando o armazenamento está bloqueado.
  }
}

function applyVisitChanges(ids: string[], changes: Record<string, boolean> = {}): string[] {
  const result = new Set(ids);
  for (const [id, visited] of Object.entries(changes)) {
    if (visited) result.add(id);
    else result.delete(id);
  }
  return [...result];
}

export function useViagem() {
  const connectivity = useConnectivity();
  const networkStatus = connectivity.state;
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [pendingRoute, setPendingRoute] = useState<PendingRoute | null>(null);
  const {
    activeTrip,
    setActiveTrip,
    activeTripForm,
    setActiveTripForm,
    formByTripId,
    selectTrip,
    reset: resetSelectedTrip,
  } = useTripSelection();
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('loading');
  const [historyError, setHistoryError] = useState<string | undefined>();
  const [persistenceById, setPersistenceById] = useState<Record<string, PersistenceStatus>>({});
  const { toasts, addToast, dismissToast } = useToasts();
  const [telemetryState, setTelemetryState] = useState<TelemetryPanelState>({ kind: 'hidden' });
  const [operationalTelemetry, setOperationalTelemetry] = useState<{
    uptimeSeconds: number;
    totalPersistedTrips: number;
  } | null>(null);
  const [operationalError, setOperationalError] = useState<string | null>(null);
  const [apiHealthStatus, setApiHealthStatus] = useState<'checking' | 'online' | 'unavailable'>(
    'checking',
  );
  const [sugestoes, setSugestoes] = useState<SugestaoDestino[]>([]);
  const [suggestionStatus, setSuggestionStatus] = useState<SuggestionStatus>('idle');
  const [visitasPorViagem, setVisitasPorViagem] = useState<Record<string, string[]>>({});
  const [visitPersistenceByTrip, setVisitPersistenceByTrip] = useState<
    Record<string, 'pending' | 'local' | 'confirmed' | 'error'>
  >({});
  const visitasRef = useRef<Record<string, string[]>>({});
  const pendingVisitRequests = useRef(new Set<string>());
  const overlappingVisits = useRef(new Set<string>());
  const syncingVisits = useRef(new Set<string>());
  const visitRevision = useRef<Record<string, number>>({});
  const pendingVisitChanges = useRef<Record<string, Record<string, boolean>>>({});
  const attemptSequence = useRef(0);
  const planningController = useRef<AbortController | null>(null);
  const sessionGeneration = useRef(0);
  const deletingRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const persistenceRef = useRef<Record<string, PersistenceStatus>>({});

  const updatePersistence = useCallback(
    (update: (current: Record<string, PersistenceStatus>) => Record<string, PersistenceStatus>) => {
      const next = update(persistenceRef.current);
      persistenceRef.current = next;
      setPersistenceById(next);
    },
    [],
  );

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const generation = sessionGeneration.current;
      const session = await carregarSessao(signal);
      if (generation !== sessionGeneration.current) return;

      const base: AppData = {
        ...session,
        ufs: session.ufs.length > 0 ? session.ufs : [...UFS_BRASIL],
        viagens: [],
      };
      setData(base);
      setOperationalTelemetry(session.operationalTelemetry ?? null);
      setOperationalError(null);
      setPersistenceById({});
      persistenceRef.current = {};

      if (!session.usuario) {
        setHistoryStatus('ready');
        setHistoryError(undefined);
        return;
      }

      setHistoryStatus(networkStatus === 'offline' ? 'offline' : 'loading');
      setHistoryError(undefined);
      try {
        const trips = await listarViagens(signal);
        if (generation !== sessionGeneration.current) return;
        setData((current) =>
          current.usuario?.id === session.usuario?.id
            ? { ...current, viagens: trips.viagens }
            : current,
        );
        setHistoryStatus(networkStatus === 'offline' ? 'offline' : 'ready');
      } catch (error: unknown) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        if (generation !== sessionGeneration.current) return;
        setHistoryStatus(networkStatus === 'offline' ? 'offline' : 'error');
        setHistoryError('Não foi possível atualizar o histórico. Tente novamente.');
      }
    },
    [networkStatus],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    reload(controller.signal)
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') return;
        addToast(
          'Não foi possível acessar a API. Confira se o backend está iniciado e tente novamente.',
        );
      })
      .finally(() => setInitialLoading(false));
    return () => controller.abort();
  }, [addToast, reload]);

  useEffect(() => {
    if (!data.usuario) return;
    if (networkStatus === 'offline') setHistoryStatus('offline');
    else setHistoryStatus((current) => (current === 'offline' ? 'ready' : current));
  }, [data.usuario, networkStatus]);

  useEffect(() => {
    if (!data.usuario?.id) {
      setApiHealthStatus('checking');
      setOperationalTelemetry(null);
      setOperationalError(null);
      return;
    }
    const controller = new AbortController();
    setApiHealthStatus('checking');
    setOperationalError(null);
    obterTelemetriaOperacional(controller.signal)
      .then((metrics) => {
        if (!controller.signal.aborted) {
          setOperationalTelemetry(metrics);
          setOperationalError(null);
        }
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const code = error instanceof Error ? error.message.match(/HTTP (\d{3})/)?.[1] : undefined;
        setOperationalError(
          code
            ? `Não foi possível atualizar a telemetria operacional (HTTP ${code}).`
            : 'Não foi possível atualizar a telemetria operacional. Confira o console e a aba Rede.',
        );
      });
    verificarSaudeApi(controller.signal)
      .then((healthy) => {
        if (!controller.signal.aborted) setApiHealthStatus(healthy ? 'online' : 'unavailable');
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiHealthStatus('unavailable');
      });
    return () => controller.abort();
  }, [data.usuario?.id, networkStatus]);

  useEffect(() => {
    const saved = readSavedVisitas(data.usuario?.id);
    visitasRef.current = saved;
    setVisitasPorViagem(saved);
    const pending = data.usuario?.id ? readPendingVisits(data.usuario.id) : {};
    setVisitPersistenceByTrip(Object.fromEntries(Object.keys(pending).map((id) => [id, 'local'])));
    pendingVisitRequests.current.clear();
    overlappingVisits.current.clear();
    syncingVisits.current.clear();
    visitRevision.current = {};
    pendingVisitChanges.current = pending;
  }, [data.usuario?.id]);

  useEffect(() => {
    if (!data.usuario?.id) return;
    const next = { ...visitasRef.current };
    let changed = false;
    for (const trip of data.viagens) {
      if (
        !trip.atrativosVisitadosIds ||
        [...pendingVisitRequests.current].some((key) => key.startsWith(`${trip.id}:`))
      )
        continue;
      const ids = applyVisitChanges(
        trip.atrativosVisitadosIds,
        pendingVisitChanges.current[trip.id],
      );
      if (JSON.stringify(ids) !== JSON.stringify(next[trip.id])) {
        next[trip.id] = ids;
        changed = true;
      }
    }
    if (changed) {
      visitasRef.current = next;
      setVisitasPorViagem(next);
      saveVisitas(data.usuario.id, next);
    }
  }, [data.usuario?.id, data.viagens]);

  const runSessionAction = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      planningController.current?.abort();
      planningController.current = null;
      attemptSequence.current += 1;
      sessionGeneration.current += 1;
      setTelemetryState({ kind: 'hidden' });
      setIsSubmitting(false);
      deletingRef.current.clear();
      setDeletingIds([]);
      setPendingRoute(null);
      resetSelectedTrip();
      setHistoryStatus('loading');
      setSugestoes([]);
      setSuggestionStatus('idle');
      setHistoryError(undefined);
      updatePersistence(() => ({}));
      setData((current) => ({
        ...EMPTY_DATA,
        google_client_id: current.google_client_id,
        ufs: current.ufs,
      }));
      setSessionLoading(true);
      try {
        await action();
        await reload();
        return true;
      } catch {
        addToast('Não foi possível atualizar a sessão. Tente novamente.');
        try {
          await reload();
        } catch {
          // A mensagem acima já orienta a repetir a operação.
        }
        return false;
      } finally {
        setSessionLoading(false);
      }
    },
    [addToast, reload, resetSelectedTrip, updatePersistence],
  );

  const auth = useAuth({
    usuario: data.usuario,
    visitorRemainingMs: data.visitor_remaining_ms,
    runSessionAction,
    addToast,
  });

  const reconcilePersistence = useCallback(
    async (tripId: string, expectedUserId: string, generation: number) => {
      const delays = [400, 900, 1500];
      for (const delay of delays) {
        await wait(delay);
        if (!mountedRef.current || generation !== sessionGeneration.current) return;
        try {
          const response = await listarViagens();
          if (!mountedRef.current || generation !== sessionGeneration.current) return;
          const found = response.viagens.some((candidate) => candidate.id === tripId);
          if (!found) continue;

          setData((current) => {
            if (current.usuario?.id !== expectedUserId) return current;
            const otherProvisional = current.viagens.filter(
              (trip) => trip.id !== tripId && persistenceRef.current[trip.id] === 'pending',
            );
            const merged = [...otherProvisional, ...response.viagens].filter(
              (trip, index, all) =>
                all.findIndex((candidate) => candidate.id === trip.id) === index,
            );
            return { ...current, viagens: merged };
          });
          updatePersistence((current) => {
            const { [tripId]: _removed, ...remaining } = current;
            return remaining;
          });
          return;
        } catch {
          // A próxima tentativa limitada ainda pode confirmar a gravação.
        }
      }
      if (!mountedRef.current || generation !== sessionGeneration.current) return;
      updatePersistence((current) => ({ ...current, [tripId]: 'unavailable' }));
    },
    [updatePersistence],
  );

  const submitTrip = useCallback(
    async (form: RoteiroFormData) => {
      planningController.current?.abort();
      const controller = new AbortController();
      planningController.current = controller;
      attemptSequence.current += 1;
      const attemptId = attemptSequence.current;
      const generation = sessionGeneration.current;
      const usuario = data.usuario;
      if (!usuario) {
        planningController.current = null;
        return;
      }
      const route = safeRoute(
        routeLabel(form.origem_cidade, form.origem_uf),
        routeLabel(form.destino_cidade, form.destino_uf),
      );
      let previous: TelemetrySnapshot | undefined;
      setTelemetryState((current) => {
        previous =
          current.kind === 'settled'
            ? current.snapshot
            : current.kind === 'loading' || current.kind === 'error'
              ? current.previous
              : undefined;
        return { kind: 'loading', attemptId, route, previous };
      });
      setPendingRoute({ origem: route.origin, destino: route.destination });
      setIsSubmitting(true);
      try {
        const result = await criarViagem(form, controller.signal);
        if (controller.signal.aborted) return;
        if (attemptId !== attemptSequence.current || generation !== sessionGeneration.current)
          return;
        const snapshot: TelemetrySnapshot = {
          attemptId,
          sessionIdentityId: usuario.id,
          recordedAt: new Date().toISOString(),
          route,
          ...result.metadata,
          providers: providerDiagnostics(result.viagem),
          etapas: result.viagem.telemetria?.duracoes_etapas_ms,
          session: sessionSummary(usuario, data.viagens.length + 1, {
            sessionStartedAt: data.session_started_at,
            sessionDurationMs: data.session_duration_ms,
          }),
          service: serviceCondition(true),
          connectivity,
        };
        setTelemetryState({ kind: 'settled', snapshot });
        void obterTelemetriaOperacional()
          .then((metrics) => {
            if (generation === sessionGeneration.current && mountedRef.current)
              setOperationalTelemetry(metrics);
          })
          .catch(() => {
            if (generation === sessionGeneration.current && mountedRef.current)
              setOperationalError(
                'Falha ao atualizar os indicadores operacionais após o planejamento.',
              );
          });
        setActiveTrip(result.viagem);
        setActiveTripForm(form);
        formByTripId.current[result.viagem.id] = form;
        setData((current) =>
          current.usuario?.id === usuario.id
            ? { ...current, viagens: mergeTripFirst(current.viagens, result.viagem) }
            : current,
        );
        updatePersistence((current) => ({ ...current, [result.viagem.id]: 'pending' }));
        void reconcilePersistence(result.viagem.id, usuario.id, generation);
        if (result.aviso) addToast(result.aviso, 'info');
        else addToast('Roteiro gerado. Confirmando salvamento.', 'sucesso');
      } catch (error: unknown) {
        if (controller.signal.aborted) return;
        if (attemptId !== attemptSequence.current || generation !== sessionGeneration.current)
          return;
        setTelemetryState({ kind: 'error', attemptId, route, previous });
        if (error instanceof ApiError && error.status === 422) {
          throw error;
        } else if (error instanceof ApiError && error.status === 409) {
          addToast(error.message, 'info');
        } else {
          addToast('Falha de conexão ao gerar o roteiro. Tente novamente.');
        }
        throw new Error('Falha ao gerar roteiro.');
      } finally {
        if (planningController.current === controller) planningController.current = null;
        if (attemptId === attemptSequence.current && generation === sessionGeneration.current) {
          setIsSubmitting(false);
          setPendingRoute(null);
        }
      }
    },
    [
      addToast,
      data.usuario,
      data.viagens.length,
      data.session_started_at,
      data.session_duration_ms,
      networkStatus,
      connectivity,
      reconcilePersistence,
      updatePersistence,
    ],
  );

  const cancelTrip = useCallback(() => {
    if (!planningController.current) return;
    planningController.current.abort();
    planningController.current = null;
    attemptSequence.current += 1;
    setIsSubmitting(false);
    setPendingRoute(null);
    setTelemetryState((current) => {
      if (current.kind !== 'loading') return current;
      return current.previous
        ? { kind: 'settled', snapshot: current.previous }
        : { kind: 'hidden' };
    });
    addToast('Planejamento cancelado.', 'info');
  }, [addToast]);

  const deleteTrip = useCallback(
    async (tripId: string) => {
      if (deletingRef.current.has(tripId)) return;
      const generation = sessionGeneration.current;
      const userId = data.usuario?.id;
      if (!userId) return;
      deletingRef.current.add(tripId);
      setDeletingIds((current) => [...current, tripId]);
      try {
        await excluirViagem(tripId);
        if (generation !== sessionGeneration.current) return;
        setData((current) =>
          current.usuario?.id === userId
            ? { ...current, viagens: current.viagens.filter((trip) => trip.id !== tripId) }
            : current,
        );
        setActiveTrip((current) => (current?.id === tripId ? null : current));
        delete formByTripId.current[tripId];
        updatePersistence((current) => {
          const { [tripId]: _removed, ...remaining } = current;
          return remaining;
        });
        addToast('Roteiro excluído.', 'sucesso');
        void obterTelemetriaOperacional()
          .then((metrics) => {
            if (generation === sessionGeneration.current && mountedRef.current)
              setOperationalTelemetry(metrics);
          })
          .catch(() => {
            if (generation === sessionGeneration.current && mountedRef.current)
              setOperationalError(
                'Falha ao atualizar os indicadores operacionais após a exclusão.',
              );
          });
      } catch {
        if (generation === sessionGeneration.current) {
          addToast('Não foi possível excluir o roteiro. Tente novamente.');
        }
      } finally {
        if (generation === sessionGeneration.current) {
          deletingRef.current.delete(tripId);
          setDeletingIds((current) => current.filter((id) => id !== tripId));
        }
      }
    },
    [addToast, data.usuario?.id, updatePersistence],
  );

  const solicitarSugestoesGps = useCallback(async () => {
    const generation = sessionGeneration.current;
    setSuggestionStatus('loading');
    try {
      const coords = await obterCoordenadasNavegador();
      if (generation !== sessionGeneration.current || !mountedRef.current) return;
      const recomendacoes = obterSugestoesDestino(coords.latitude, coords.longitude);
      setSugestoes(recomendacoes);
      setSuggestionStatus('available');
      addToast(
        `${recomendacoes.length} destinos recomendados acima de 400 km a partir do seu GPS.`,
        'sucesso',
      );
    } catch (error) {
      if (generation !== sessionGeneration.current || !mountedRef.current) return;
      setSuggestionStatus('unavailable');
      const mensagem =
        error instanceof Error
          ? error.message
          : 'Não foi possível obter sua localização. O preenchimento manual continua disponível.';
      addToast(mensagem, 'erro');
    }
  }, [addToast]);

  const updateStreamSession = useCallback(
    (update: StreamTelemetryUpdate) => {
      if (!update.session || update.session.userId !== data.usuario?.id) return;
      setTelemetryState((current) => {
        if (
          current.kind !== 'settled' ||
          current.snapshot.sessionIdentityId !== update.session?.userId
        )
          return current;
        const session = update.session;
        return {
          ...current,
          snapshot: {
            ...current.snapshot,
            session: {
              ...current.snapshot.session,
              ...(session.sessionStartedAt.available
                ? { sessionStartedAt: session.sessionStartedAt }
                : {}),
              ...(session.sessionDuration.available
                ? { sessionDuration: session.sessionDuration }
                : {}),
              ...(session.userTripCount !== undefined
                ? { userTripCount: session.userTripCount }
                : {}),
            },
          },
        };
      });
    },
    [data.usuario?.id],
  );

  const toggleVisitaAtrativo = useCallback(
    async (viagemId: string, atrativoId: string) => {
      const requestKey = `${viagemId}:${atrativoId}`;
      if (syncingVisits.current.has(viagemId) || pendingVisitRequests.current.has(requestKey))
        return;
      if ([...pendingVisitRequests.current].some((key) => key.startsWith(`${viagemId}:`)))
        overlappingVisits.current.add(viagemId);
      visitRevision.current[viagemId] = (visitRevision.current[viagemId] ?? 0) + 1;
      pendingVisitRequests.current.add(requestKey);
      const generation = sessionGeneration.current;
      const atuais = visitasRef.current[viagemId] ?? [];
      const jaVisitado = atuais.includes(atrativoId);
      const novoStatus = !jaVisitado;
      const novos = jaVisitado ? atuais.filter((id) => id !== atrativoId) : [...atuais, atrativoId];
      const proximo = { ...visitasRef.current, [viagemId]: novos };
      visitasRef.current = proximo;
      setVisitasPorViagem(proximo);
      saveVisitas(data.usuario?.id, proximo);
      setVisitPersistenceByTrip((current) => ({ ...current, [viagemId]: 'pending' }));

      try {
        const confirmed = await atualizarVisitaAtrativo(viagemId, atrativoId, novoStatus);
        if (generation !== sessionGeneration.current) return;
        if (confirmed === null) {
          pendingVisitChanges.current[viagemId] = {
            ...pendingVisitChanges.current[viagemId],
            [atrativoId]: novoStatus,
          };
          addToast('Visita salva apenas neste dispositivo; servidor indisponível.', 'info');
        } else if (pendingVisitChanges.current[viagemId]) {
          delete pendingVisitChanges.current[viagemId][atrativoId];
          if (Object.keys(pendingVisitChanges.current[viagemId]).length === 0)
            delete pendingVisitChanges.current[viagemId];
        }
        savePendingVisits(data.usuario?.id, pendingVisitChanges.current);
        const otherRequest = [...pendingVisitRequests.current].some(
          (key) => key !== requestKey && key.startsWith(`${viagemId}:`),
        );
        if (confirmed !== null && !otherRequest && !overlappingVisits.current.has(viagemId)) {
          const reconciled = {
            ...visitasRef.current,
            [viagemId]: applyVisitChanges(confirmed, pendingVisitChanges.current[viagemId]),
          };
          visitasRef.current = reconciled;
          setVisitasPorViagem(reconciled);
          saveVisitas(data.usuario?.id, reconciled);
        }
        const hasPending = Object.keys(pendingVisitChanges.current[viagemId] ?? {}).length > 0;
        setVisitPersistenceByTrip((current) => ({
          ...current,
          [viagemId]: hasPending ? 'local' : 'confirmed',
        }));
      } catch {
        if (generation !== sessionGeneration.current) return;
        const latest = visitasRef.current[viagemId] ?? [];
        const restoredIds = jaVisitado
          ? [...new Set([...latest, atrativoId])]
          : latest.filter((id) => id !== atrativoId);
        const reverted = { ...visitasRef.current, [viagemId]: restoredIds };
        visitasRef.current = reverted;
        setVisitasPorViagem(reverted);
        saveVisitas(data.usuario?.id, reverted);
        setVisitPersistenceByTrip((current) => ({ ...current, [viagemId]: 'error' }));
        addToast('Não foi possível salvar a visita. Tente novamente.');
      } finally {
        if (generation === sessionGeneration.current)
          pendingVisitRequests.current.delete(requestKey);
        if (
          generation === sessionGeneration.current &&
          overlappingVisits.current.has(viagemId) &&
          ![...pendingVisitRequests.current].some((key) => key.startsWith(`${viagemId}:`))
        ) {
          overlappingVisits.current.delete(viagemId);
          const revision = visitRevision.current[viagemId];
          try {
            const response = await listarViagens();
            const isCurrent =
              generation === sessionGeneration.current &&
              visitRevision.current[viagemId] === revision &&
              ![...pendingVisitRequests.current].some((key) => key.startsWith(`${viagemId}:`));
            const trip = isCurrent
              ? response.viagens.find((item) => item.id === viagemId)
              : undefined;
            if (trip?.atrativosVisitadosIds) {
              const reconciled = {
                ...visitasRef.current,
                [viagemId]: applyVisitChanges(
                  trip.atrativosVisitadosIds,
                  pendingVisitChanges.current[viagemId],
                ),
              };
              visitasRef.current = reconciled;
              setVisitasPorViagem(reconciled);
              saveVisitas(data.usuario?.id, reconciled);
            }
          } catch {
            // Mantém as confirmações já recebidas até a próxima atualização do histórico.
          }
        }
      }
    },
    [addToast, data.usuario?.id],
  );

  const retryLocalVisits = useCallback(
    async (viagemId: string) => {
      const generation = sessionGeneration.current;
      const pending = pendingVisitChanges.current[viagemId];
      if (
        !pending ||
        syncingVisits.current.has(viagemId) ||
        [...pendingVisitRequests.current].some((key) => key.startsWith(`${viagemId}:`))
      )
        return;
      syncingVisits.current.add(viagemId);
      setVisitPersistenceByTrip((current) => ({ ...current, [viagemId]: 'pending' }));
      try {
        for (const [atrativoId, visitado] of Object.entries(pending)) {
          const confirmed = await atualizarVisitaAtrativo(viagemId, atrativoId, visitado);
          if (generation !== sessionGeneration.current) return;
          if (confirmed === null) {
            setVisitPersistenceByTrip((current) => ({ ...current, [viagemId]: 'local' }));
            return;
          }
          delete pending[atrativoId];
          if (Object.keys(pending).length === 0) delete pendingVisitChanges.current[viagemId];
          savePendingVisits(data.usuario?.id, pendingVisitChanges.current);
          const reconciled = {
            ...visitasRef.current,
            [viagemId]: applyVisitChanges(confirmed, pending),
          };
          visitasRef.current = reconciled;
          setVisitasPorViagem(reconciled);
          saveVisitas(data.usuario?.id, reconciled);
        }
        setVisitPersistenceByTrip((current) => ({ ...current, [viagemId]: 'confirmed' }));
        addToast('Visitas sincronizadas com o servidor.', 'sucesso');
      } catch {
        if (generation !== sessionGeneration.current) return;
        setVisitPersistenceByTrip((current) => ({ ...current, [viagemId]: 'local' }));
        addToast('Ainda não foi possível sincronizar as visitas.');
      } finally {
        if (generation === sessionGeneration.current) syncingVisits.current.delete(viagemId);
      }
    },
    [addToast, data.usuario?.id],
  );

  return {
    data,
    toasts,
    initialLoading,
    sessionLoading,
    savedGoogleUser: auth.savedGoogleUser,
    sessionTimerLabel: auth.sessionTimer.remainingLabel,
    isSubmitting,
    deletingIds,
    pendingRoute,
    activeTrip,
    activeTripForm,
    historyStatus,
    historyError,
    persistenceById,
    telemetryState,
    apiHealthStatus,
    operationalTelemetry,
    operationalError,
    sugestoes,
    suggestionStatus,
    visitasPorViagem,
    visitPersistenceByTrip,
    connectivity,
    copyTelemetryRequestId: copyRequestId,
    dismissToast,
    loginWithGoogle: auth.loginWithGoogle,
    loginAsVisitor: auth.loginAsVisitor,
    restoreGoogleUser: auth.restoreGoogleUser,
    logout: auth.logout,
    solicitarSugestoesGps,
    submitTrip,
    cancelTrip,
    deleteTrip,
    selectTrip,
    toggleVisitaAtrativo,
    retryLocalVisits,
    updateStreamSession,
  };
}
