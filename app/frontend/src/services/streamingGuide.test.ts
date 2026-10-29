import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGuideEvent, parseSseBlock, streamGuiaTuristico } from './streamingGuide';

describe('streamingGuide service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('parseGuideEvent', () => {
    it('retorna null para blocos vazios', () => {
      expect(parseGuideEvent('')).toBeNull();
      expect(parseGuideEvent('\n\n')).toBeNull();
    });

    it('faz parsing de evento telemetry com payload estruturado', () => {
      const block =
        'event: telemetry\ndata: {"stage":"connected","requestId":"req-123","session":{"displayName":"Viajante"}}\n\n';
      const parsed = parseGuideEvent(block);
      expect(parsed).toEqual({
        type: 'telemetry',
        data: {
          stage: 'connected',
          requestId: 'req-123',
          session: {
            displayName: 'Viajante',
          },
        },
      });
    });

    it('faz parsing de evento replace com texto', () => {
      const block = 'event: replace\ndata: {"text":"Conteúdo de contingência"}\n\n';
      const parsed = parseGuideEvent(block);
      expect(parsed).toEqual({
        type: 'replace',
        text: 'Conteúdo de contingência',
      });
    });

    it('faz parsing de evento done com diagnostico_ia', () => {
      const block = 'event: done\ndata: {"done":true,"diagnostico_ia":{"modelo":"gemini-2.5"}}\n\n';
      const parsed = parseGuideEvent(block);
      expect(parsed).toEqual({
        type: 'done',
        diagnosticoIa: { modelo: 'gemini-2.5' },
      });
    });

    it('lança erro para JSON inválido', () => {
      expect(() => parseGuideEvent('data: {invalido\n\n')).toThrow('Evento SSE com JSON inválido.');
    });
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

    it('notifica onTelemetry nas fases connected, streaming e completed', async () => {
      const streamText =
        'event: telemetry\ndata: {"stage":"connected","requestId":"req-abc","session":{"userId":"usr-1","displayName":"Viajante","kind":"visitante","persistence":"temporaria","sessionStartedAt":"2026-10-28T21:00:00Z","sessionDurationMs":1234,"userTripCount":3}}\n\n' +
        'event: chunk\ndata: {"chunk": "Recife lindo! ", "done": false}\n\n' +
        'event: done\ndata: {"chunk": "", "done": true, "diagnostico_ia": {"tempo_resposta_ms": 150}}\n\n';

      const mockResponse = new Response(
        new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(streamText));
            controller.close();
          },
        }),
        {
          headers: {
            'Content-Type': 'text/event-stream',
            'X-Request-ID': 'req-abc',
            'X-Process-Time': '0.045',
          },
          status: 200,
        },
      );

      vi.spyOn(globalThis, 'fetch').mockResolvedValue(mockResponse);

      const telemetryUpdates: unknown[] = [];
      await streamGuiaTuristico(
        { destino: 'Recife' },
        {
          onChunk: vi.fn(),
          onDone: vi.fn(),
          onError: vi.fn(),
          onTelemetry: (update) => telemetryUpdates.push(update),
        },
      );

      expect(telemetryUpdates.length).toBeGreaterThanOrEqual(3);
      expect(telemetryUpdates[0]).toMatchObject({
        stage: 'connected',
        networkType: { available: true, value: 'SSE ativo' },
      });
      expect(telemetryUpdates[1]).toMatchObject({
        stage: 'connected',
        requestId: { available: true, value: 'req-abc' },
        session: {
          userId: 'usr-1',
          displayName: 'Viajante',
          kind: 'visitante',
          persistence: 'temporaria',
          userTripCount: 3,
        },
      });
      const lastUpdate = telemetryUpdates[telemetryUpdates.length - 1];
      expect(lastUpdate).toMatchObject({
        stage: 'completed',
      });
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

