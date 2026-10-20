import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../src/db/connection.js';
import { migrate } from '../src/db/migrate.js';
import { findUser, requestAccess, resolveRequest, resubmitRequest, updateUserStatus } from '../src/db/repos/users.js';
import { saveMessage, recentMessages } from '../src/db/repos/messages.js';

test('aprobación, rechazo, revocación y aislamiento entre usuarios', () => {
  const dir=mkdtempSync(join(tmpdir(),'homie-users-'));
  try {
    const db=openDatabase(join(dir,'db.sqlite'));
    migrate(db,111); migrate(db,111);
    assert.equal(findUser(db,111)?.estado,'autorizado');
    assert.equal(requestAccess(db,222,'Persona 2'),true);
    assert.equal(requestAccess(db,222,'Persona 2'),false);
    assert.equal(resolveRequest(db,222,'autorizado'),true);
    assert.equal(resolveRequest(db,222,'rechazado'),false);
    assert.equal(findUser(db,222)?.estado,'autorizado');
    saveMessage(db,111,'user','solo yo');
    saveMessage(db,222,'user','solo otra persona');
    assert.deepEqual(recentMessages(db,222,10).map(m=>m.contenido),['solo otra persona']);
    assert.equal(updateUserStatus(db,222,'bloqueado'),true);
    assert.equal(requestAccess(db,222,'Intento'),false);
    assert.equal(resubmitRequest(db,222),false);
    assert.equal(requestAccess(db,333,'Otra'),true);
    assert.equal(resolveRequest(db,333,'rechazado'),true);
    assert.equal(resubmitRequest(db,333),true);
    assert.equal(findUser(db,333)?.estado,'pendiente');
    assert.equal(findUser(db,111)?.estado,'autorizado');
    db.close();
  } finally { rmSync(dir,{recursive:true,force:true}); }
});
