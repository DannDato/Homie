import test from 'node:test';
import assert from 'node:assert/strict';
import { quickIntent } from '../src/adapters/telegram/intent.js';
import { cachedView } from '../src/adapters/telegram/quick-cache.js';
import { InlineKeyboard } from 'grammy';
import Database from 'better-sqlite3';

test('router recognizes day plans, lists and safe fallbacks', () => {
  for (const s of ['¿qué debo hacer hoy?', 'oye homie que tengo que hacer mañana?', '¿qué tengo por hacer hoy?', 'plan para mañana'])
    assert.ok(quickIntent(s)==='hoy'||quickIntent(s)==='manana',s);
  assert.equal(quickIntent('¿qué pendientes tengo?'),'pendientes');
  assert.equal(quickIntent('¿qué recordatorios tengo?'),'recordatorios');
  for (const s of ['Lo del video', 'agrega un pendiente mañana', 'lo de Adrián, actualiza el contexto', 'recuérdame algo mañana'])
    assert.equal(quickIntent(s),undefined,s);
});

test('cache isolates users and invalidates on database writes', () => {
  const db=new Database(':memory:');
  try {
    db.exec('CREATE TABLE demo (id INTEGER)');
    let builds=0;
    const make=()=>{builds++;return {text:String(builds),keyboard:new InlineKeyboard()};};
    assert.equal(cachedView(db,1,'hoy',make).hit,false);
    assert.equal(cachedView(db,1,'hoy',make).hit,true);
    assert.equal(cachedView(db,2,'hoy',make).hit,false);
    db.exec('INSERT INTO demo(id) VALUES(1)');
    assert.equal(cachedView(db,1,'hoy',make).hit,false);
    assert.equal(builds,3);
  } finally {db.close();}
});
