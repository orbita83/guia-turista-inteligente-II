import type { GuiaStreamPayload, StreamTelemetryUpdate } from '../types/domain';
import { API_BASE_URL } from '../config';
import { parseProcessTime, parseRequestId } from './api';
import { formatSessionStartedAt, unavailableValue } from './telemetry';

export interface StreamingCallbacks {
  onMode?: (mode: 'sse' | 'fallback') => void;
  /** Chamado a cada fragmento textual recebido (RN-GUI-007) */
  onChunk: (chunk: string) => void;
  /** Substitui o texto parcial pelo conteúdo definitivo de contingência. */
  onReplace?: (text: string) => void;
  /** Chamado quando a transmissão conclui com sucesso (RN-GUI-006, CA-GUI-002) */
  onDone: (fullText: string) => void;
  /** Chamado em caso de erro terminal não recuperável */
  onError: (error: Error) => void;
  /** Atualização de telemetria em tempo real pelo canal SSE */
  onTelemetry?: (update: StreamTelemetryUpdate) => void;
}

export interface StreamingOptions {
  signal?: AbortSignal;
  /**
   * Texto de contingência para streaming fluido caso o endpoint /stream-guia
   * ainda não esteja disponível ou em modo offline.
   */
  fallbackText?: string;
  /** Delay em milissegundos entre emissões no modo simulado/fallback */
  fallbackTokenDelayMs?: number;
}

export type GuideEvent =
  | { type: 'chunk'; chunk: string; done: boolean }
  | { type: 'replace'; text: string }
  | { type: 'done'; diagnosticoIa?: Record<string, unknown> }
  | { type: 'telemetry'; data: Record<string, unknown> }
  | { type: 'error'; message: string };

export function parseGuideEvent(block: string): GuideEvent | null {
  let event = '';
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  if (data.length === 0) return null;

  let payload: Record<string, unknown>;
  try {
    const parsed: unknown = JSON.parse(data.join('\n'));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    payload = parsed as Record<string, unknown>;
  } catch {
    throw new Error('Evento SSE com JSON inválido.');
  }

  if (event === 'error') {
    return {
      type: 'error',
      message: typeof payload.message === 'string' ? payload.message : 'Falha ao gerar o guia.',
    };
  }
  if (event === 'telemetry') {
    return { type: 'telemetry', data: payload };
  }
  if (event === 'replace') {
    if (typeof payload.text !== 'string') throw new Error('Evento replace sem texto válido.');
    return { type: 'replace', text: payload.text };
  }
  if (event === 'done') {
    const diag =
      typeof payload.diagnostico_ia === 'object' &&
      payload.diagnostico_ia !== null &&
      !Array.isArray(payload.diagnostico_ia)
        ? (payload.diagnostico_ia as Record<string, unknown>)
        : undefined;
    return { type: 'done', diagnosticoIa: diag };
  }
  if (event && event !== 'chunk' && event !== 'message') return null;
  if (payload.chunk !== undefined && typeof payload.chunk !== 'string') {
    throw new Error('Evento SSE com fragmento inválido.');
  }
  return {
    type: 'chunk',
    chunk: typeof payload.chunk === 'string' ? payload.chunk : '',
    done: payload.done === true,
  };
}

/** Compatibilidade com os frames data: {"chunk": "...", "done": boolean}. */
export function parseSseBlock(block: string): { chunk: string; done: boolean } | null {
  const parsed = parseGuideEvent(block);
  if (parsed?.type === 'chunk') return { chunk: parsed.chunk, done: parsed.done };
  if (parsed?.type === 'done') return { chunk: '', done: true };
  return null;
}

/**
 * Utilitário de espera respeitando sinal de cancelamento.
 */
function waitWithSignal(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(new DOMException('Aborted', 'AbortError'));
      return;
    }
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);

    function onAbort() {
      clearTimeout(timeout);
      reject(new DOMException('Aborted', 'AbortError'));
    }

    signal?.addEventListener('abort', onAbort);
  });
}

/**
 * Executa o streaming progressivo de fallback a partir de um texto base existente
 * (ex.: viagem.dicas_destino), particionando em tokens para conferir feedback visual em tempo real.
 */
