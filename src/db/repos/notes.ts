import type { HomieDatabase } from '../connection.js';

export type NoteRow = { id: number; texto: string; etiquetas: string | null; creado: string };
export function latestNotes(db: HomieDatabase, userId: number, limit = 5): NoteRow[] {
  return db.prepare('SELECT id, texto, etiquetas, creado FROM notas WHERE usuario_id = ? ORDER BY id DESC LIMIT ?').all(userId, limit) as NoteRow[];
}

// FTS busca coincidencias globalmente, pero el JOIN filtra el propietario ANTES de entregar resultados.
export function searchNotes(db: HomieDatabase, userId: number, query: string, limit = 5): NoteRow[] {
  return db.prepare(`SELECT n.id,n.texto,n.etiquetas,n.creado FROM notas_fts
    JOIN notas n ON n.id=notas_fts.rowid WHERE n.usuario_id=? AND notas_fts MATCH ?
    ORDER BY bm25(notas_fts) LIMIT ?`).all(userId, query, limit) as NoteRow[];
}
