import { useCallback, useEffect, useRef, useState } from 'react';

import { UFS_BRASIL } from '../constants/ufs';
import {
  ApiError,
  autenticarComGoogle,
  carregarSessao,
  criarViagem,
  encerrarSessao,
  entrarComoVisitante,
  excluirViagem,
  listarViagens,
  verificarSaudeApi,
  type SessionResponse,
} from '../services/api';
import {
  connectivityCondition,
  copyRequestId,
  providerDiagnostics,
  safeRoute,
  serviceCondition,
  sessionSummary,
} from '../services/telemetry';
import {
  clearSavedGoogleUser,
  readSavedGoogleUser,
  saveGoogleUser,
} from '../services/savedGoogleUser';
import type {
  HistoryStatus,
  PersistenceStatus,
  RoteiroFormData,
  TelemetryPanelState,
  TelemetrySnapshot,
  ToastMessage,
  Viagem,
} from '../types/domain';
import { useNetworkStatus } from './useNetworkStatus';

interface AppData extends SessionResponse {
  viagens: Viagem[];
  toasts: ToastMessage[];
}

const EMPTY_DATA: AppData = {
  usuario: null,
  viagens: [],
  ufs: [...UFS_BRASIL],
  google_client_id: '',
  toasts: [],
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

export function useApp() {
  const networkStatus = useNetworkStatus();
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingIds, setDeletingIds] = useState<string[]>([]);
  const [pendingRoute, setPendingRoute] = useState<PendingRoute | null>(null);
  const [activeTrip, setActiveTrip] = useState<Viagem | null>(null);
  const [activeTripForm, setActiveTripForm] = useState<RoteiroFormData | null>(null);
  const [historyStatus, setHistoryStatus] = useState<HistoryStatus>('loading');
  const [historyError, setHistoryError] = useState<string | undefined>();
  const [persistenceById, setPersistenceById] = useState<Record<string, PersistenceStatus>>({});
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const [savedGoogleUser, setSavedGoogleUser] = useState(readSavedGoogleUser);
  const [telemetryState, setTelemetryState] = useState<TelemetryPanelState>({ kind: 'hidden' });
  const [apiHealthStatus, setApiHealthStatus] = useState<'checking' | 'online' | 'unavailable'>(
    'checking',
  );
  const toastSequence = useRef(0);
  const attemptSequence = useRef(0);
  const sessionGeneration = useRef(0);
  const deletingRef = useRef(new Set<string>());
  const mountedRef = useRef(true);
  const persistenceRef = useRef<Record<string, PersistenceStatus>>({});
  const googleCredentialRef = useRef<string | null>(null);

  const updatePersistence = useCallback(
    (update: (current: Record<string, PersistenceStatus>) => Record<string, PersistenceStatus>) => {
      const next = update(persistenceRef.current);
      persistenceRef.current = next;
      setPersistenceById(next);
    },
    [],
  );

  const addToast = useCallback((message: string, type: ToastMessage['tipo'] = 'erro') => {
    toastSequence.current += 1;
    setToasts((current) => [
      ...current,
      {
        id: `cliente-${Date.now()}-${toastSequence.current}`,
        mensagem: message,
        tipo: type,
      },
    ]);
  }, []);

  const reload = useCallback(
    async (signal?: AbortSignal) => {
      const generation = sessionGeneration.current;
      const session = await carregarSessao(signal);
      if (generation !== sessionGeneration.current) return;

      const base: AppData = {
        ...session,
        ufs: session.ufs.length > 0 ? session.ufs : [...UFS_BRASIL],
        viagens: [],
        toasts: [],
      };
      setData(base);
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
      return;
    }
    const controller = new AbortController();
    setApiHealthStatus('checking');
    verificarSaudeApi(controller.signal)
      .then((healthy) => {
        if (!controller.signal.aborted) setApiHealthStatus(healthy ? 'online' : 'unavailable');
      })
      .catch(() => {
        if (!controller.signal.aborted) setApiHealthStatus('unavailable');
      });
    return () => controller.abort();
  }, [data.usuario?.id, networkStatus]);

  const runSessionAction = useCallback(
    async (action: () => Promise<unknown>): Promise<boolean> => {
      attemptSequence.current += 1;
      sessionGeneration.current += 1;
      setTelemetryState({ kind: 'hidden' });
      setIsSubmitting(false);
      setPendingRoute(null);
      setActiveTrip(null);
      setActiveTripForm(null);
      setHistoryStatus('loading');
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
    [addToast, reload, updatePersistence],
  );

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      await runSessionAction(async () => {
        await autenticarComGoogle(credential);
        googleCredentialRef.current = credential;
        clearSavedGoogleUser();
        setSavedGoogleUser(null);
      });
    },
    [runSessionAction],
  );

  const loginAsVisitor = useCallback(async () => {
    const previousGoogleUser = data.usuario?.tipo === 'google' ? data.usuario : null;
    await runSessionAction(async () => {
      await entrarComoVisitante();
      if (previousGoogleUser) {
        saveGoogleUser(previousGoogleUser);
        setSavedGoogleUser(previousGoogleUser);
      }
    });
  }, [data.usuario, runSessionAction]);

  const restoreGoogleUser = useCallback(async () => {
    if (!savedGoogleUser || data.usuario?.tipo !== 'visitante') return;
    // TODO(backend): criar restauração da sessão Google preservada, vinculada à sessão
    // assinada no servidor. O perfil no localStorage não autentica; a credencial
    // mantida apenas em memória permite um clique somente enquanto ainda é válida.
    const credential = googleCredentialRef.current;
    if (!credential) {
      addToast('Saia do modo visitante e entre novamente com Google.');
      return;
    }
    const succeeded = await runSessionAction(() => autenticarComGoogle(credential));
    if (succeeded) {
      clearSavedGoogleUser();
      setSavedGoogleUser(null);
      googleCredentialRef.current = null;
    } else {
      googleCredentialRef.current = null;
      addToast('Saia do modo visitante e entre novamente com Google.');
    }
  }, [addToast, data.usuario?.tipo, runSessionAction, savedGoogleUser]);

  const logout = useCallback(async () => {
    await runSessionAction(async () => {
      await encerrarSessao();
      googleCredentialRef.current = null;
      clearSavedGoogleUser();
      setSavedGoogleUser(null);
    });
  }, [runSessionAction]);

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
      attemptSequence.current += 1;
      const attemptId = attemptSequence.current;
      const generation = sessionGeneration.current;
      const usuario = data.usuario;
      if (!usuario) return;
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
        const result = await criarViagem(form);
        if (attemptId !== attemptSequence.current || generation !== sessionGeneration.current)
          return;
        const snapshot: TelemetrySnapshot = {
          attemptId,
          sessionIdentityId: usuario.id,
          recordedAt: new Date().toISOString(),
          route,
          ...result.metadata,
          providers: providerDiagnostics(result.viagem),
          session: sessionSummary(usuario, data.viagens.length + 1),
          service: serviceCondition(true),
          connectivity: connectivityCondition(networkStatus),
        };
        setTelemetryState({ kind: 'settled', snapshot });
        setActiveTrip(result.viagem);
        setActiveTripForm(form);
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
        if (attemptId !== attemptSequence.current || generation !== sessionGeneration.current)
          return;
        setTelemetryState({ kind: 'error', attemptId, route, previous });
        if (error instanceof ApiError && error.status === 409) {
          addToast(error.message, 'info');
        } else {
          addToast('Falha de conexão ao gerar o roteiro. Tente novamente.');
        }
        throw new Error('Falha ao gerar roteiro.');
      } finally {
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
      networkStatus,
      reconcilePersistence,
      updatePersistence,
    ],
  );

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
        updatePersistence((current) => {
          const { [tripId]: _removed, ...remaining } = current;
          return remaining;
        });
        addToast('Roteiro excluído.', 'sucesso');
      } catch {
        if (generation === sessionGeneration.current) {
          addToast('Não foi possível excluir o roteiro. Tente novamente.');
        }
      } finally {
        deletingRef.current.delete(tripId);
        setDeletingIds((current) => current.filter((id) => id !== tripId));
      }
    },
    [addToast, data.usuario?.id, updatePersistence],
  );

  const selectTrip = useCallback((trip: Viagem) => {
    setActiveTrip(trip);
  }, []);

  return {
    data,
    toasts,
    initialLoading,
    sessionLoading,
    savedGoogleUser,
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
    connectivity: connectivityCondition(networkStatus),
    copyTelemetryRequestId: copyRequestId,
    dismissToast: (id: string) =>
      setToasts((current) => current.filter((toast) => toast.id !== id)),
    loginWithGoogle,
    loginAsVisitor,
    restoreGoogleUser,
    logout,
    submitTrip,
    deleteTrip,
    selectTrip,
  };
}
