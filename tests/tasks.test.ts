import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { calculateReminder, parseLocalDate } from '../src/core/time.js';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { createTask, listTasks } from '../src/db/repos/tasks.js';

test('fecha local, recordatorio automático y validación estricta', () => {
  const time = calculateReminder('2026-10-23T15:00', undefined, 'America/Mexico_City', '09:00', 30);
  assert.equal(time.due?.iso, '2026-10-23T21:00:00.000Z');
  assert.equal(time.remindAt, '2026-10-23T20:30:00.000Z');
  const day = calculateReminder('2026-10-23', undefined, 'America/Mexico_City', '09:00', 30);
  assert.equal(day.due?.hasTime, false);
  assert.equal(day.remindAt, '2026-10-23T15:00:00.000Z');
  assert.equal(calculateReminder(undefined,undefined,'America/Mexico_City','09:00',30).remindAt,null);
  assert.throws(() => parseLocalDate('2026-02-30','America/Mexico_City'));
  assert.throws(() => parseLocalDate('2026-10-23T25:00','America/Mexico_City'));
  assert.throws(() => calculateReminder(undefined,'2026-10-23','America/Mexico_City','09:00',30));
});

test('cada usuario solo ve sus propios pendientes nuevos', () => {
  const dir = mkdtempSync(join(tmpdir(), 'homie-tasks-'));
  const db = openDatabase(join(dir, 'tasks.db'));
  try {
    migrate(db,111);
    const task = createTask(db,111,{ titulo:'Pagar luz',prioridad:'alta',fecha_limite:null,tiene_hora:false,recordar_en:null });
    assert.equal(task.titulo,'Pagar luz');
    assert.equal(listTasks(db,111).length,1);
    assert.equal(listTasks(db,222).length,0);
  } finally { db.close(); rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200}); }
});
