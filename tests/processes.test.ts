import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { createProcess, addProgress, completeProcess, listProgress, getTask, listTasks, createReminder } from '../src/db/repos/tasks.js';

test('procesos largos con avances y cierre, aislados por usuario', () => {
  const dir=mkdtempSync(join(tmpdir(),'homie-process-'));const db=openDatabase(join(dir,'db.sqlite'));
  try {
    migrate(db,111);
    const task=createProcess(db,111,'Revisión video YouTube','Revisar retención y miniatura');
    assert.equal(task.fecha_limite,null);assert.equal(task.recordar_en,null);
    assert.equal(task.estado,'pendiente');
    assert.equal(addProgress(db,222,task.id,'ataque'),undefined);
    assert.equal(addProgress(db,111,task.id,'Revisé audiencia')?.estado,'en_progreso');
    addProgress(db,111,task.id,'Cambié miniatura');
    assert.deepEqual(listProgress(db,111,task.id).map(x=>x.texto),['Revisé audiencia','Cambié miniatura']);
    assert.deepEqual(listProgress(db,222,task.id),[]);
    assert.equal(getTask(db,222,task.id),undefined);
    assert.equal(completeProcess(db,222,task.id),undefined);
    assert.equal(completeProcess(db,111,task.id)?.estado,'completado');
    assert.equal(addProgress(db,111,task.id,'Más avances'),undefined);
    assert.equal(listTasks(db,222).length,0);
    migrate(db,111);
    assert.equal(getTask(db,111,task.id)?.estado,'completado');
  } finally { db.close();rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200}); }
});

test('recordatorios y procesos van a tablas distintas, incluso después de migrar', () => {
  const dir=mkdtempSync(join(tmpdir(),'homie-separation-'));const db=openDatabase(join(dir,'db.sqlite'));
  try {
    migrate(db,111);
    // Simula registro hecho con el PATCH 010 antes de instalar el 011.
    db.prepare(`DELETE FROM homie_migraciones WHERE clave='separar_recordatorios_011'`).run();
    db.prepare(`INSERT INTO pendientes(usuario_id,titulo,recordar_en) VALUES(111,'Pagar luz','2026-10-23T15:00:00.000Z')`).run();
    migrate(db,111);
    assert.equal(listTasks(db,111).length,0);
    assert.equal((db.prepare('SELECT titulo FROM recordatorios WHERE usuario_id=111').get() as {titulo:string}).titulo,'Pagar luz');
    const pid=createProcess(db,111,'Editar video').id;
    const rid=createReminder(db,222,{titulo:'Comprar pan',prioridad:'media',fecha_limite:null,tiene_hora:false,recordar_en:null});
    migrate(db,111);
    assert.equal(getTask(db,111,pid)?.titulo,'Editar video');
    assert.equal((db.prepare('SELECT usuario_id FROM recordatorios WHERE id=?').get(rid) as {usuario_id:number}).usuario_id,222);
  } finally { db.close();rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200}); }
});
