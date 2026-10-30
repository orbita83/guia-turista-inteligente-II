import { renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vite-plus/test';

import { useMunicipios } from './useMunicipios';

describe('useMunicipios', () => {
  afterEach(() => vi.restoreAllMocks());

  it('carrega o catálogo somente quando há uma sessão ativa', async () => {
    const fetchMock = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(
        new Response(
          JSON.stringify([
            { nome: 'Recife', microrregiao: { mesorregiao: { UF: { sigla: 'PE' } } } },
          ]),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      );
    const { result, rerender } = renderHook(({ enabled }) => useMunicipios(enabled), {
      initialProps: { enabled: false },
    });

    expect(result.current.status).toBe('unavailable');
    expect(fetchMock).not.toHaveBeenCalled();

    rerender({ enabled: true });
    await waitFor(() => expect(result.current.status).toBe('available'));
    expect(result.current.municipios).toEqual([{ nome: 'Recife', uf: 'PE' }]);
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
