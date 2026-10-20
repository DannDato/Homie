import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { DateTime } from 'luxon';
import type { HomieDatabase } from '../../db/connection.js';
import { recentMessages } from '../../db/repos/messages.js';
import { getSummary } from '../../db/repos/summary.js';
import type { ChatMessage } from '../llm/ollama.js';

const template = readFileSync(fileURLToPath(new URL('../../prompts/system.md', import.meta.url)), 'utf8');

export function buildContext(db: HomieDatabase, userId: number, timezone: string, historyLimit: number, now = DateTime.now()): ChatMessage[] {
  const local = now.setZone(timezone).setLocale('es');
  const summary = getSummary(db, userId).texto;
  const prompt = template
    .replaceAll('{{dia_semana}}', local.toFormat('cccc'))
    .replaceAll('{{fecha_legible}}', local.toFormat("d 'de' LLLL 'de' yyyy"))
    .replaceAll('{{hora}}', local.toFormat('HH:mm'))
    .replaceAll('{{zona_horaria}}', timezone)
    .replaceAll('{{resumen}}', summary || 'Aún no hay resumen acumulado.');
  const history = recentMessages(db, userId, historyLimit)
    .filter((message): message is typeof message & { rol: 'user' | 'assistant' } => message.rol === 'user' || message.rol === 'assistant')
    .map(message => ({ role: message.rol, content: message.contenido }));
  return [{ role: 'system', content: prompt }, ...history];
}
