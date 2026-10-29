import { useCallback, useRef, useState } from 'react';

import type { RoteiroFormData, Viagem } from '../types/domain';

export function useTripSelection() {
  const [activeTrip, setActiveTrip] = useState<Viagem | null>(null);
  const [activeTripForm, setActiveTripForm] = useState<RoteiroFormData | null>(null);
  const formByTripId = useRef<Record<string, RoteiroFormData>>({});

  const selectTrip = useCallback((trip: Viagem) => {
    setActiveTrip(trip);
    // TODO(integracao): recuperar parâmetros persistidos do roteiro quando houver contrato;
    // o mapa em memória perde duração e perfis após recarga e não deve inventá-los.
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
