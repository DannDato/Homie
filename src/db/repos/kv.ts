import type { HomieDatabase } from '../connection.js';

export function getValue(db: HomieDatabase, userId: number, key: string): string | null {
  const row = db.prepare('SELECT valor FROM kv WHERE usuario_id = ? AND clave = ?').get(userId, key) as { valor: string } | undefined;
  return row?.valor ?? null;
}
export function setValue(db: HomieDatabase, userId: number, key: string, value: string): void {
  db.prepare('INSERT INTO kv(usuario_id,clave,valor) VALUES (?, ?, ?) ON CONFLICT(usuario_id,clave) DO UPDATE SET valor=excluded.valor').run(userId, key, value);
}
