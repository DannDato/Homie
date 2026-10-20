import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { SequentialQueue } from '../src/core/agent/queue.js';
test('serializa trabajos aun después de error', async () => {
  const queue = new SequentialQueue();
  const order: number[] = [];
  const a = queue.run(async () => { order.push(1); throw new Error('test'); });
  const b = queue.run(async () => { order.push(2); return 5; });
  await assert.rejects(a);
  assert.equal(await b, 5);
  assert.deepEqual(order, [1, 2]);
});