describe('streamingGuide: integridade do protocolo e cancelamento', () => {
  afterEach(() => vi.restoreAllMocks());

  function responder(partes: Uint8Array[]) {
    return new Response(
      new ReadableStream({
        start(controller) {
          partes.forEach((parte) => controller.enqueue(parte));
          controller.close();
        },
      }),
      { headers: { 'Content-Type': 'text/event-stream' } },
    );
  }

  const codificar = (texto: string) => new TextEncoder().encode(texto);
  const callbacks = () => ({
    onChunk: vi.fn(),
    onReplace: vi.fn(),
    onDone: vi.fn(),
    onError: vi.fn(),
  });

  it.each(['\n', '\r\n'])(
    'reconstitui UTF-8 e eventos fragmentados com separador %j',
    async (quebra) => {
      const texto = `: heartbeat${quebra}${quebra}event: chunk${quebra}data: {"chunk":"São Luís 🧭","done":false}${quebra}${quebra}event: done${quebra}data: {"chunk":"","done":true}${quebra}${quebra}`;
      const bytes = codificar(texto);
      // Um byte por pacote divide tanto caracteres multibyte quanto o delimitador SSE.
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        responder(Array.from(bytes, (byte) => Uint8Array.of(byte))),
      );
      const cb = callbacks();
      await streamGuiaTuristico({ destino: 'São Luís' }, cb);
      expect(cb.onChunk.mock.calls.flat().join('')).toBe('São Luís 🧭');
      expect(cb.onDone).toHaveBeenCalledWith('São Luís 🧭');
      expect(cb.onError).not.toHaveBeenCalled();
    },
  );

  it('substitui o texto parcial ao receber replace e conclui com a substituição', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responder([
        codificar(
          'event: chunk\ndata: {"chunk":"Parcial","done":false}\n\n' +
            'event: replace\ndata: {"text":"Guia de contingência"}\n\n' +
            'event: done\ndata: {"done":true}\n\n',
        ),
      ]),
    );
    const cb = callbacks();
    await streamGuiaTuristico({ destino: 'Recife' }, cb);
    expect(cb.onChunk.mock.calls).toEqual([['Parcial']]);
    expect(cb.onReplace).toHaveBeenCalledWith('Guia de contingência');
    expect(cb.onDone).toHaveBeenCalledWith('Guia de contingência');
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('trata error terminal após fragmentos sem declarar sucesso ou ativar fallback', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responder([
        codificar(
          'event: chunk\ndata: {"chunk":"Parcial","done":false}\n\n' +
            'event: error\ndata: {"code":"PROVIDER_ERROR","message":"Falha ao gerar o guia."}\n\n' +
            'event: done\ndata: {"done":true}\n\n',
        ),
      ]),
    );
    const cb = callbacks();
    await streamGuiaTuristico({ destino: 'Recife' }, cb, { fallbackText: 'Contingência' });
    expect(cb.onChunk.mock.calls).toEqual([['Parcial']]);
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Falha ao gerar o guia.' }),
    );
    expect(cb.onDone).not.toHaveBeenCalled();
  });

  it.each([409, 422, 500])(
    'mantém HTTP %i como erro mesmo com texto de contingência',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Falha', { status }));
      const cb = callbacks();
      await streamGuiaTuristico({ destino: 'Recife' }, cb, { fallbackText: 'Contingência' });
      expect(cb.onError).toHaveBeenCalledWith(
        expect.objectContaining({ message: expect.stringContaining(`HTTP ${status}`) }),
      );
      expect(cb.onChunk).not.toHaveBeenCalled();
      expect(cb.onDone).not.toHaveBeenCalled();
    },
  );

  it('recusa JSON inválido sem exibi-lo como texto ou concluir', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(responder([codificar('data: {invalido}\n\n')]));
    const cb = callbacks();
    await streamGuiaTuristico({ destino: 'Recife' }, cb, { fallbackText: 'Contingência' });
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('JSON') }),
    );
    expect(cb.onChunk).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
  });

  it('não considera EOF sem done uma conclusão bem-sucedida', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responder([codificar('data: {"chunk":"Parcial","done":false}\n\n')]),
    );
    const cb = callbacks();
    await streamGuiaTuristico({ destino: 'Recife' }, cb, { fallbackText: 'Contingência' });
    expect(cb.onChunk).toHaveBeenCalledWith('Parcial');
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('confirmação') }),
    );
    expect(cb.onDone).not.toHaveBeenCalled();
  });

  it('cancela uma leitura pendente e libera o stream sem novos callbacks', async () => {
    const abort = new AbortController();
    const cancelar = vi.fn();
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(codificar('data: {"chunk":"Parcial","done":false}\n\n'));
      },
      cancel: cancelar,
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    const cb = callbacks();
    const leitura = streamGuiaTuristico({ destino: 'Recife' }, cb, {
      signal: abort.signal,
      fallbackText: 'Contingência',
    });
    await vi.waitFor(() => expect(cb.onChunk).toHaveBeenCalledWith('Parcial'));
    abort.abort();
    await leitura;
    expect(cancelar).toHaveBeenCalledTimes(1);
    expect(stream.locked).toBe(false);
    expect(cb.onChunk.mock.calls).toEqual([['Parcial']]);
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('propaga falha de rede durante o corpo sem reiniciar com fallback', async () => {
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new Error('Conexão interrompida'));
      },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }),
    );
    const cb = callbacks();
    await streamGuiaTuristico({ destino: 'Recife' }, cb, { fallbackText: 'Contingência' });
    expect(cb.onError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Conexão interrompida' }),
    );
    expect(cb.onChunk).not.toHaveBeenCalled();
    expect(cb.onDone).not.toHaveBeenCalled();
  });
  it.each([404, 501])(
    'mantém compatibilidade de contingência somente para HTTP %i',
    async (status) => {
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('Indisponível', { status }));
      const cb = callbacks();
      await streamGuiaTuristico({ destino: 'Recife' }, cb, {
        fallbackText: 'Guia existente',
        fallbackTokenDelayMs: 0,
      });
      expect(cb.onChunk.mock.calls.flat().join('')).toBe('Guia existente');
      expect(cb.onDone).toHaveBeenCalledWith('Guia existente');
      expect(cb.onError).not.toHaveBeenCalled();
    },
  );

  it('usa o texto legado em falha de rede anterior à resposta HTTP', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new TypeError('Offline'));
    const cb = callbacks();
    await streamGuiaTuristico({ destino: 'Recife' }, cb, {
      fallbackText: 'Guia existente',
      fallbackTokenDelayMs: 0,
    });
    expect(cb.onDone).toHaveBeenCalledWith('Guia existente');
    expect(cb.onError).not.toHaveBeenCalled();
  });

  it('não emite conclusão de um pacote já recebido quando cancelado no primeiro fragmento', async () => {
    const abort = new AbortController();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      responder([
        codificar(
          'data: {"chunk":"Primeiro","done":false}\n\n' +
            'data: {"chunk":"Segundo","done":false}\n\n' +
            'data: {"done":true}\n\n',
        ),
      ]),
    );
    const cb = callbacks();
    cb.onChunk.mockImplementation(() => abort.abort());
    await streamGuiaTuristico({ destino: 'Recife' }, cb, { signal: abort.signal });
    expect(cb.onChunk.mock.calls).toEqual([['Primeiro']]);
    expect(cb.onDone).not.toHaveBeenCalled();
    expect(cb.onError).not.toHaveBeenCalled();
  });
});
