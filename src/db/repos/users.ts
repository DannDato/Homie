import type { HomieDatabase } from '../connection.js';

export type UserStatus = 'pendiente' | 'autorizado' | 'rechazado' | 'bloqueado';
export type HomieUser = { telegram_id: number; nombre: string; estado: UserStatus; creado: string };

export function findUser(db: HomieDatabase, id: number): HomieUser | undefined {
  return db.prepare('SELECT telegram_id,nombre,estado,creado FROM usuarios WHERE telegram_id=?').get(id) as HomieUser | undefined;
}
export function listUsers(db: HomieDatabase): HomieUser[] {
  return db.prepare('SELECT telegram_id,nombre,estado,creado FROM usuarios ORDER BY creado DESC,telegram_id DESC').all() as HomieUser[];
}
export function requestAccess(db: HomieDatabase, id: number, name: string): boolean {
  // Solo las solicitudes nuevas pasan a pendiente. Las existentes no generan spam.
  const result = db.prepare("INSERT OR IGNORE INTO usuarios(telegram_id,nombre,estado) VALUES (?,?,'pendiente')").run(id,name);
  return result.changes > 0;
}
export function updateUserStatus(db: HomieDatabase, id: number, status: Exclude<UserStatus,'pendiente'>): boolean {
  return db.prepare("UPDATE usuarios SET estado=?, actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE telegram_id=?").run(status,id).changes > 0;
}
export function resolveRequest(db: HomieDatabase, id: number, status: 'autorizado'|'rechazado'): boolean {
  return db.prepare("UPDATE usuarios SET estado=?, actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE telegram_id=? AND estado='pendiente'").run(status,id).changes > 0;
}
export function resubmitRequest(db: HomieDatabase, id: number): boolean {
  return db.prepare("UPDATE usuarios SET estado='pendiente', actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE telegram_id=? AND estado='rechazado'").run(id).changes > 0;
}
