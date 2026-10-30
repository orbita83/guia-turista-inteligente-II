import { useEffect, useState } from 'react';

import { connectivityCondition } from '../services/telemetry';
import type { ConnectivityCondition } from '../types/domain';
import { useNetworkStatus } from './useNetworkStatus';

interface NetworkInformationLike extends EventTarget {
  rtt?: unknown;
  effectiveType?: unknown;
  type?: unknown;
}

function readConnection(): NetworkInformationLike | undefined {
  if (typeof navigator === 'undefined') return undefined;
  return (navigator as Navigator & { connection?: NetworkInformationLike }).connection;
}

export function useConnectivity(): ConnectivityCondition {
  const state = useNetworkStatus();
  const read = (): ConnectivityCondition => {
    const connection = readConnection();
    return connectivityCondition(state, {
      rtt: connection?.rtt,
      type: connection?.type,
      effectiveType: connection?.effectiveType,
    });
  };
  const [connectivity, setConnectivity] = useState(() => read());

  useEffect(() => {
    const update = () => setConnectivity(read());
    const connection = readConnection();
    connection?.addEventListener('change', update);
    return () => {
      connection?.removeEventListener('change', update);
    };
  }, []);

  return { ...connectivity, state };
}
