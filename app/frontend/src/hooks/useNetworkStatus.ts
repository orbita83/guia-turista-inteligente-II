import { useEffect, useState } from 'react';

import type { ConnectivityCondition } from '../types/domain';

type NetworkStatus = ConnectivityCondition['state'];

function readNetworkStatus(): NetworkStatus {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') return 'unknown';
  return navigator.onLine ? 'online' : 'offline';
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>(readNetworkStatus);

  useEffect(() => {
    const update = () => setStatus(readNetworkStatus());
    window.addEventListener('online', update);
    window.addEventListener('offline', update);
    return () => {
      window.removeEventListener('online', update);
      window.removeEventListener('offline', update);
    };
  }, []);

  return status;
}
