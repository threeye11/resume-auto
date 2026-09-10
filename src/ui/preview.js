import { createLogger } from '../core/logger.js';
import { createStore } from '../core/store.js';
import { mountTerminal } from './terminal/terminal.js';

const mem = new Map();
const backend = {
  get: (k, d) => (mem.has(k) ? mem.get(k) : d),
  set: (k, v) => mem.set(k, v),
  del: (k) => mem.delete(k)
};
const store = createStore(backend);
const logger = createLogger();

mountTerminal({
  logger,
  store,
  controls: {
    onStart: () => {
      logger.emit('scan', { count: 20 });
      logger.emit('filter', { pass: 7, total: 20 });
      logger.emit('apply', { index: 1, title: '前端', company: 'A厂', status: 'ok' });
      logger.emit('apply', { index: 2, title: 'Java', company: 'B', status: 'skip' });
      logger.emit('progress', { done: 2, total: 7 });
      logger.emit('done', { ok: 1, skip: 1, fail: 0 });
    },
    onPause: () => logger.emit('error', { where: 'ui', msg: '已暂停' }),
    onStop: () => logger.emit('done', { ok: 0, skip: 0, fail: 0 })
  }
});
