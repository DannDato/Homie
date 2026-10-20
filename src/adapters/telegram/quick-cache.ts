import type { HomieDatabase } from '../../db/connection.js';
import type { View } from './ui.js';

// Cached views are per-user; same-connection writes and external SQLite writes invalidate them.
const entries = new Map<string, { view: View; expires: number; changes: number; version: number }>();
const TTL_MS = 15_000;
const MAX_ENTRIES = 128;
export function cachedView(db: HomieDatabase, userId: number, route: string, build: () => View): { view: View; hit: boolean } {
  const key = `${userId}:${route}`;
  const changes = (db.prepare('SELECT total_changes()').pluck().get() as number);
  const version = (db.pragma('data_version', { simple: true }) as number);
  const now = Date.now();
  const old = entries.get(key);
  if (old && old.expires > now && old.changes === changes && old.version === version) return { view: old.view, hit: true };
  const view = build();
  if (entries.size >= MAX_ENTRIES) entries.delete(entries.keys().next().value!);
  entries.set(key, { view, changes: (db.prepare('SELECT total_changes()').pluck().get() as number), version, expires: now + TTL_MS });
  return { view, hit: false };
}