async function executarFallbackProgressivo(
  texto: string,
  callbacks: StreamingCallbacks,
  options?: StreamingOptions,
): Promise<void> {
  const signal = options?.signal;
  const isTest =
    Boolean(import.meta.env?.MODE === 'test') ||
    (typeof process !== 'undefined' &&
      (process.env?.NODE_ENV === 'test' || Boolean(process.env?.VITEST)));
  const delayMs = options?.fallbackTokenDelayMs ?? (isTest ? 0 : 25);

  // Divide o texto em fragmentos (por palavras/espaços) para fluxo natural
  const regexTokens = /(\S+\s*|\n+)/g;
  const tokens = texto.match(regexTokens) || [texto];
  let acumulado = '';

  for (const token of tokens) {
    if (signal?.aborted) return;
    acumulado += token;
    callbacks.onChunk(token);
    if (delayMs > 0) {
      try {
        await waitWithSignal(delayMs, signal);
      } catch {
        return;
      }
    }
  }

  if (!signal?.aborted) {
    callbacks.onDone(acumulado);
  }
}

/**
 * Consome SSE com confirmação explícita de término. A animação legada só é usada
 * em 404/501 ou falha de rede antes de receber uma resposta HTTP.
 */
export async function streamGuiaTuristico(
  payload: GuiaStreamPayload,
  callbacks: StreamingCallbacks,
  options?: StreamingOptions,
): Promise<void> {
  const signal = options?.signal;
  if (signal?.aborted) return;
  let emittedSseChunk = false;

  const startedAt = performance.now();
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}/roteiros/stream-guia`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      body: JSON.stringify(payload),
      signal,
    });
  } catch (err: unknown) {
    if (signal?.aborted || (err instanceof Error && err.name === 'AbortError')) return;
    if (options?.fallbackText) {
      await executarFallbackProgressivo(options.fallbackText, callbacks, options);
    } else {
      callbacks.onError(err instanceof Error ? err : new Error(String(err)));
    }
    return;
  }

    // Se o endpoint estiver disponível e retornar text/event-stream com sucesso
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('text/event-stream') && response.body) {
      callbacks.onMode?.('sse');
      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let fullText = '';

      while (true) {
        if (signal?.aborted) {
          await reader.cancel();
          return;
        }

        const { done: streamDone, value } = await reader.read();
        if (streamDone) break;

        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split('\n\n');
        // Mantém no buffer o último trecho que pode estar incompleto
        buffer = events.pop() || '';

        for (const event of events) {
          const parsed = parseSseBlock(event);
          if (parsed) {
            if (parsed.chunk) {
              emittedSseChunk = true;
              fullText += parsed.chunk;
              callbacks.onChunk(parsed.chunk);
            }
            if (parsed.done) {
              callbacks.onDone(fullText);
              return;
            }
          }
        }
      }

      // Processa eventual remanescente no buffer
      if (buffer.trim()) {
        const parsed = parseSseBlock(buffer);
        if (parsed?.chunk) {
          emittedSseChunk = true;
          fullText += parsed.chunk;
          callbacks.onChunk(parsed.chunk);
        }
      }

      throw new Error('Transmissão encerrada sem confirmação de conclusão.');
    }

    // Se o backend retornou 404, 501 ou outro status (endpoint ainda em desenvolvimento)
    if (options?.fallbackText) {
      callbacks.onMode?.('fallback');
      await executarFallbackProgressivo(options.fallbackText, callbacks, options);
      return;
    }

      let separator: RegExpExecArray | null;
      while ((separator = /\r?\n\r?\n/.exec(buffer))) {
        if (signal?.aborted) return;
        const block = buffer.slice(0, separator.index);
        buffer = buffer.slice(separator.index + separator[0].length);
        const event = parseGuideEvent(block);
        if (!event) continue;
        if (event.type === 'error') throw new Error(event.message);
        if (event.type === 'telemetry') {
          const sessionPayload = event.data.session as Record<string, unknown> | undefined;
          const remoteReqId =
            typeof event.data.requestId === 'string' && event.data.requestId.trim() !== ''
              ? parseRequestId(event.data.requestId)
              : requestIdHeader;
          const sessionStarted = sessionPayload?.sessionStartedAt;
          const sessionDur = sessionPayload?.sessionDurationMs;
          const diag =
            typeof event.data.diagnostico_ia === 'object' &&
            event.data.diagnostico_ia !== null &&
            !Array.isArray(event.data.diagnostico_ia)
              ? (event.data.diagnostico_ia as Record<string, unknown>)
              : undefined;

    // Em falha de rede/conexão, ativa fallback progressivo se disponível
    if (options?.fallbackText && !emittedSseChunk && !signal?.aborted) {
      callbacks.onMode?.('fallback');
      await executarFallbackProgressivo(options.fallbackText, callbacks, options);
      return;
    }
  } catch (err: unknown) {
    if (!signal?.aborted) callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  } finally {
    signal?.removeEventListener('abort', onAbort);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
