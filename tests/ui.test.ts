import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { createProcess, addProgress } from '../src/db/repos/tasks.js';
import { processList, processDetail, reminderDetail } from '../src/adapters/telegram/ui.js';

test('listas y detalles interactivos están aislados por usuario y escapan HTML',()=>{
 const dir=mkdtempSync(join(tmpdir(),'homie-ui-'));const db=openDatabase(join(dir,'test.db'));
 try{
  migrate(db,1001);
  const t=createProcess(db,1001,'<Video & canal>','Descripción <privada>');
  addProgress(db,1001,t.id,'Avance <secreto>');
  assert.match(processList(db,1001,0).text,/&lt;Video &amp; canal&gt;/);
  assert.doesNotMatch(processList(db,1002,0).text,/Video/);
  assert.match(processDetail(db,1001,t.id)!.text,/Avance &lt;secreto&gt;/);
  assert.equal(processDetail(db,1002,t.id),undefined);
  assert.equal(reminderDetail(db,1002,12345),undefined);
 }finally{db.close();rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:100});}
});
