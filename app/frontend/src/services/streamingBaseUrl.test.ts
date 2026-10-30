import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

it('usa a base configurada também para o streaming em origem separada', async () => {
  vi.stubEnv('VITE_API_BASE_URL', 'http://127.0.0.1:18001/api/v1/');
  vi.resetModules();
  const { streamGuiaTuristico } = await import('./streamingGuide');
  const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
    new Response('data: {"chunk":"", "done":true}\n\n', {
      headers: { 'Content-Type': 'text/event-stream' },
    }),
  );
  await streamGuiaTuristico(
    { destino: 'Olinda' },
    { onChunk: vi.fn(), onDone: vi.fn(), onError: vi.fn() },
  );
  expect(fetchMock).toHaveBeenCalledWith(
    'http://127.0.0.1:18001/api/v1/roteiros/stream-guia',
    expect.objectContaining({ method: 'POST', credentials: 'include' }),
  );
});
