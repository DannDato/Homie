import type { HomieDatabase } from '../connection.js';

export type RollingSummary = { texto: string; hasta_mensaje_id: number };
export function getSummary(db: HomieDatabase, userId: number): RollingSummary {
  return (db.prepare('SELECT texto, hasta_mensaje_id FROM resumen WHERE usuario_id = ?').get(userId) as RollingSummary | undefined)
    ?? { texto: '', hasta_mensaje_id: 0 };
}
export function updateSummary(db: HomieDatabase, userId: number, text: string, untilMessageId: number): void {
  db.prepare(`INSERT INTO resumen(usuario_id,texto,hasta_mensaje_id) VALUES(?,?,?)
    ON CONFLICT(usuario_id) DO UPDATE SET texto=excluded.texto,hasta_mensaje_id=excluded.hasta_mensaje_id,
    actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(userId, text, untilMessageId);
}
