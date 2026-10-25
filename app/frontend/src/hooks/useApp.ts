import { useCallback, useEffect, useRef, useState } from 'react';

import { UFS_BRASIL } from '../constants/ufs';
import {
  API_TRIPS_URL,
  ApiError,
  autenticarComGoogle,
  carregarSessao,
  criarViagem,
  encerrarSessao,
  entrarComoVisitante,
  excluirViagem,
  listarViagens,
  type SessionResponse,
} from '../services/api';
import type { RoteiroFormData, ToastMessage, Viagem } from '../types/domain';

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

export function useApp() {
  const [data, setData] = useState<AppData>(EMPTY_DATA);
  const [initialLoading, setInitialLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [pendingRoute, setPendingRoute] = useState<PendingRoute | null>(null);
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const toastSequence = useRef(0);

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

  const reload = useCallback(async (signal?: AbortSignal) => {
    const session = await carregarSessao(signal);
    let viagens: AppData['viagens'] = [];
    if (session.usuario) {
      const trips = await listarViagens(signal);
      viagens = trips.viagens;
    }
    setData({
      ...session,
      ufs: session.ufs.length > 0 ? session.ufs : [...UFS_BRASIL],
      viagens,
      toasts: [],
    });
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

  const runSessionAction = useCallback(
    async (action: () => Promise<unknown>) => {
      setSessionLoading(true);
      try {
        await action();
        await reload();
      } catch {
        addToast('Não foi possível atualizar a sessão. Tente novamente.');
      } finally {
        setSessionLoading(false);
      }
    },
    [addToast, reload],
  );

  const submitTrip = useCallback(
    async (form: RoteiroFormData) => {
      setPendingRoute({
        origem: routeLabel(form.origem_cidade, form.origem_uf),
        destino: routeLabel(form.destino_cidade, form.destino_uf),
      });
      setIsSubmitting(true);
      try {
        const result = await criarViagem(form);
        await reload();
        if (result.aviso) addToast(result.aviso, 'info');
        else addToast('Roteiro atualizado com sucesso.', 'sucesso');
      } catch (error: unknown) {
        if (error instanceof ApiError && error.status === 409) {
          addToast(error.message, 'info');
        } else {
          addToast('Falha de conexão ao gerar o roteiro. Tente novamente.');
        }
        throw new Error('Falha ao gerar roteiro.');
      } finally {
        setIsSubmitting(false);
        setPendingRoute(null);
      }
    },
    [addToast, reload],
  );

  const deleteTrip = useCallback(
    async (tripId: string) => {
      setDeletingId(tripId);
      try {
        await excluirViagem(tripId);
        await reload();
        addToast('Roteiro excluído.', 'sucesso');
      } catch {
        addToast('Não foi possível excluir o roteiro. Tente novamente.');
      } finally {
        setDeletingId(null);
      }
    },
    [addToast, reload],
  );

  return {
    data,
    toasts,
    initialLoading,
    sessionLoading,
    isSubmitting,
    deletingId,
    pendingRoute,
    jsonUrl: API_TRIPS_URL,
    dismissToast: (id: string) =>
      setToasts((current) => current.filter((toast) => toast.id !== id)),
    loginWithGoogle: (credential: string) =>
      runSessionAction(() => autenticarComGoogle(credential)),
    loginAsVisitor: () => runSessionAction(entrarComoVisitante),
    logout: () => runSessionAction(encerrarSessao),
    submitTrip,
    deleteTrip,
  };
}
