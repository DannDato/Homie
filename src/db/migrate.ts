import type { HomieDatabase } from './connection.js';

function hasColumn(db: HomieDatabase, table: string, column: string): boolean {
  return (db.pragma(`table_info(${table})`) as { name: string }[]).some(c => c.name === column);
}

export function migrate(db: HomieDatabase, legacyOwnerId: number): void {
  db.transaction(() => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS mensajes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
        rol TEXT NOT NULL CHECK (rol IN ('user','assistant','tool','system')),
        contenido TEXT NOT NULL, tool_name TEXT, tool_calls TEXT,
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE IF NOT EXISTS pendientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
        titulo TEXT NOT NULL,
        estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente','en_progreso','completado','cancelado')),
        prioridad TEXT NOT NULL DEFAULT 'media' CHECK (prioridad IN ('baja','media','alta')),
        fecha_limite TEXT, tiene_hora INTEGER NOT NULL DEFAULT 0,
        recordar_en TEXT, avisado_en TEXT, notas TEXT,
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        actualizado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        completado_en TEXT
      );
      CREATE TABLE IF NOT EXISTS notas (
        id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
        texto TEXT NOT NULL, etiquetas TEXT, embedding TEXT,
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE VIRTUAL TABLE IF NOT EXISTS notas_fts USING fts5(texto, etiquetas, content='notas', content_rowid='id');
      CREATE TABLE IF NOT EXISTS resumen (
        usuario_id INTEGER PRIMARY KEY,
        texto TEXT NOT NULL DEFAULT '', hasta_mensaje_id INTEGER NOT NULL DEFAULT 0,
        actualizado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE TABLE IF NOT EXISTS kv (
        usuario_id INTEGER NOT NULL, clave TEXT NOT NULL, valor TEXT NOT NULL,
        PRIMARY KEY(usuario_id, clave)
      );
    `);
    db.exec(`
      CREATE TABLE IF NOT EXISTS usuarios (
        telegram_id INTEGER PRIMARY KEY,
        nombre TEXT NOT NULL,
        estado TEXT NOT NULL CHECK (estado IN ('pendiente','autorizado','rechazado','bloqueado')),
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        actualizado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      );
      CREATE INDEX IF NOT EXISTS idx_usuarios_estado ON usuarios(estado);
    `);
    // El administrador queda autorizado incluso si ya existía una solicitud anterior.
    db.prepare(`INSERT INTO usuarios(telegram_id,nombre,estado) VALUES (?, 'Administrador', 'autorizado')
      ON CONFLICT(telegram_id) DO UPDATE SET estado='autorizado', actualizado=strftime('%Y-%m-%dT%H:%M:%fZ','now')`).run(legacyOwnerId);
    const legacy = ['mensajes', 'pendientes', 'notas'].filter(t => !hasColumn(db, t, 'usuario_id'));
    const legacySummary = !hasColumn(db, 'resumen', 'usuario_id');
    const legacyKv = !hasColumn(db, 'kv', 'usuario_id');
    if ((legacy.length || legacySummary || legacyKv) && !legacyOwnerId) {
      throw new Error('Para migrar datos anteriores, configura ALLOWED_TELEGRAM_USER_ID con el ID del propietario original.');
    }
    // En versiones anteriores los triggers pueden existir ya. Retirarlos
    // temporalmente impide que el UPDATE de propietario corrompa FTS5.
    if (legacy.includes('notas')) {
      db.exec('DROP TRIGGER IF EXISTS notas_ai; DROP TRIGGER IF EXISTS notas_ad; DROP TRIGGER IF EXISTS notas_au;');
    }
    for (const table of legacy) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN usuario_id INTEGER NOT NULL DEFAULT 0`);
      db.prepare(`UPDATE ${table} SET usuario_id = ? WHERE usuario_id = 0`).run(legacyOwnerId);
    }
    if (legacySummary) {
      db.exec(`ALTER TABLE resumen RENAME TO resumen_viejo;
        CREATE TABLE resumen (usuario_id INTEGER PRIMARY KEY, texto TEXT NOT NULL DEFAULT '', hasta_mensaje_id INTEGER NOT NULL DEFAULT 0,
          actualizado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')));`);
      db.prepare(`INSERT INTO resumen(usuario_id,texto,hasta_mensaje_id,actualizado) SELECT ?,texto,hasta_mensaje_id,COALESCE(actualizado, strftime('%Y-%m-%dT%H:%M:%fZ','now')) FROM resumen_viejo WHERE id=1`).run(legacyOwnerId);
      db.exec('DROP TABLE resumen_viejo');
    }
    if (legacyKv) {
      db.exec(`ALTER TABLE kv RENAME TO kv_viejo;
        CREATE TABLE kv (usuario_id INTEGER NOT NULL, clave TEXT NOT NULL, valor TEXT NOT NULL, PRIMARY KEY(usuario_id,clave));`);
      db.prepare('INSERT INTO kv(usuario_id,clave,valor) SELECT ?,clave,valor FROM kv_viejo').run(legacyOwnerId);
      db.exec('DROP TABLE kv_viejo');
    }
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_msg_usuario ON mensajes(usuario_id,id);
      CREATE INDEX IF NOT EXISTS idx_pend_usuario_estado_fecha ON pendientes(usuario_id,estado,fecha_limite);
      CREATE INDEX IF NOT EXISTS idx_pend_usuario_recordar ON pendientes(usuario_id,estado,recordar_en,avisado_en);
      CREATE INDEX IF NOT EXISTS idx_notas_usuario ON notas(usuario_id,id);
    `);
    // PATCH 011: los registros creados con la herramienta antigua son recordatorios,
    // no procesos. Migrar una sola vez, sin perder fechas ni propietarios.
    db.exec(`
      CREATE TABLE IF NOT EXISTS recordatorios (
        id INTEGER PRIMARY KEY, usuario_id INTEGER NOT NULL, titulo TEXT NOT NULL,
        estado TEXT NOT NULL, prioridad TEXT NOT NULL, fecha_limite TEXT,
        tiene_hora INTEGER NOT NULL DEFAULT 0, recordar_en TEXT, avisado_en TEXT,
        notas TEXT, creado TEXT NOT NULL, actualizado TEXT NOT NULL, completado_en TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_recordatorios_usuario ON recordatorios(usuario_id, recordar_en);
      CREATE TABLE IF NOT EXISTS homie_migraciones (clave TEXT PRIMARY KEY);
      CREATE TABLE IF NOT EXISTS pendientes_avances (
        id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL,
        pendiente_id INTEGER NOT NULL, texto TEXT NOT NULL,
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        FOREIGN KEY(pendiente_id) REFERENCES pendientes(id) ON DELETE CASCADE
      );
      CREATE INDEX IF NOT EXISTS idx_avances_usuario_pendiente ON pendientes_avances(usuario_id,pendiente_id,id);
    `);
    if (!db.prepare("SELECT 1 FROM homie_migraciones WHERE clave='separar_recordatorios_011'").get()) {
      db.exec(`INSERT INTO recordatorios (id,usuario_id,titulo,estado,prioridad,fecha_limite,tiene_hora,recordar_en,avisado_en,notas,creado,actualizado,completado_en)
        SELECT id,usuario_id,titulo,estado,prioridad,fecha_limite,tiene_hora,recordar_en,avisado_en,notas,COALESCE(creado,strftime('%Y-%m-%dT%H:%M:%fZ','now')),COALESCE(actualizado,strftime('%Y-%m-%dT%H:%M:%fZ','now')),completado_en FROM pendientes;
        DELETE FROM pendientes;
        INSERT INTO homie_migraciones(clave) VALUES ('separar_recordatorios_011');`);
    }
    // Contexto libre vinculado a un único elemento. No sustituye los avances.
    db.exec(`
      CREATE TABLE IF NOT EXISTS contextos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        usuario_id INTEGER NOT NULL,
        pendiente_id INTEGER REFERENCES pendientes(id) ON DELETE CASCADE,
        recordatorio_id INTEGER REFERENCES recordatorios(id) ON DELETE CASCADE,
        texto TEXT NOT NULL CHECK(length(trim(texto)) > 0),
        creado TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        CHECK ((pendiente_id IS NOT NULL) != (recordatorio_id IS NOT NULL))
      );
      CREATE INDEX IF NOT EXISTS idx_contextos_pendiente ON contextos(usuario_id,pendiente_id,id);
      CREATE INDEX IF NOT EXISTS idx_contextos_recordatorio ON contextos(usuario_id,recordatorio_id,id);
      CREATE INDEX IF NOT EXISTS idx_pendientes_prioridad_antiguedad ON pendientes(usuario_id,estado,prioridad,creado);
      CREATE INDEX IF NOT EXISTS idx_recordatorios_fecha_usuario ON recordatorios(usuario_id,estado,fecha_limite);
    `);
    // Vectores opcionales por usuario; una modificación del elemento invalida su hash.
    db.exec(`CREATE TABLE IF NOT EXISTS referencias_embeddings (
      usuario_id INTEGER NOT NULL, tipo TEXT NOT NULL CHECK(tipo IN ('pendiente','recordatorio')),
      elemento_id INTEGER NOT NULL, modelo TEXT NOT NULL, hash TEXT NOT NULL, vector TEXT NOT NULL,
      PRIMARY KEY(usuario_id,tipo,elemento_id,modelo)
    );`);
    // Los triggers no deben ejecutarse durante la asignacion inicial de usuario_id:
    // las notas heredadas aun no existen en el indice invertido de FTS5.
    // Reconstruimos antes de activar los triggers, incluso si estos ya existian.
    if (legacy.includes('notas')) {
      db.exec("INSERT INTO notas_fts(notas_fts) VALUES ('rebuild')");
    }
    db.exec(`
      CREATE TRIGGER IF NOT EXISTS notas_ai AFTER INSERT ON notas BEGIN
        INSERT INTO notas_fts(rowid, texto, etiquetas) VALUES (new.id, new.texto, new.etiquetas);
      END;
      CREATE TRIGGER IF NOT EXISTS notas_ad AFTER DELETE ON notas BEGIN
        INSERT INTO notas_fts(notas_fts, rowid, texto, etiquetas) VALUES ('delete', old.id, old.texto, old.etiquetas);
      END;
      CREATE TRIGGER IF NOT EXISTS notas_au AFTER UPDATE ON notas BEGIN
        INSERT INTO notas_fts(notas_fts, rowid, texto, etiquetas) VALUES ('delete', old.id, old.texto, old.etiquetas);
        INSERT INTO notas_fts(rowid, texto, etiquetas) VALUES (new.id, new.texto, new.etiquetas);
      END;
    `);
  })();
}
