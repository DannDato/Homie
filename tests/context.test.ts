import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { createProcess, createReminder, addProgress } from '../src/db/repos/tasks.js';
import { addContext, listContext, setImportance, listActiveProcesses, listReminders } from '../src/db/repos/context.js';

test('contexto aislado por usuario, historial y orden por importancia/rezago',()=>{
 const dir=mkdtempSync(join(tmpdir(),'homie-context-'));const db=openDatabase(join(dir,'db.sqlite'));
 try {
  migrate(db,101);
  const a=createProcess(db,101,'Revisar video');const b=createProcess(db,101,'Organizar archivos');
  const reminder=createReminder(db,101,{titulo:'Pagar servicio',prioridad:'media',fecha_limite:null,tiene_hora:false,recordar_en:null});
  assert.equal(addContext(db,202,'pendiente',a.id,'Espiar'),undefined);
  assert.equal(addContext(db,101,'pendiente',a.id,'Miniatura anterior con mejor CTR'),1);
  assert.equal(addContext(db,101,'recordatorio',reminder,'Factura de octubre'),2);
  assert.equal(listContext(db,202,'pendiente',a.id),undefined);
  assert.equal(listContext(db,101,'pendiente',a.id)?.[0].texto,'Miniatura anterior con mejor CTR');
  assert.equal(listContext(db,101,'recordatorio',reminder)?.[0].texto,'Factura de octubre');
  assert.equal(setImportance(db,202,'pendiente',a.id,'alta'),false);
  assert.equal(setImportance(db,101,'pendiente',b.id,'alta'),true);
  assert.equal(listActiveProcesses(db,101)[0].id,b.id);
  addProgress(db,101,a.id,'Empecé revisión');
  assert.equal(listActiveProcesses(db,101).length,2);
  assert.equal(listReminders(db,202).length,0);
  migrate(db,101);
  assert.equal(listContext(db,101,'pendiente',a.id)?.length,1);
 } finally {db.close();rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
