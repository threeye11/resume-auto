import { createLogger } from '../core/logger.js';
import { createStore } from '../core/store.js';
import { createChatStore } from '../core/chatStore.js';
import { createVaultStore } from '../core/vault.js';
import { createVaultAwareChatStore, mountVaultPanel } from './vaultPanel.js';
import { CHAT_FIELDS } from './terminal/config-drawer.js';
import { mountTerminal } from './terminal/terminal.js';

function memBackend() {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    del: (k) => m.delete(k)
  };
}

const logger = createLogger();
const backend = memBackend();
const mode = new URLSearchParams(location.search).get('mode') === 'chat';

if (mode) {
  // 与聊天页同一套装配：vault-aware store + 分节引导抽屉 + 保险库挂载点
  const vault = createVaultStore(backend);
  const chatStore = createVaultAwareChatStore(createChatStore(backend), vault);
  const ui = mountTerminal({
    logger,
    store: chatStore,
    configFields: CHAT_FIELDS,
    onTestLlm: async (raw) => {
      await new Promise((r) => setTimeout(r, 350));
      const f = raw?.llm || {};
      return f.baseUrl && f.model
        ? { ok: true, latencyMs: 233, detail: `${f.model} · 200（预览模拟）` }
        : { ok: false, detail: '缺少 llm.baseUrl 或 llm.model' };
    },
    controls: {
      onStart: () => logger.emit('scan', { note: '预览：开始主动问候' }),
      onPause: () => logger.emit('error', { where: 'ui', msg: '已暂停' }),
      onStop: () => logger.emit('done', { ok: 0, skip: 0, fail: 0 })
    }
  });
  if (ui.slots?.vault) mountVaultPanel(ui.slots.vault, { vault, chatStore });
  ui.setStatus('就绪 · chat 预览');
  window.__raPreview = { backend, vault, chatStore, ui };
} else {
  const store = createStore(backend);
  const ui = mountTerminal({
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
  ui.setStatus('就绪 · jobs 预览');
}
