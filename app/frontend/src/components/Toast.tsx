import { useEffect } from 'react';

import type { TipoToast, ToastMessage } from '../types/domain';

const TIPOS_ERRO: readonly TipoToast[] = ['erro', 'error', 'danger'];
const TIPOS_SUCESSO: readonly TipoToast[] = ['sucesso', 'success'];

function detalhesToast(tipo: TipoToast = 'info', titulo?: string) {
  if (TIPOS_ERRO.includes(tipo)) {
    return { icone: '⚠️', titulo: titulo || 'Falha na Requisição' };
  }
  if (TIPOS_SUCESSO.includes(tipo)) {
    return { icone: '✅', titulo: titulo || 'Sucesso' };
  }
  return { icone: 'ℹ️', titulo: titulo || 'Aviso' };
}

interface ToastProps extends ToastMessage {
  onDismiss: (id: string) => void;
  duration?: number;
}

export function Toast({
  id,
  mensagem,
  tipo = 'info',
  titulo,
  onDismiss,
  duration = 6000,
}: ToastProps) {
  useEffect(() => {
    const timeoutId = window.setTimeout(() => onDismiss(id), duration);
    return () => window.clearTimeout(timeoutId);
  }, [duration, id, onDismiss]);

  const detalhes = detalhesToast(tipo, titulo);
  const isError = TIPOS_ERRO.includes(tipo);

  return (
    <div
      className={`toast toast-${tipo} flash-alert flash-${tipo}`}
      role={isError ? 'alert' : 'status'}
    >
      <div className="toast-icon" aria-hidden="true">
        {detalhes.icone}
      </div>
      <div className="toast-body">
        <div className="toast-title">{detalhes.titulo}</div>
        <div className="toast-message">{mensagem}</div>
      </div>
      <button
        type="button"
        className="toast-close"
        onClick={() => onDismiss(id)}
        aria-label="Fechar notificação"
      >
        ×
      </button>
    </div>
  );
}

interface ToastContainerProps {
  toasts: readonly ToastMessage[];
  onDismiss: (id: string) => void;
}

export function ToastContainer({ toasts, onDismiss }: ToastContainerProps) {
  return (
    <div id="toastContainer" className="toast-container" aria-live="polite" aria-atomic="true">
      {toasts.map((toast) => (
        <Toast key={toast.id} {...toast} onDismiss={onDismiss} />
      ))}
    </div>
  );
}
