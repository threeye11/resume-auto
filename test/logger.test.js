import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../src/core/logger.js';

test('on/emit 传递 payload', () => {
  const log = createLogger();
  const seen = [];
  log.on('apply', (p) => seen.push(p));
  log.emit('apply', { id: '1', status: 'ok' });
  assert.deepEqual(seen, [{ id: '1', status: 'ok' }]);
});

test('off 取消订阅', () => {
  const log = createLogger();
  const seen = [];
  const fn = (p) => seen.push(p);
  log.on('error', fn);
  log.off('error', fn);
  log.emit('error', { msg: 'x' });
  assert.equal(seen.length, 0);
});

test('recent 保留最近 N 条', () => {
  const log = createLogger({ historyLimit: 3 });
  log.emit('scan', { n: 1 });
  log.emit('scan', { n: 2 });
  log.emit('scan', { n: 3 });
  log.emit('scan', { n: 4 });
  const h = log.recent();
  assert.equal(h.length, 3);
  assert.equal(h[2].payload.n, 4);
});
