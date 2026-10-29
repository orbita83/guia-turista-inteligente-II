import { useCallback, useRef, useState } from 'react';

import type { RoteiroFormData, Viagem } from '../types/domain';

export function useTripSelection() {
  const [activeTrip, setActiveTrip] = useState<Viagem | null>(null);
  const [activeTripForm, setActiveTripForm] = useState<RoteiroFormData | null>(null);
  const formByTripId = useRef<Record<string, RoteiroFormData>>({});

  const selectTrip = useCallback((trip: Viagem) => {
    setActiveTrip(trip);
    // TODO(integracao): recuperar parâmetros e resultados avançados persistidos por roteiro
    // e rota, preservando a seleção correta após recarga e viagens antigas sem esses campos.
    setActiveTripForm(formByTripId.current[trip.id] ?? null);
  }, []);

  const reset = useCallback(() => {
    setActiveTrip(null);
    setActiveTripForm(null);
    formByTripId.current = {};
  }, []);

  return {
    activeTrip,
    setActiveTrip,
    activeTripForm,
    setActiveTripForm,
    formByTripId,
    selectTrip,
    reset,
  };
}
