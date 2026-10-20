import { config } from '../../config.js';
import { logger } from '../../logger.js';
import type { HomieDatabase } from '../../db/connection.js';
import { saveMessage } from '../../db/repos/messages.js';
import { chatWithOllama, type ChatMessage } from '../llm/ollama.js';
import { runTool, toolDefinitions, type ToolResult } from '../tools/index.js';
import { findReference } from '../references/semantic.js';
import { buildContext } from './context.js';
import { SequentialQueue } from './queue.js';

const queue = new SequentialQueue();
export type ChatResult = { texto: string; acciones: string[] };

export function chat(db: HomieDatabase, userId: number, text: string): Promise<ChatResult> {
  const queuedAt = Date.now();
  logger.info({ userId, chars: text.length }, 'Mensaje recibido · esperando turno');
  return queue.run(async () => {
    const started = Date.now();
    logger.info({ userId, queueMs: started - queuedAt }, 'Agente · procesando mensaje');
    try {
    saveMessage(db, userId, 'user', text);
    const messages: ChatMessage[] = buildContext(db, userId, config.TZ, config.HISTORY_MESSAGES);
    logger.debug({ userId, contextMessages: messages.length }, 'Contexto preparado');
    const acciones: string[] = [];
    for (let iteration = 0; iteration < config.MAX_TOOL_ITERATIONS; iteration++) {
      logger.info({ userId, iteration: iteration + 1 }, 'Ollama · iniciando iteración');
      const response = await chatWithOllama(messages, toolDefinitions);
      logger.info({ userId, iteration: iteration + 1, toolCalls: response.toolCalls.length }, 'Ollama · respuesta recibida');
      if (!response.toolCalls.length) {
        const texto = response.content || (acciones.length ? 'Listo, registré la acción.' : '¿Me lo puedes repetir?');
        saveMessage(db, userId, 'assistant', texto);
        logger.info({ userId, elapsedMs: Date.now() - started, actions: acciones.length }, 'Agente · respuesta finalizada');
        return { texto, acciones };
      }
      const assistantMessage: ChatMessage = { role: 'assistant', content: response.content, tool_calls: response.toolCalls };
      messages.push(assistantMessage);
      saveMessage(db, userId, 'assistant', response.content, { toolCalls: JSON.stringify(response.toolCalls) });
      for (const call of response.toolCalls) {
        const name = call.function.name;
        const raw = call.function.arguments;
        let args: unknown = raw;
        if (typeof raw === 'string') { try { args = JSON.parse(raw); } catch { args = null; } }
        const toolStarted = Date.now();
        logger.info({ userId, tool: name }, 'Herramienta · ejecutando');
        const outcome: ToolResult = name === 'buscar_referencia' && args && typeof args === 'object' &&
          typeof (args as {consulta?:unknown}).consulta === 'string'
          ? {result: await findReference(db,userId,(args as {consulta:string}).consulta,
              (['pendiente','recordatorio','todos'].includes(String((args as {tipo?:unknown}).tipo))
                ? (args as {tipo:'pendiente'|'recordatorio'|'todos'}).tipo : 'todos'))}
          : runTool(db, userId, name, args);
        logger.info({ userId, tool: name, elapsedMs: Date.now() - toolStarted, ok: (outcome.result as {ok?:boolean})?.ok }, 'Herramienta · completada');
        if (outcome.action) acciones.push(outcome.action);
        const content = JSON.stringify(outcome.result);
        messages.push({ role: 'tool', content, tool_name: name });
        saveMessage(db, userId, 'tool', content, { toolName: name });
      }
    }
    const texto = 'Procesé las acciones, pero alcancé el límite de operaciones. Revisa las confirmaciones anteriores.';
    saveMessage(db, userId, 'assistant', texto);
    logger.warn({ userId, elapsedMs: Date.now() - started }, 'Agente · límite de iteraciones alcanzado');
    return { texto, acciones };
    } catch (err) {
      logger.error({ err, userId, elapsedMs: Date.now() - started }, 'Agente · error de procesamiento');
      throw err;
    }
  });
}
