import { act, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { useNetworkStatus } from './useNetworkStatus';

describe('useNetworkStatus', () => {
  afterEach(() => vi.restoreAllMocks());

  it('uses the browser signal as its initial state', () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const { result } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe('offline');
  });

  it('reacts to online and offline events and removes listeners on cleanup', () => {
    let online = true;
    vi.spyOn(navigator, 'onLine', 'get').mockImplementation(() => online);
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const { result, unmount } = renderHook(() => useNetworkStatus());
    expect(result.current).toBe('online');

    online = false;
    act(() => {
      window.dispatchEvent(new Event('offline'));
    });
    expect(result.current).toBe('offline');

    unmount();
    expect(removeSpy).toHaveBeenCalledWith('online', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('offline', expect.any(Function));
  });
});
