import { createVaultStore } from '../core/vault.js';
import {
  splitSecretsFromConfig,
  pickSensitivePaths,
  SENSITIVE_PATHS
} from '../core/vault.js';

function getPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] == null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function deletePath(obj, path) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (o == null || typeof o[keys[i]] !== 'object') return;
    o = o[keys[i]];
  }
  delete o?.[keys[keys.length - 1]];
}

function mergePartial(base, partial) {
  const out = JSON.parse(JSON.stringify(base ?? {}));
  for (const [k, v] of Object.entries(partial || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && out[k] && typeof out[k] === 'object') {
      out[k] = { ...out[k], ...v };
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function blankSensitivePaths(config) {
  const { rest } = splitSecretsFromConfig(config || {});
  for (const p of SENSITIVE_PATHS) {
    const keys = p.split('.');
    if (keys.length === 1) rest[keys[0]] = '';
    else setPath(rest, p, '');
  }
  return rest;
}

/**
 * 会话配置保存：vault 启用后敏感字段不进 GM 明文。
 * unlocked → 敏感值写入 vault 密文；locked → 拒绝写入非空敏感字段。
 */
export function createVaultAwareChatStore(chatStore, vault) {
  function scrubGmConfig(config) {
    return chatStore.updateConfig(blankSensitivePaths(config));
  }

  async function updateConfig(partial) {
    const base = chatStore.getConfig();
    const merged = mergePartial(base, partial);

    if (!vault.isEnabled()) {
      // 必须合并后再写：chatStore 对 llm 是整对象替换，直接传 partial 会把省略的 apiKey 清成默认值
      return chatStore.updateConfig(merged);
    }

    const { picked, anyNonEmpty } = pickSensitivePaths(partial || {});

    if (!vault.isUnlocked()) {
      if (anyNonEmpty) {
        throw new Error('保险库已锁定，请先解锁后再保存 API Key / 简历等敏感项');
      }
      // 仅允许更新非敏感项
      const safe = { ...partial };
      for (const p of SENSITIVE_PATHS) deletePath(safe, p);
      return scrubGmConfig(mergePartial(chatStore.getConfig(), safe));
    }

    // unlocked：敏感进 vault，GM 只存非敏感
    if (anyNonEmpty || Object.keys(picked).length) {
      await vault.saveConfigSecrets(merged);
    }
    return scrubGmConfig(merged);
  }

  return {
    getConfig: () => chatStore.getConfig(),
    /** 运行时合并 vault 解密结果（未解锁则无敏感值） */
    getEffectiveConfig: () => {
      const cfg = chatStore.getConfig();
      if (!vault.isEnabled()) return cfg;
      return vault.mergeConfigWithSecrets(cfg, vault.isUnlocked() ? vault.getSecrets() : null);
    },
    updateConfig,
    scrubGmConfig,
    raw: chatStore,
    vault
  };
}

/** 在配置抽屉内注入 PIN/保险库控件 */
export function mountVaultPanel(
  rootEl,
  { backend, vault: existing, chatStore, onStatus } = {}
) {
  const vault = existing || createVaultStore(backend);
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-top:12px;border-top:1px solid rgba(255,255,255,.08);padding-top:10px';

  const title = document.createElement('div');
  title.className = 'ra-label';
  title.textContent = '保险库（AES-GCM + PBKDF2 310k）';
  wrap.appendChild(title);

  const pin = document.createElement('input');
  pin.type = 'password';
  pin.placeholder = '例：4–12 位数字或短语';
  pin.autocomplete = 'off';
  pin.style.cssText =
    'width:100%;margin:6px 0;padding:6px;border-radius:6px;border:1px solid #30363d;background:#0d1117;color:#e0e0e0';

  const timeout = document.createElement('input');
  timeout.type = 'number';
  timeout.min = '1';
  timeout.max = String(vault.MAX_LOCK_TIMEOUT_MIN || 43200);
  timeout.placeholder = '例：15';
  timeout.value = String(vault.getLockTimeoutMin());
  timeout.style.cssText = pin.style.cssText;

  const oldPin = document.createElement('input');
  oldPin.type = 'password';
  oldPin.placeholder = '仅修改 PIN 时填写';
  oldPin.style.cssText = pin.style.cssText;

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:6px;flex-wrap:wrap;margin-top:8px';

  function labelled(inputEl, text) {
    const lab = document.createElement('div');
    lab.className = 'ra-help';
    lab.textContent = text;
    const box = document.createElement('div');
    box.className = 'ra-field';
    box.append(lab, inputEl);
    return box;
  }

  function btn(label, cls) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `ra-btn ${cls || ''}`;
    b.textContent = label;
    return b;
  }

  const setupBtn = btn('设置 PIN 并加密现有敏感项', 'primary');
  const unlockBtn = btn('解锁');
  const lockBtn = btn('锁定');
  const changeBtn = btn('修改 PIN');
  const resetBtn = btn('重置保险库');

  const status = document.createElement('div');
  status.style.cssText = 'color:#a0a0a0;font-size:12px;margin-top:6px';

  function refreshStatus() {
    const s = vault.isEnabled()
      ? vault.isUnlocked()
        ? '已解锁'
        : '已启用 · 已锁定'
      : '未启用';
    status.textContent = `${s} · 超时 ${vault.getLockTimeoutMin()} 分钟`;
    onStatus?.(s);
  }

  async function scrubChatConfigIfAny() {
    if (!chatStore?.getConfig) return;
    if (typeof chatStore.scrubGmConfig === 'function') {
      return chatStore.scrubGmConfig(chatStore.getConfig());
    }
    return chatStore.updateConfig(blankSensitivePaths(chatStore.getConfig()));
  }

  setupBtn.addEventListener('click', async () => {
    try {
      const min = Number(timeout.value) || undefined;
      if (min) vault.setLockTimeoutMin(min);
      const current = chatStore?.getEffectiveConfig
        ? chatStore.getEffectiveConfig()
        : chatStore?.getConfig
          ? chatStore.getConfig()
          : {};
      await vault.setupPin(pin.value, current);
      pin.value = '';
      await scrubChatConfigIfAny();
      refreshStatus();
      status.textContent += ' · 已加密并清除 GM 明文敏感项';
    } catch (e) {
      status.textContent = String(e.message || e);
    }
  });

  unlockBtn.addEventListener('click', async () => {
    try {
      const min = Number(timeout.value);
      if (min) vault.setLockTimeoutMin(min);
      await vault.unlock(pin.value);
      pin.value = '';
      refreshStatus();
    } catch (e) {
      status.textContent = String(e.message || e);
    }
  });

  lockBtn.addEventListener('click', () => {
    vault.lock();
    refreshStatus();
  });

  changeBtn.addEventListener('click', async () => {
    try {
      await vault.changePin(oldPin.value, pin.value);
      oldPin.value = '';
      pin.value = '';
      await scrubChatConfigIfAny();
      refreshStatus();
    } catch (e) {
      status.textContent = String(e.message || e);
    }
  });

  resetBtn.addEventListener('click', () => {
    if (!window.confirm('删除保险库密文。请自行轮换 API Key 后重新设置 PIN。继续？')) return;
    vault.resetVault();
    refreshStatus();
  });

  row.append(setupBtn, unlockBtn, lockBtn, changeBtn, resetBtn);
  wrap.append(
    labelled(pin, 'PIN（只用于派生密钥，不写入任何存储；解锁后内存保留到超时或手动锁定）'),
    labelled(oldPin, '旧 PIN（仅「修改 PIN」时需要）'),
    labelled(timeout, '自动锁定分钟（默认 15，上限 43200 = 30 天）'),
    row,
    status
  );
  rootEl.appendChild(wrap);
  refreshStatus();

  return { vault, refreshStatus, wrap };
}

export { createVaultStore, SENSITIVE_PATHS, getPath, setPath };
