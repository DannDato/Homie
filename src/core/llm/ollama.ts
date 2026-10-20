import { config } from '../../config.js';
import { logger } from '../../logger.js';

export type ToolCall = { function: { name: string; arguments: unknown } };
export type ChatMessage = { role: 'system' | 'user' | 'assistant' | 'tool'; content: string; tool_name?: string; tool_calls?: ToolCall[] };
export type ChatResponse = { content: string; toolCalls: ToolCall[] };

export async function chatWithOllama(messages: ChatMessage[], tools?: readonly unknown[]): Promise<ChatResponse> {
  const started = Date.now();
  logger.debug({ model: config.OLLAMA_MODEL, messages: messages.length, tools: tools?.length ?? 0 }, 'Ollama · enviando solicitud');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 180_000);
  try {
    const response = await fetch(`${config.OLLAMA_HOST.replace(/\/$/, '')}/api/chat`, {
      method: 'POST', signal: controller.signal,
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ model: config.OLLAMA_MODEL, messages, ...(tools ? { tools } : {}), stream: false, think: false,
        options: { num_ctx: config.OLLAMA_NUM_CTX, temperature: config.OLLAMA_TEMPERATURE }, keep_alive: config.OLLAMA_KEEP_ALIVE })
    });
    logger.debug({ status: response.status, elapsedMs: Date.now() - started }, 'Ollama · HTTP recibido');
    if (!response.ok) throw new Error(`Ollama respondió HTTP ${response.status}`);
    const data: unknown = await response.json();
    if (!data || typeof data !== 'object' || !('message' in data)) throw new Error('Respuesta inesperada de Ollama');
    const message = (data as { message?: { content?: unknown; tool_calls?: unknown } }).message;
    if (!message || typeof message.content !== 'string') throw new Error('Ollama no devolvió un mensaje válido');
    const calls = Array.isArray(message.tool_calls) ? message.tool_calls.filter((item): item is ToolCall =>
      !!item && typeof item === 'object' && 'function' in item && !!item.function &&
      typeof item.function === 'object' && 'name' in item.function && typeof item.function.name === 'string') : [];
    logger.debug({ elapsedMs: Date.now() - started, chars: message.content.length, toolCalls: calls.length }, 'Ollama · respuesta interpretada');
    return { content: message.content.trim(), toolCalls: calls };
  } catch (err) {
    logger.error({ err, elapsedMs: Date.now() - started }, 'Ollama · solicitud fallida');
    throw err;
  } finally { clearTimeout(timeout); }
}

export async function checkOllama(): Promise<boolean> {
  try {
    const response = await fetch(`${config.OLLAMA_HOST.replace(/\/$/, '')}/api/tags`, { signal: AbortSignal.timeout(5000) });
    return response.ok;
  } catch { return false; }
}
