import { test } from 'node:test';
import assert from 'node:assert/strict';
import { CHAT_FIELDS, normalizeFields, buildSavePatch } from '../src/ui/terminal/config-drawer.js';
import { SENSITIVE_PATHS } from '../src/core/vault.js';

const LIST = normalizeFields(CHAT_FIELDS);

const idxOf = (key) => LIST.findIndex((f) => f.key === key);
const find = (key) => LIST.find((f) => f.key === key);

test('保险库挂载点排在所有敏感字段之前（先设 PIN 再配 LLM）', () => {
  const vault = LIST.findIndex((f) => f.slot === 'vault');
  assert.ok(vault >= 0, '缺少 vault 挂载点');
  for (const p of SENSITIVE_PATHS) {
    const i = idxOf(p);
    if (i < 0) continue; // greeting 属 jobs 页字段表
    assert.ok(i > vault, `${p} 出现在 PIN 挂载点之前`);
  }
});

test('API Key 用掩码框且不回显', () => {
  assert.equal(find('llm.apiKey')?.type, 'password');
});

test('问候来源改为下拉且两种模式可选', () => {
  const f = find('proactiveSource');
  assert.equal(f?.type, 'select');
  assert.deepEqual(
    (f.options || []).map((o) => o[0]),
    ['custom', 'llm']
  );
});

test('连通性测试按钮位于 LLM 字段之后、问候开关之前', () => {
  const action = LIST.findIndex((f) => f.action === 'testLlm');
  assert.ok(action > 0, '缺少测试连通性按钮');
  assert.ok(action > idxOf('llm.model'));
  assert.ok(action < idxOf('proactiveEnabled'));
});

test('每个输入项都带占位引导文案', () => {
  const missing = LIST.filter(
    (f) => f.key && f.type !== 'checkbox' && !String(f.hint || '').trim()
  ).map((f) => f.key);
  assert.deepEqual(missing, []);
});

test('掩码/保险库字段留空则不覆盖已存值', () => {
  const patch = buildSavePatch(LIST, {
    llm: { baseUrl: 'https://api.x/v1', apiKey: '', model: '' },
    resumeMarkdown: '',
    proactiveCustom: '',
    proactiveSource: 'llm',
    proactiveEnabled: false
  });
  assert.ok(!('apiKey' in (patch.llm || {})), 'apiKey 留空不应写入');
  assert.ok(!('resumeMarkdown' in patch), '简历留空不应写入');
  assert.ok(!('proactiveCustom' in patch), '问候文案留空不应写入');
  assert.equal(patch.llm.baseUrl, 'https://api.x/v1');
  assert.equal(patch.proactiveSource, 'llm');
});

test('粘贴新 Key 时照常覆盖', () => {
  const patch = buildSavePatch(LIST, { llm: { apiKey: 'sk-new' } });
  assert.equal(patch.llm.apiKey, 'sk-new');
});
