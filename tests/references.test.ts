import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase} from '../src/db/connection.js';
import {migrate} from '../src/db/migrate.js';
import {createProcess} from '../src/db/repos/tasks.js';
import {addContext} from '../src/db/repos/context.js';
import {getCandidates,lexicalRank,rankDecision,cosine} from '../src/core/references/index.js';

test('resuelve referencias naturales, busca contexto y mantiene aislamiento',()=>{
 const dir=mkdtempSync(join(tmpdir(),'homie-refs-'));const db=openDatabase(join(dir,'db.sqlite'));
 try {
  migrate(db,1);
  const video=createProcess(db,1,'Revisión de mi video de YouTube');
  const adrian=createProcess(db,1,'Ver con AdrianYT lo de ser mod en mi canal de Twitch');
  createProcess(db,2,'Arreglar el canal de Adrian');
  addContext(db,1,'pendiente',video.id,'Revisar miniatura CTR y pauta');
  const candidates=getCandidates(db,1);
  assert.equal(candidates.length,2);
  assert.equal(lexicalRank('sobre lo de Adrian',candidates)[0]?.id,adrian.id);
  assert.equal(lexicalRank('lo del video',candidates)[0]?.id,video.id);
  assert.equal(lexicalRank('lo de la miniatura',candidates)[0]?.id,video.id);
  assert.equal(rankDecision(lexicalRank('Adrian',candidates)).seguro,true);
  assert.equal(rankDecision(lexicalRank('video',candidates)).seguro,true);
  assert.equal(rankDecision(lexicalRank('algo completamente distinto',candidates)).seguro,false);
  const similar=createProcess(db,1,'Otro video para editar');
  assert.equal(rankDecision(lexicalRank('video',getCandidates(db,1))).seguro,false);
  assert.equal(cosine([1,0],[1,0]),1);
  assert.equal(cosine([1,0],[0,1]),0);
  migrate(db,1);
 }finally{db.close();rmSync(dir,{recursive:true,force:true,maxRetries:10,retryDelay:200});}
});
