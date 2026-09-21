import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  deriveKey,
  encryptJson,
  decryptJson,
  newSaltB64,
  b64encode,
  b64decode,
  PBKDF2_ITERATIONS
} from '../src/core/crypto.js';
import {
  createVaultStore,
  splitSecretsFromConfig,
  mergeConfigWithSecrets,
  MAX_LOCK_TIMEOUT_MIN,
  SENSITIVE_PATHS
} from '../src/core/vault.js';

function memBackend() {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    del: (k) => m.delete(k)
  };
}

test('crypto roundtrip AES-GCM', async () => {
  const salt = newSaltB64();
  const key = await deriveKey('pin-1234', salt, 1000);
  const { ivB64, ctB64 } = await encryptJson(key, { llm: { apiKey: 'sk-secret' } });
  const key2 = await deriveKey('pin-1234', salt, 1000);
  const out = await decryptJson(key2, ivB64, ctB64);
  assert.equal(out.llm.apiKey, 'sk-secret');
});

test('wrong pin fails decrypt', async () => {
  const salt = newSaltB64();
  const key = await deriveKey('right', salt, 1000);
  const { ivB64, ctB64 } = await encryptJson(key, { a: 1 });
  const bad = await deriveKey('wrong', salt, 1000);
  await assert.rejects(() => decryptJson(bad, ivB64, ctB64));
});

test('b64 roundtrip', () => {
  const u = new Uint8Array([1, 2, 3, 250]);
  assert.deepEqual(b64decode(b64encode(u)), u);
});

test('PBKDF2 default iterations', () => {
  assert.equal(PBKDF2_ITERATIONS, 310000);
});

test('splitSecretsFromConfig separates sensitive paths', () => {
  const { secrets, rest } = splitSecretsFromConfig({
    llm: { apiKey: 'sk-1', model: 'm1', baseUrl: 'https://x' },
    resumeMarkdown: '# R',
    dailyLimit: 5,
    proactiveEnabled: true
  });
  assert.equal(secrets.llm.apiKey, 'sk-1');
  assert.equal(rest.llm.model, 'm1');
  assert.equal(rest.llm.apiKey, undefined);
  assert.equal(rest.dailyLimit, 5);
  assert.equal(secrets.resumeMarkdown, '# R');
  assert.ok(SENSITIVE_PATHS.includes('llm.apiKey'));
});

test('mergeConfigWithSecrets', () => {
  const merged = mergeConfigWithSecrets(
    { llm: { model: 'm' }, dailyLimit: 3 },
    { llm: { apiKey: 'sk' }, greeting: '你好' }
  );
  assert.equal(merged.llm.apiKey, 'sk');
  assert.equal(merged.greeting, '你好');
  assert.equal(merged.llm.model, 'm');
});

test('vault setup/unlock/lock/changePin/reset', async () => {
  const backend = memBackend();
  const v = createVaultStore(backend);
  assert.equal(v.isEnabled(), false);

  await v.setupPin('111111', {
    llm: { apiKey: 'sk-A' },
    resumeMarkdown: 'R',
    dailyLimit: 9
  });
  assert.equal(v.isEnabled(), true);
  assert.equal(v.isUnlocked(), true);
  assert.equal(v.getSecrets().llm.apiKey, 'sk-A');

  v.lock();
  assert.equal(v.isUnlocked(), false);
  assert.equal(v.getSecrets(), null);

  const sec = await v.unlock('111111');
  assert.equal(sec.llm.apiKey, 'sk-A');
  await assert.rejects(async () => {
    v.lock();
    await v.unlock('000000');
  });

  await v.unlock('111111');
  await v.changePin('111111', '222222');
  v.lock();
  const sec2 = await v.unlock('222222');
  assert.equal(sec2.llm.apiKey, 'sk-A');

  v.resetVault();
  assert.equal(v.isEnabled(), false);
  assert.equal(v.isUnlocked(), false);
});

test('vault stores ciphertext not plaintext apiKey', async () => {
  const backend = memBackend();
  const v = createVaultStore(backend);
  await v.setupPin('pin-z', { llm: { apiKey: 'sk-PLAINTEXT-XYZ' }, resumeMarkdown: 'RESUME_SECRET' });
  const blob = backend.get('ra.vault.blob');
  const raw = JSON.stringify(blob) + JSON.stringify(backend.get('ra.vault.meta'));
  assert.ok(!raw.includes('sk-PLAINTEXT-XYZ'));
  assert.ok(!raw.includes('RESUME_SECRET'));
});

