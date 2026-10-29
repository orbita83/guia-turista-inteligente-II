import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vite-plus/test';

import { useConnectivity } from './useConnectivity';

const connectionDescriptor = Object.getOwnPropertyDescriptor(navigator, 'connection');

function setConnection(value: EventTarget | undefined) {
  Object.defineProperty(navigator, 'connection', {
    configurable: true,
    value,
  });
}

afterEach(() => {
  if (connectionDescriptor) Object.defineProperty(navigator, 'connection', connectionDescriptor);
  else Reflect.deleteProperty(navigator, 'connection');
});

describe('useConnectivity', () => {
  it('mantém as estimativas indisponíveis quando a API não existe', () => {
    setConnection(undefined);
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.rtt.available).toBe(false);
    expect(result.current.networkType.available).toBe(false);
  });

  it('normaliza RTT, distingue tipo efetivo e atualiza quando a conexão muda', () => {
    const connection = new EventTarget() as EventTarget & {
      rtt: unknown;
      type: unknown;
      effectiveType: unknown;
    };
    connection.rtt = 75;
    connection.type = 'unknown';
    connection.effectiveType = '4g';
    setConnection(connection);
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.rtt).toEqual({ available: true, value: 75 });
    expect(result.current.networkType).toEqual({ available: true, value: 'Efetiva: 4g' });

    act(() => {
      connection.rtt = -1;
      connection.effectiveType = '3g';
      connection.dispatchEvent(new Event('change'));
    });
    expect(result.current.rtt).toMatchObject({ available: false, reason: 'invalid' });
    expect(result.current.networkType).toEqual({ available: true, value: 'Efetiva: 3g' });
  });

  it('preserva RTT zero como estimativa válida', () => {
    const connection = new EventTarget() as EventTarget & { rtt: number };
    connection.rtt = 0;
    setConnection(connection);
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.rtt).toEqual({ available: true, value: 0 });
  });
});
