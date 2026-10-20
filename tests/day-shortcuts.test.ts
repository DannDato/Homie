import test from 'node:test';
import assert from 'node:assert/strict';
import { quickIntent, listIntent } from '../src/adapters/telegram/intent.js';

test('consultas cortas de hoy y mañana usan la vista diaria', () => {
  const today = ['hoy', 'hoy?', 'pa hoy?', 'hoy que hay?', 'que hay pa hoy?', '¿qué hay para hoy?', 'hoy qué tengo?', 'hoy que toca?', 'oye Homie, hoy?', 'plan de hoy', 'agenda para hoy', 'pendientes pa hoy'];
  const tomorrow = ['mañana?', 'mañana', 'pa mañana?', 'que hay pa mañana?', 'mañana que hay?', '¿qué hay para mañana?', 'mañana qué toca?', 'oye homie mañana?', 'plan para mañana', 'agenda de mañana', 'pendientes pa mañana'];
  for (const text of today) { assert.equal(quickIntent(text), 'hoy', text); assert.equal(listIntent(text), 'pendientes', text); }
  for (const text of tomorrow) { assert.equal(quickIntent(text), 'manana', text); assert.equal(listIntent(text), 'pendientes', text); }
});

test('evita tratar modificaciones y referencias específicas como vistas del día', () => {
  for (const text of ['mañana agrega un avance', 'hoy actualiza lo de Adrián', 'mañana reviso lo del video', 'pa mañana recuérdame llamar', '¿qué contexto tiene el pendiente del video?', 'mañana a las 3 pagar la luz', 'pasado mañana?', 'lo de Adrian mañana']) {
    assert.equal(quickIntent(text), undefined, text);
  }
  assert.equal(quickIntent('¿qué recordatorios tengo?'), 'recordatorios');
  assert.equal(quickIntent('¿qué pendientes tengo?'), 'pendientes');
});