test('lock timeout clamp max 30 days', async () => {
  const v = createVaultStore(memBackend());
  assert.equal(v.setLockTimeoutMin(99999999), MAX_LOCK_TIMEOUT_MIN);
  assert.equal(v.setLockTimeoutMin(0), v.MIN_LOCK_TIMEOUT_MIN);
  assert.equal(v.setLockTimeoutMin(30), 30);
});

test('updateSecrets requires unlock', async () => {
  const v = createVaultStore(memBackend());
  await v.setupPin('p1', { llm: { apiKey: 'k1' } });
  v.lock();
  await assert.rejects(() => v.updateSecrets({ llm: { apiKey: 'k2' } }), /解锁/);
});

test('updateSecrets path-merge keeps llm siblings', async () => {
  const v = createVaultStore(memBackend());
  await v.setupPin('p2', {
    llm: { apiKey: 'k1', systemTemplate: 'TPL' },
    resumeMarkdown: 'R'
  });
  await v.updateSecrets({ llm: { apiKey: 'k2' } });
  const s = v.getSecrets();
  assert.equal(s.llm.apiKey, 'k2');
  assert.equal(s.llm.systemTemplate, 'TPL');
  assert.equal(s.resumeMarkdown, 'R');
});

test('vault-aware store keeps secrets out of GM config', async () => {
  const { createChatStore } = await import('../src/core/chatStore.js');
  const { createVaultAwareChatStore } = await import('../src/ui/vaultPanel.js');
  const backend = memBackend();
  const raw = createChatStore(backend);
  const vault = createVaultStore(backend);
  const aware = createVaultAwareChatStore(raw, vault);

  // 明文写入（vault 未启用）
  await aware.updateConfig({
    llm: { apiKey: 'sk-PLAIN', model: 'm1', baseUrl: 'https://x' },
    resumeMarkdown: 'RESUME',
    dailyLimit: 8
  });

  await vault.setupPin('pin-x', raw.getConfig());
  aware.scrubGmConfig(raw.getConfig());

  const gmCfg = JSON.stringify(backend.get('ra.boss.chat.config'));
  const blob = JSON.stringify(backend.get('ra.vault.blob'));
  assert.ok(!gmCfg.includes('sk-PLAIN'), 'GM config must not hold plaintext apiKey');
  assert.ok(!gmCfg.includes('RESUME'), 'GM config must not hold resume');
  assert.ok(!blob.includes('sk-PLAIN'));
  assert.ok(!blob.includes('RESUME'));
  assert.equal(raw.getConfig().dailyLimit, 8);
  assert.equal(raw.getConfig().llm.model, 'm1');

  // 解锁后 effectiveConfig 能读回
  vault.lock();
  const lockedCfg = aware.getEffectiveConfig();
  assert.ok(!lockedCfg.llm.apiKey, 'locked view must not expose apiKey');
  await vault.unlock('pin-x');
  assert.equal(aware.getEffectiveConfig().llm.apiKey, 'sk-PLAIN');

  // 锁定时禁止保存敏感项
  vault.lock();
  await assert.rejects(
    () => aware.updateConfig({ llm: { apiKey: 'sk-new' } }),
    /锁定/
  );
});

test('blankSensitivePaths + aware scrub clears GM', async () => {
  const { createChatStore } = await import('../src/core/chatStore.js');
  const { createVaultAwareChatStore, blankSensitivePaths } = await import('../src/ui/vaultPanel.js');
  const backend = memBackend();
  const raw = createChatStore(backend);
  raw.updateConfig({
    llm: { apiKey: 'sk-UI', model: 'm', baseUrl: 'https://x' },
    resumeMarkdown: 'RESUME-UI',
    targetRole: 'FE',
    proactiveCustom: 'HELLO',
    greeting: 'GREET-UI'
  });
  const vault = createVaultStore(backend);
  const aware = createVaultAwareChatStore(raw, vault);
  const cfg = raw.getConfig();
  const blanked = blankSensitivePaths(cfg);
  assert.equal(blanked.llm.apiKey, '');
  assert.equal(blanked.resumeMarkdown, '');

  await vault.setupPin('pin-ui', aware.getEffectiveConfig());
  await aware.scrubGmConfig(raw.getConfig());

  const gm = JSON.stringify(backend.get('ra.boss.chat.config'));
  assert.ok(!gm.includes('sk-UI'));
  assert.ok(!gm.includes('RESUME-UI'));
  assert.ok(!gm.includes('HELLO'));
  assert.ok(!gm.includes('GREET-UI'));
  assert.equal(raw.getConfig().llm.model, 'm');
});

