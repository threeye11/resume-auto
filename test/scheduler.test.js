import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createScheduler } from '../src/core/scheduler.js';

test('按序执行 job 并可 stop', async () => {
  const order = [];
  const sch = createScheduler({
    delayMs: () => 1,
    onError: () => {}
  });
  const p = sch.run([
    async () => { order.push(1); return 'ok'; },
    async () => { order.push(2); return 'ok'; }
  ]);
  await p;
  assert.deepEqual(order, [1, 2]);
  assert.equal(sch.state(), 'idle');
});

test('单步抛错不中断后续', async () => {
  const order = [];
  const errors = [];
  const sch = createScheduler({
    delayMs: () => 1,
    onError: (e, i) => errors.push({ e, i })
  });
  await sch.run([
    async () => { order.push('a'); throw new Error('boom'); },
    async () => { order.push('b'); return 'ok'; }
  ]);
  assert.deepEqual(order, ['a', 'b']);
  assert.equal(errors.length, 1);
  assert.equal(errors[0].i, 0);
});

test('连续失败达到阈值自动暂停', async () => {
  const sch = createScheduler({
    delayMs: () => 1,
    failStreakLimit: 2,
    onError: () => {}
  });
  await sch.run([
    async () => { throw new Error('1'); },
    async () => { throw new Error('2'); },
    async () => { throw new Error('3-not-run'); }
  ]);
  assert.equal(sch.state(), 'paused');
});
