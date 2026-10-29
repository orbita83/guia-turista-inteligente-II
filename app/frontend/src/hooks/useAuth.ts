import { useCallback, useRef, useState } from 'react';

import { autenticarComGoogle, encerrarSessao, entrarComoVisitante } from '../services/api';
import {
  clearSavedGoogleUser,
  readSavedGoogleUser,
  saveGoogleUser,
} from '../services/savedGoogleUser';
import type { ToastMessage, Usuario } from '../types/domain';
import { useSessionTimer } from './useSessionTimer';

interface UseAuthOptions {
  usuario: Usuario | null;
  runSessionAction: (action: () => Promise<unknown>) => Promise<boolean>;
  addToast: (message: string, type?: ToastMessage['tipo']) => void;
}

export function useAuth({ usuario, runSessionAction, addToast }: UseAuthOptions) {
  const [savedGoogleUser, setSavedGoogleUser] = useState(readSavedGoogleUser);
  const googleCredential = useRef<string | null>(null);
  // TODO: consumir POST /auth/restore-google para restaurar pela sessão assinada,
  // sem exigir uma credencial Google mantida apenas em memória.
  // TODO(integracao): sincronizar o temporizador visitante com prazo confiável do servidor;
  // o contrato atual não expõe visitor_expires_at e recarregar não deve reiniciar a sessão.
  const sessionTimer = useSessionTimer(null);

  const loginWithGoogle = useCallback(
    async (credential: string) => {
      await runSessionAction(async () => {
        await autenticarComGoogle(credential);
        googleCredential.current = credential;
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
    const credential = googleCredential.current;
    if (!credential) {
      addToast('Saia do modo visitante e entre novamente com Google.');
      return;
    }
    const succeeded = await runSessionAction(() => autenticarComGoogle(credential));
    googleCredential.current = null;
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
      googleCredential.current = null;
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
