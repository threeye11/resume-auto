import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createStore } from '../src/core/store.js';

function memBackend() {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    del: (k) => m.delete(k)
  };
}

test('config 默认值与合并', () => {
  const s = createStore(memBackend());
  const c = s.getConfig();
  assert.equal(c.dailyLimit, 100);
  s.updateConfig({ dailyLimit: 30, greeting: '你好' });
  assert.equal(s.getConfig().dailyLimit, 30);
  assert.equal(s.getConfig().greeting, '你好');
  assert.equal(s.getConfig().jobInclude, '');
});

test('applied 去重写入', () => {
  const s = createStore(memBackend());
  s.markApplied('a');
  s.markApplied('a');
  s.markApplied('b');
  assert.deepEqual(s.getApplied().slice().sort(), ['a', 'b']);
});

test('quota 跨日清零', () => {
  const s = createStore(memBackend(), { today: () => '2099-01-01' });
  s.addQuota(1);
  s.addQuota(2);
  assert.equal(s.getQuota().count, 3);
  s.resetQuotaForDate('2099-01-01');
  assert.equal(s.getQuota().count, 0);
  assert.equal(s.getQuota().date, '2099-01-01');
});
