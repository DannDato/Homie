import test from 'node:test';
import assert from 'node:assert/strict';
import { listIntent } from '../src/adapters/telegram/intent.js';
import { renderAssistantText } from '../src/adapters/telegram/format.js';

test('natural language list requests route to UI', () => {
  for (const message of ['pendientes?', '¿Qué pendientes tengo hoy?', 'oye homie que tengo por hacer hoy?', 'muéstrame mis pendientes'])
    assert.equal(listIntent(message),'pendientes',message);
  assert.equal(listIntent('¿Qué recordatorios tengo hoy?'),'recordatorios');
  for (const message of ['lo del video', 'sobre lo de Adrian', 'actualiza el pendiente del video', 'agrega un pendiente', '¿Qué contexto hay sobre el video?'])
    assert.equal(listIntent(message),undefined,message);
});

test('assistant markdown renders as escaped Telegram HTML', () => {
  const result = renderAssistantText('### 🎯 Pendientes\n- **Prioridad:** Alta\n**Video <secreto> & canal**');
  assert.match(result,/<b>🎯 Pendientes<\/b>/);
  assert.match(result,/• <b>Prioridad:<\/b> Alta/);
  assert.match(result,/&lt;secreto&gt; &amp; canal/);
  assert.doesNotMatch(result,/\*\*|###/);
});
