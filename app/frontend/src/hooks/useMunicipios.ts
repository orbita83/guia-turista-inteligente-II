import { useEffect, useState } from 'react';

import { carregarMunicipios } from '../services/municipios';
import type { MunicipioCatalogStatus, MunicipioOption } from '../types/domain';

export function useMunicipios(enabled = true) {
  const [municipios, setMunicipios] = useState<MunicipioOption[]>([]);
  const [status, setStatus] = useState<MunicipioCatalogStatus>(enabled ? 'loading' : 'unavailable');

  useEffect(() => {
    if (!enabled) {
      setMunicipios([]);
      setStatus('unavailable');
      return;
    }

    const controller = new AbortController();
    setStatus('loading');
    carregarMunicipios(controller.signal)
      .then((catalogo) => {
        if (controller.signal.aborted) return;
        setMunicipios(catalogo);
        setStatus('available');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setMunicipios([]);
          setStatus('unavailable');
        }
      });

    return () => controller.abort();
  }, [enabled]);

  return { municipios, status };
}
