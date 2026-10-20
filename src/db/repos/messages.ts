import type { HomieDatabase } from '../connection.js';

export type StoredMessage = {
  id: number; rol: 'user' | 'assistant' | 'tool' | 'system';
  contenido: string; tool_name: string | null; tool_calls: string | null;
};

export function saveMessage(db: HomieDatabase, userId: number, role: StoredMessage['rol'], content: string, options: { toolName?: string; toolCalls?: string } = {}): number {
  const result = db.prepare('INSERT INTO mensajes(usuario_id, rol, contenido, tool_name, tool_calls) VALUES (?, ?, ?, ?, ?)')
    .run(userId, role, content, options.toolName ?? null, options.toolCalls ?? null);
  return Number(result.lastInsertRowid);
}

export function recentMessages(db: HomieDatabase, userId: number, limit: number): StoredMessage[] {
  if (limit === 0) return [];
  const rows = db.prepare('SELECT id, rol, contenido, tool_name, tool_calls FROM mensajes WHERE usuario_id = ? ORDER BY id DESC LIMIT ?')
    .all(userId, limit) as StoredMessage[];
  return rows.reverse();
}
