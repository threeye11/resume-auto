import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createDedupe } from '../src/core/dedupe.js';
import { checkQuota } from '../src/core/quota.js';
import { createStore } from '../src/core/store.js';

function memBackend() {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    del: (k) => m.delete(k)
  };
}

test('dedupe: store 已有则 skip', () => {
  const store = createStore(memBackend());
  store.markApplied('j1');
  const d = createDedupe(store, { isApplied: () => false });
  assert.equal(d.shouldSkip('j1'), true);
  assert.equal(d.shouldSkip('j2'), false);
});

test('dedupe: 站内 isApplied 也算已投并落库', () => {
  const store = createStore(memBackend());
  const d = createDedupe(store, { isApplied: (id) => id === 'j9' });
  assert.equal(d.shouldSkip('j9'), true);
  assert.equal(store.hasApplied('j9'), true);
});

test('quota: 未超限可投', () => {
  const store = createStore(memBackend());
  assert.equal(checkQuota(store, 100).canApply, true);
});

test('quota: 达到上限不可投', () => {
  const store = createStore(memBackend());
  for (let i = 0; i < 3; i++) store.addQuota(1);
  const r = checkQuota(store, 3);
  assert.equal(r.canApply, false);
  assert.equal(r.count, 3);
  assert.equal(r.limit, 3);
});
