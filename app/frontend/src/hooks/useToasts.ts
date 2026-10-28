import { useCallback, useRef, useState } from 'react';

import type { ToastMessage } from '../types/domain';

export function useToasts() {
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const sequence = useRef(0);

  const addToast = useCallback((message: string, type: ToastMessage['tipo'] = 'erro') => {
    sequence.current += 1;
    setToasts((current) => [
      ...current,
      { id: `cliente-${Date.now()}-${sequence.current}`, mensagem: message, tipo: type },
    ]);
  }, []);

  const dismissToast = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  return { toasts, addToast, dismissToast };
}
