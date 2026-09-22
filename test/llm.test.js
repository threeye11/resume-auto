import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  chatComplete,
  renderTemplate,
  maskApiKey,
  testConnection,
  DEFAULT_SYSTEM_TEMPLATE
} from '../src/core/llm.js';

function memBackend() {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    del: (k) => m.delete(k)
  };
}

test('renderTemplate 替换占位符', () => {
  const s = renderTemplate('A{a}-B{b}', { a: '1', b: 'x' });
  assert.equal(s, 'A1-Bx');
});

test('maskApiKey 不返回完整密钥', () => {
  const masked = maskApiKey('sk-abcdefghij');
  assert.notEqual(masked, 'sk-abcdefghij');
  assert.ok(masked.includes('***'));
});

test('chatComplete 成功返回正文', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: '您好，我对该岗位感兴趣。' } }]
      }),
      text: async () => ''
    };
  };
  const out = await chatComplete(
    { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'm1' },
    { scene: 'reply', hrName: '李女士', company: 'A公司', resumeMarkdown: '# 简历', targetRole: '嵌入式' },
    { fetchImpl }
  );
  assert.equal(out, '您好，我对该岗位感兴趣。');
  assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.model, 'm1');
  assert.equal(body.messages[0].role, 'system');
  assert.ok(body.messages[0].content.includes('# 简历'));
  assert.ok(!body.messages[0].content.includes('sk-test'));
});

test('chatComplete HTTP 错误抛出', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    json: async () => ({}),
    text: async () => 'unauthorized'
  });
  await assert.rejects(
    () =>
      chatComplete(
        { baseUrl: 'https://x', apiKey: 'k', model: 'm' },
        { scene: 'reply' },
        { fetchImpl }
      ),
    /401/
  );
});

test('缺 apiKey 抛错', async () => {
  await assert.rejects(
    () => chatComplete({ baseUrl: 'https://x', apiKey: '', model: 'm' }, {}, { fetchImpl: async () => ({}) }),
    /apiKey/
  );
});

test('默认模板含 scene 占位', () => {
  assert.ok(DEFAULT_SYSTEM_TEMPLATE.includes('{scene}'));
});

test('testConnection 成功：只发一条 ping，不带简历上下文', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    return { ok: true, status: 200, text: async () => '', json: async () => ({}) };
  };
  const r = await testConnection(
    { baseUrl: 'https://api.example.com/v1/', apiKey: 'sk-test', model: 'deepseek-chat' },
    { fetchImpl }
  );
  assert.equal(r.ok, true);
  assert.equal(calls[0].url, 'https://api.example.com/v1/chat/completions');
  const body = JSON.parse(calls[0].init.body);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].content, 'ping');
  assert.ok(calls[0].init.headers.Authorization.includes('sk-test'));
  assert.ok(r.detail.includes('deepseek-chat'));
});

test('testConnection 缺参数：不发请求直接失败', async () => {
  let called = 0;
  const fetchImpl = async () => {
    called += 1;
    return { ok: true, status: 200, text: async () => '' };
  };
  const r = await testConnection({ baseUrl: '', apiKey: 'k', model: 'm' }, { fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.detail, /baseUrl/);
  assert.equal(called, 0);
});

test('testConnection HTTP 失败：detail 带状态码', async () => {
  const fetchImpl = async () => ({
    ok: false,
    status: 401,
    text: async () => 'invalid api key'
  });
  const r = await testConnection({ baseUrl: 'https://x', apiKey: 'k', model: 'm' }, { fetchImpl });
  assert.equal(r.ok, false);
  assert.match(r.detail, /401/);
  assert.match(r.detail, /invalid api key/);
});

void memBackend;
