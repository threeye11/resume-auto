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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

test('连续失败达到阈值自动暂停，resume 后继续', async () => {
  const sch = createScheduler({ delayMs: () => 1, failStreakLimit: 2, onError: () => {} });
  const ran = [];
  const p = sch.run([
    async () => { ran.push(1); throw new Error('1'); },
    async () => { ran.push(2); throw new Error('2'); },
    async () => { ran.push(3); return 'ok'; }
  ]);
  await sleep(50);
  assert.equal(sch.state(), 'paused');
  assert.deepEqual(ran, [1, 2]);
  sch.resume();
  await p;
  assert.deepEqual(ran, [1, 2, 3]);
  assert.equal(sch.state(), 'idle');
});
