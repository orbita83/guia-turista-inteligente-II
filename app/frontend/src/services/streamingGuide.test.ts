import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSseBlock, streamGuiaTuristico } from './streamingGuide';

describe('streamingGuide service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseSseBlock', () => {
    it('retorna null para blocos vazios', () => {
      expect(parseSseBlock('')).toBeNull();
      expect(parseSseBlock('   \n\n  ')).toBeNull();
    });

    it('faz o parsing correto de frame data em formato JSON', () => {
      const block = 'data: {"chunk": "Olá mundo! ", "done": false}\n\n';
      const parsed = parseSseBlock(block);
      expect(parsed).toEqual({
        chunk: 'Olá mundo! ',
        done: false,
      });
    });

    it('identifica corretamente o término com done: true', () => {
      const block = 'data: {"chunk": "", "done": true}\n\n';
      const parsed = parseSseBlock(block);
      expect(parsed).toEqual({
        chunk: '',
        done: true,
      });
    });
  });

  describe('streamGuiaTuristico', () => {
    it('consome eventos SSE reais quando o endpoint responde text/event-stream', async () => {
      const streamText =
        'data: {"chunk": "Recife é a ", "done": false}\n\n' +
        'data: {"chunk": "Veneza Brasileira. ", "done": false}\n\n' +
        'data: {"chunk": "", "done": true}\n\n';

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(streamText));
            controller.close();
          },
        }),
        {
          headers: { 'Content-Type': 'text/event-stream' },
          status: 200,
        },
      );

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const chunksRecebidos: string[] = [];
      const onMode = vi.fn();
      let finalizou = false;

      await streamGuiaTuristico(
        { destino: 'Recife' },
        {
          onMode,
          onChunk: (chunk) => chunksRecebidos.push(chunk),
          onDone: (fullText) => {
            finalizou = true;
            expect(fullText).toBe('Recife é a Veneza Brasileira. ');
          },
          onError: vi.fn(),
        },
      );

      expect(chunksRecebidos).toEqual(['Recife é a ', 'Veneza Brasileira. ']);
      expect(onMode).toHaveBeenCalledWith('sse');
      expect(finalizou).toBe(true);
    });

    it('ativa streaming de fallback progressivo quando o endpoint responde 404', async () => {
      const mockResponse = new Response('Not Found', { status: 404 });
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const chunksRecebidos: string[] = [];
      const onMode = vi.fn();
      let textoConcluido = '';

      const fallbackText = '📍 Pontos turísticos: Marco Zero e Olinda.';

      await streamGuiaTuristico(
        { destino: 'Recife' },
        {
          onMode,
          onChunk: (chunk) => chunksRecebidos.push(chunk),
          onDone: (full) => {
            textoConcluido = full;
          },
          onError: vi.fn(),
        },
        {
          fallbackText,
          fallbackTokenDelayMs: 0, // Instantâneo para teste
        },
      );

      expect(chunksRecebidos.join('')).toBe(fallbackText);
      expect(onMode).toHaveBeenCalledWith('fallback');
      expect(textoConcluido).toBe(fallbackText);
    });

    it('trata encerramento SSE sem done como falha, sem afirmar conclusão', async () => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        new Response(
          new ReadableStream({
            start(controller) {
              controller.enqueue(
                new TextEncoder().encode('data: {"chunk":"Parcial","done":false}\n\n'),
              );
              controller.close();
            },
          }),
          { headers: { 'Content-Type': 'text/event-stream' } },
        ),
      );
      const onDone = vi.fn();
      const onError = vi.fn();
      await streamGuiaTuristico(
        { destino: 'Recife' },
        {
          onChunk: vi.fn(),
          onDone,
          onError,
        },
        { fallbackText: 'Conteúdo anterior' },
      );
      expect(onDone).not.toHaveBeenCalled();
      expect(onError).toHaveBeenCalledOnce();
    });

    it('interrompe imediatamente sem erro quando o sinal de cancelamento é acionado', async () => {
      const controller = new AbortController();
      controller.abort();

      const onChunk = vi.fn();
      const onDone = vi.fn();
      const onError = vi.fn();

      await streamGuiaTuristico(
        { destino: 'Recife' },
        { onChunk, onDone, onError },
        { signal: controller.signal, fallbackText: 'Texto' },
      );

      expect(onChunk).not.toHaveBeenCalled();
      expect(onDone).not.toHaveBeenCalled();
      expect(onError).not.toHaveBeenCalled();
    });

    it('chama onError se a requisição falha e não há fallbackText', async () => {
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));

      const onError = vi.fn();

      await streamGuiaTuristico(
        { destino: 'Recife' },
        {
          onChunk: vi.fn(),
          onDone: vi.fn(),
          onError,
        },
      );

      expect(onError).toHaveBeenCalledWith(expect.any(Error));
    });
  });
});
