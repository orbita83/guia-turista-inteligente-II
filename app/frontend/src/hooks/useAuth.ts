import { useCallback, useMemo, useState } from 'react';

import {
  autenticarComGoogle,
  encerrarSessao,
  entrarComoVisitante,
  restaurarGoogle,
} from '../services/api';
import {
  clearSavedGoogleUser,
  readSavedGoogleUser,
  saveGoogleUser,
} from '../services/savedGoogleUser';
import type { ToastMessage, Usuario } from '../types/domain';
import { useSessionTimer } from './useSessionTimer';

interface UseAuthOptions {
  usuario: Usuario | null;
  visitorRemainingMs?: number | null;
  runSessionAction: (action: () => Promise<unknown>) => Promise<boolean>;
  addToast: (message: string, type?: ToastMessage['tipo']) => void;
}

export function useAuth({
  usuario,
  visitorRemainingMs,
  runSessionAction,
  addToast,
}: UseAuthOptions) {
  const [savedGoogleUser, setSavedGoogleUser] = useState(readSavedGoogleUser);
  const expiresAt = useMemo(
    () =>
      usuario?.tipo === 'visitante' &&
      typeof visitorRemainingMs === 'number' &&
      Number.isFinite(visitorRemainingMs) &&
      visitorRemainingMs >= 0
        ? Date.now() + visitorRemainingMs
        : null,
    [usuario?.id, usuario?.tipo, visitorRemainingMs],
  );
  const sessionTimer = useSessionTimer(expiresAt);

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      await runSessionAction(async () => {
        await autenticarComGoogle(credential);
        clearSavedGoogleUser();
        setSavedGoogleUser(null);
      });
    },
    [runSessionAction],
  );

  const loginAsVisitor = useCallback(async () => {
    const previousGoogleUser = usuario?.tipo === 'google' ? usuario : null;
    await runSessionAction(async () => {
      await entrarComoVisitante();
      if (previousGoogleUser) {
        saveGoogleUser(previousGoogleUser);
        setSavedGoogleUser(previousGoogleUser);
      }
    });
  }, [runSessionAction, usuario]);

  const restoreGoogleUser = useCallback(async () => {
    if (!savedGoogleUser || usuario?.tipo !== 'visitante') return;
    const succeeded = await runSessionAction(() => restaurarGoogle());
    if (succeeded) {
      clearSavedGoogleUser();
      setSavedGoogleUser(null);
    } else {
      addToast('Saia do modo visitante e entre novamente com Google.');
    }
  }, [addToast, runSessionAction, savedGoogleUser, usuario?.tipo]);

  const logout = useCallback(async () => {
    await runSessionAction(async () => {
      await encerrarSessao();
      clearSavedGoogleUser();
      setSavedGoogleUser(null);
    });
  }, [runSessionAction]);

  return {
    savedGoogleUser,
    loginWithGoogle,
    loginAsVisitor,
    restoreGoogleUser,
    logout,
    sessionTimer,
  };
}
