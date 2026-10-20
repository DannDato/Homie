import assert from 'node:assert/strict';
import test from 'node:test';
import { startTyping } from '../src/adapters/telegram/typing.js';

test('activa typing inmediatamente y cancela al terminar', async () => {
  let sent = 0;
  const stop = startTyping(async () => { sent++; });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(sent, 1);
  stop();
  stop(); // cancelación idempotente
});

test('un fallo de Telegram no interrumpe el procesamiento', async () => {
  let errors = 0;
  const stop = startTyping(async () => { throw new Error('Telegram no disponible'); }, () => { errors++; });
  await new Promise(resolve => setImmediate(resolve));
  stop();
  assert.equal(errors, 1);
});
