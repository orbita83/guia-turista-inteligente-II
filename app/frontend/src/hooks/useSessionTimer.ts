import { useEffect, useState } from 'react';

/** Conta até um prazo confiável fornecido pela aplicação; sem prazo, permanece indisponível. */
export function useSessionTimer(expiresAt: number | null) {
  const [now, setNow] = useState(Date.now);

  useEffect(() => {
    if (expiresAt === null) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [expiresAt]);

  const remainingSeconds =
    expiresAt === null ? null : Math.max(0, Math.ceil((expiresAt - now) / 1000));
  const remainingLabel =
    remainingSeconds === null
      ? null
      : `${Math.floor(remainingSeconds / 3600)}h ${Math.floor((remainingSeconds % 3600) / 60)}min`;

  return { remainingSeconds, remainingLabel };
}
