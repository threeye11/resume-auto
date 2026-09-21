import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createChatStore, validateLlmConfig, CHAT_DEFAULT_CONFIG } from '../src/core/chatStore.js';

function memBackend() {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    del: (k) => m.delete(k)
  };
}

test('chat 配置默认关闭主动/自动', () => {
  const s = createChatStore(memBackend());
  const c = s.getConfig();
  assert.equal(c.proactiveEnabled, false);
  assert.equal(c.autoReplyEnabled, false);
  assert.equal(c.replyMode, 'draft');
  assert.equal(c.proactiveSource, 'custom');
});

test('updateConfig 合并 llm 子对象', () => {
  const s = createChatStore(memBackend());
  s.updateConfig({ proactiveEnabled: true, llm: { model: 'deepseek-chat' } });
  const c = s.getConfig();
  assert.equal(c.proactiveEnabled, true);
  assert.equal(c.llm.model, 'deepseek-chat');
  assert.equal(c.llm.temperature, CHAT_DEFAULT_CONFIG.llm.temperature);
});

test('greeted 标记', () => {
  const s = createChatStore(memBackend());
  assert.equal(s.hasGreeted('c1'), false);
  s.markGreeted('c1');
  assert.equal(s.hasGreeted('c1'), true);
  s.clearGreeted();
  assert.equal(s.hasGreeted('c1'), false);
});

test('handled 序号', () => {
  const s = createChatStore(memBackend());
  assert.equal(s.lastHandled('c1'), null);
  s.markHandled('c1', 3);
  assert.equal(s.lastHandled('c1'), 3);
});

test('validateLlmConfig', () => {
  assert.match(validateLlmConfig({ llm: {} }), /baseUrl/);
  assert.equal(
    validateLlmConfig({ llm: { baseUrl: 'https://x', apiKey: 'k', model: 'm' } }),
    null
  );
});
