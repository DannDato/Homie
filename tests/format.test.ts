import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { escapeHtml, splitMessage } from '../src/adapters/telegram/format.js';
test('escapa HTML dinámico', () => assert.equal(escapeHtml('<hola & "adiós">'), '&lt;hola &amp; &quot;adiós&quot;&gt;'));
test('parte respuestas largas sin perder contenido', () => {
  const value = 'a'.repeat(9500);
  const parts = splitMessage(value);
  assert.equal(parts.join(''), value);
  assert.ok(parts.every(s => s.length <= 3900));
});
