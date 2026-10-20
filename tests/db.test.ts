import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { saveMessage, recentMessages } from '../src/db/repos/messages.js';
import { getValue, setValue } from '../src/db/repos/kv.js';
import { getSummary, updateSummary } from '../src/db/repos/summary.js';
import { listTasks } from '../src/db/repos/tasks.js';
import { latestNotes, searchNotes } from '../src/db/repos/notes.js';

test('aislamiento entre usuarios, persistencia y migraciones idempotentes', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homie-'));
  const path = join(dir, 'nested', 'homie.db');
  try {
    let db = openDatabase(path);
    migrate(db, 111);
    migrate(db, 111);
    saveMessage(db, 111, 'user', 'mi secreto');
    saveMessage(db, 222, 'user', 'hola mundo');
    setValue(db, 111, 'telegram_chat_id', '111');
    setValue(db, 222, 'telegram_chat_id', '222');
    updateSummary(db, 111, 'secretos', 1);
    db.prepare('INSERT INTO pendientes(usuario_id,titulo) VALUES (?,?)').run(111,'mi pendiente');
    db.prepare('INSERT INTO notas(usuario_id,texto,etiquetas) VALUES (?,?,?)').run(111,'idea privada','ideas');
    db.close();
    db = openDatabase(path);
    migrate(db, 111);
    assert.deepEqual(recentMessages(db, 111, 10).map(m => m.contenido), ['mi secreto']);
    assert.deepEqual(recentMessages(db, 222, 10).map(m => m.contenido), ['hola mundo']);
    assert.equal(getValue(db, 111, 'telegram_chat_id'), '111');
    assert.equal(getValue(db, 222, 'telegram_chat_id'), '222');
    assert.equal(getSummary(db, 111).texto, 'secretos');
    assert.equal(getSummary(db, 222).texto, '');
    assert.equal(listTasks(db, 222).length, 0);
    assert.equal(latestNotes(db, 222).length, 0);
    assert.equal(searchNotes(db, 222, 'privada').length, 0);
    assert.equal(searchNotes(db, 111, 'privada').length, 1);
    db.close();
  } finally { rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 }); }
});

test('datos antiguos son asignados solamente al propietario original', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homie-legacy-'));
  const db = openDatabase(join(dir, 'old.db'));
  try {
    db.exec(`
      CREATE TABLE mensajes (id INTEGER PRIMARY KEY, rol TEXT NOT NULL, contenido TEXT NOT NULL, tool_name TEXT, tool_calls TEXT, creado TEXT);
      CREATE TABLE pendientes (id INTEGER PRIMARY KEY, titulo TEXT NOT NULL, estado TEXT DEFAULT 'pendiente', prioridad TEXT DEFAULT 'media', fecha_limite TEXT, tiene_hora INTEGER DEFAULT 0, recordar_en TEXT, avisado_en TEXT, notas TEXT, creado TEXT, actualizado TEXT, completado_en TEXT);
      CREATE TABLE notas (id INTEGER PRIMARY KEY, texto TEXT NOT NULL, etiquetas TEXT, embedding TEXT, creado TEXT);
      CREATE TABLE resumen (id INTEGER PRIMARY KEY, texto TEXT NOT NULL, hasta_mensaje_id INTEGER NOT NULL, actualizado TEXT);
      CREATE TABLE kv (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);
      INSERT INTO mensajes(id,rol,contenido) VALUES(1,'user','viejo secreto');
      INSERT INTO pendientes(id,titulo) VALUES(1,'pendiente antiguo');
      INSERT INTO notas(id,texto) VALUES(1,'nota antigua');
      INSERT INTO resumen(id,texto,hasta_mensaje_id) VALUES(1,'resumen anterior',1);
      INSERT INTO kv(clave,valor) VALUES('telegram_chat_id','888');
    `);
    migrate(db, 111);
    migrate(db, 111);
    assert.equal(recentMessages(db,111,10)[0].contenido,'viejo secreto');
    assert.equal(recentMessages(db,222,10).length,0);
    assert.equal(listTasks(db,111).length,0);
    assert.equal((db.prepare('SELECT COUNT(*) AS total FROM recordatorios WHERE usuario_id=111').get() as {total:number}).total,1);
    assert.equal(listTasks(db,222).length,0);
    assert.equal(latestNotes(db,222).length,0);
    assert.equal(searchNotes(db,111,'antigua').length,1);
    assert.equal(searchNotes(db,222,'antigua').length,0);
    assert.equal(getSummary(db,111).texto,'resumen anterior');
    assert.ok(db.prepare('SELECT actualizado FROM resumen WHERE usuario_id = ?').get(111));
    assert.equal(getSummary(db,222).texto,'');
    assert.equal(getValue(db,111,'telegram_chat_id'),'888');
    assert.equal(getValue(db,222,'telegram_chat_id'),null);
  } finally {
    db.close();
    rmSync(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
  }
});
