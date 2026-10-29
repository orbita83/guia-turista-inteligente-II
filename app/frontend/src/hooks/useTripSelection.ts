import { useCallback, useRef, useState } from 'react';

import type { RoteiroFormData, Viagem } from '../types/domain';

export function useTripSelection() {
  const [activeTrip, setActiveTrip] = useState<Viagem | null>(null);
  const [activeTripForm, setActiveTripForm] = useState<RoteiroFormData | null>(null);
  const formByTripId = useRef<Record<string, RoteiroFormData>>({});

  const selectTrip = useCallback((trip: Viagem) => {
    setActiveTrip(trip);
    setActiveTripForm(trip.parametros ?? formByTripId.current[trip.id] ?? null);
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
