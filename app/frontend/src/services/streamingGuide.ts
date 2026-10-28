import type { GuiaStreamPayload } from '../types/domain';

// TODO(backend): expor endpoint POST /api/v1/roteiros/stream-guia transmitindo eventos text/event-stream (SSE) com frames data: {"chunk": string, "done": boolean}\n\n.
// TODO(backend): incluir tratamento de timeout e cancelamento precoce no servidor via request.is_disconnected().

export interface StreamingCallbacks {
  /** Chamado a cada fragmento textual recebido (RN-GUI-007) */
  onChunk: (chunk: string) => void;
  /** Chamado quando a transmissão conclui com sucesso (RN-GUI-006, CA-GUI-002) */
  onDone: (fullText: string) => void;
  /** Chamado em caso de erro terminal não recuperável */
  onError: (error: Error) => void;
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

const API_BASE_URL = '/api/v1';

/**
 * Faz o parsing de um bloco de evento SSE no formato `data: {"chunk": "...", "done": boolean}`.
 */
export function parseSseBlock(block: string): { chunk: string; done: boolean } | null {
  const trimmed = block.trim();
  if (!trimmed) return null;

  for (const line of trimmed.split('\n')) {
    const cleanLine = line.trim();
    if (cleanLine.startsWith('data:')) {
      const jsonStr = cleanLine.slice(5).trim();
      try {
        const parsed = JSON.parse(jsonStr) as { chunk?: string; done?: boolean };
        return {
          chunk: typeof parsed.chunk === 'string' ? parsed.chunk : '',
          done: Boolean(parsed.done),
        };
      } catch {
        // Se não for JSON válido, tenta ler como texto puro do frame
        return {
          chunk: jsonStr,
          done: false,
        };
      }
    }
  }

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
// TODO(backend): quando o endpoint /stream-guia for concluído no backend, os fragmentos gerados pelo Gemini AI substituirão a leitura de fallback de dicas_destino.
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
 * Inicia o consumo do guia turístico em streaming (SSE) via POST /stream-guia.
 * Caso o endpoint retorne 404/501 ou falhe antes de iniciar, ativa o fallback inteligente
 * com animação progressiva do texto pré-existente sem quebrar a tela.
 */
export async function streamGuiaTuristico(
  payload: GuiaStreamPayload,
  callbacks: StreamingCallbacks,
  options?: StreamingOptions,
): Promise<void> {
  const signal = options?.signal;
  if (signal?.aborted) return;

  try {
    const response = await fetch(`${API_BASE_URL}/roteiros/stream-guia`, {
      method: 'POST',
      credentials: 'include',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'text/event-stream',
      },
      body: JSON.stringify(payload),
      signal,
    });

    // Se o endpoint estiver disponível e retornar text/event-stream com sucesso
    const contentType = response.headers.get('content-type') || '';
    if (response.ok && contentType.includes('text/event-stream') && response.body) {
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
          fullText += parsed.chunk;
          callbacks.onChunk(parsed.chunk);
        }
      }

      callbacks.onDone(fullText);
      return;
    }

    // Se o backend retornou 404, 501 ou outro status (endpoint ainda em desenvolvimento)
    if (options?.fallbackText) {
      await executarFallbackProgressivo(options.fallbackText, callbacks, options);
      return;
    }

    throw new Error(`Endpoint /stream-guia indisponível (HTTP ${response.status}).`);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === 'AbortError') {
      return;
    }

    // Em falha de rede/conexão, ativa fallback progressivo se disponível
    if (options?.fallbackText) {
      await executarFallbackProgressivo(options.fallbackText, callbacks, options);
      return;
    }

    callbacks.onError(err instanceof Error ? err : new Error(String(err)));
  }
}
