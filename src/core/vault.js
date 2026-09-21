import {
  PBKDF2_ITERATIONS,
  deriveKey,
  encryptJson,
  decryptJson,
  newSaltB64
} from './crypto.js';

export const VAULT_META_KEY = 'ra.vault.meta';
export const VAULT_BLOB_KEY = 'ra.vault.blob';

export const DEFAULT_LOCK_TIMEOUT_MIN = 15;
export const MIN_LOCK_TIMEOUT_MIN = 1;
export const MAX_LOCK_TIMEOUT_MIN = 30 * 24 * 60; // 30 days

/** 需加密的扁平路径（相对合并后的运行时配置） */
export const SENSITIVE_PATHS = [
  'llm.apiKey',
  'llm.systemTemplate',
  'resumeMarkdown',
  'targetRole',
  'proactiveCustom',
  'greeting'
];

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

export function splitSecretsFromConfig(config) {
  const secrets = {};
  const rest = structuredCloneSafe(config);
  for (const p of SENSITIVE_PATHS) {
    const v = getPath(config, p);
    if (v !== undefined && v !== null && v !== '') setPath(secrets, p, v);
    deletePath(rest, p);
  }
  return { secrets, rest };
}

export function mergeConfigWithSecrets(config, secrets) {
  const out = structuredCloneSafe(config || {});
  if (secrets && typeof secrets === 'object') {
    for (const p of SENSITIVE_PATHS) {
      const v = getPath(secrets, p);
      if (v !== undefined) setPath(out, p, v);
    }
  }
  return out;
}

/** 按 SENSITIVE_PATHS 逐路径合并，避免浅合并丢掉 llm 兄弟字段 */
export function mergeSecretsByPath(base, patch) {
  const out = structuredCloneSafe(base || {});
  if (!patch || typeof patch !== 'object') return out;
  for (const p of SENSITIVE_PATHS) {
    const v = getPath(patch, p);
    if (v !== undefined) setPath(out, p, v);
  }
  // 也允许 patch 内显式出现的其它顶层键（非路径列表）浅合并
  for (const k of Object.keys(patch)) {
    if (k === 'llm' || SENSITIVE_PATHS.some((p) => p.split('.')[0] === k)) continue;
    out[k] = patch[k];
  }
  return out;
}

export function configHasSensitiveValues(config) {
  return SENSITIVE_PATHS.some((p) => {
    const v = getPath(config, p);
    return v !== undefined && v !== null && String(v).length > 0;
  });
}

export function pickSensitivePaths(partial) {
  const out = {};
  let any = false;
  for (const p of SENSITIVE_PATHS) {
    const v = getPath(partial, p);
    if (v !== undefined) {
      setPath(out, p, v);
      if (v !== null && String(v).length > 0) any = true;
    }
  }
  return { picked: out, anyNonEmpty: any };
}

function structuredCloneSafe(obj) {
  return JSON.parse(JSON.stringify(obj ?? {}));
}

function clampTimeout(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return DEFAULT_LOCK_TIMEOUT_MIN;
  return Math.min(MAX_LOCK_TIMEOUT_MIN, Math.max(MIN_LOCK_TIMEOUT_MIN, Math.floor(v)));
}

/**
 * backend: { get(k,d), set(k,v), del(k) }
 */
export function createVaultStore(backend) {
  let memoryKey = null;
  let memorySecrets = null;
  let idleTimer = null;
  let onLockCb = null;

  function getMeta() {
    return (
      backend.get(VAULT_META_KEY, null) || {
        version: 1,
        enabled: false,
        kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
        lockTimeoutMin: DEFAULT_LOCK_TIMEOUT_MIN
      }
    );
  }

  function setMeta(meta) {
    backend.set(VAULT_META_KEY, meta);
    return meta;
  }

  function getBlob() {
    return backend.get(VAULT_BLOB_KEY, null);
  }

  function isEnabled() {
    return Boolean(getMeta().enabled && getBlob());
  }

  function isUnlocked() {
    return Boolean(memoryKey && memorySecrets);
  }

  function clearMemory() {
    memoryKey = null;
    memorySecrets = null;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
  }

  function lock() {
    clearMemory();
    onLockCb?.();
  }

  function resetIdleTimer() {
    if (idleTimer) clearTimeout(idleTimer);
    const min = getMeta().lockTimeoutMin || DEFAULT_LOCK_TIMEOUT_MIN;
    idleTimer = setTimeout(() => lock(), min * 60 * 1000);
    // Node 测试环境避免挂起进程
    idleTimer.unref?.();
  }

  function touch() {
    if (isUnlocked()) resetIdleTimer();
  }

  async function setupPin(pin, initialConfig = {}) {
    const pinStr = String(pin ?? '');
    if (!pinStr) throw new Error('PIN 不能为空');
    const { secrets } = splitSecretsFromConfig(initialConfig || {});
    const saltB64 = newSaltB64();
    const key = await deriveKey(pinStr, saltB64, PBKDF2_ITERATIONS);
    const enc = await encryptJson(key, secrets);
    backend.set(VAULT_BLOB_KEY, { saltB64, ...enc });
    setMeta({
      version: 1,
      enabled: true,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
      lockTimeoutMin: getMeta().lockTimeoutMin || DEFAULT_LOCK_TIMEOUT_MIN
    });
    memoryKey = key;
    memorySecrets = structuredCloneSafe(secrets);
    resetIdleTimer();
    return memorySecrets;
  }

  async function unlock(pin) {
    const blob = getBlob();
    if (!blob) throw new Error('保险库未初始化');
    const pinStr = String(pin ?? '');
    if (!pinStr) throw new Error('PIN 不能为空');
    const meta = getMeta();
    const iter = meta.kdf?.iterations || PBKDF2_ITERATIONS;
    const key = await deriveKey(pinStr, blob.saltB64, iter);
    let secrets;
    try {
      secrets = await decryptJson(key, blob.ivB64, blob.ctB64);
    } catch {
      throw new Error('PIN 错误或数据损坏');
    }
    memoryKey = key;
    memorySecrets = secrets || {};
    resetIdleTimer();
    return memorySecrets;
  }

  function getSecrets() {
    touch();
    return memorySecrets;
  }

  async function updateSecrets(patch) {
    if (!isUnlocked()) throw new Error('请先解锁保险库');
    memorySecrets = mergeSecretsByPath(memorySecrets, patch);
    const blob = getBlob();
    const enc = await encryptJson(memoryKey, memorySecrets);
    backend.set(VAULT_BLOB_KEY, { saltB64: blob.saltB64, ...enc });
    resetIdleTimer();
    return memorySecrets;
  }

  /** 从完整 config 同步敏感字段进 vault（需已解锁）；只合并 SENSITIVE_PATHS 中非空值 */
  async function saveConfigSecrets(config) {
    if (!isUnlocked()) throw new Error('请先解锁保险库');
    const { secrets } = splitSecretsFromConfig(config || {});
    // 空字符串不覆盖已有 vault 值（表单未填敏感框时）
    const filtered = {};
    for (const p of SENSITIVE_PATHS) {
      const v = getPath(secrets, p);
      if (v !== undefined && v !== null && String(v).length > 0) setPath(filtered, p, v);
    }
    return updateSecrets(filtered);
  }

  async function changePin(oldPin, newPin) {
    const blob = getBlob();
    if (!blob) throw new Error('保险库未初始化');
    const oldStr = String(oldPin ?? '');
    const newStr = String(newPin ?? '');
    if (!newStr) throw new Error('新 PIN 不能为空');
    const meta = getMeta();
    const iter = meta.kdf?.iterations || PBKDF2_ITERATIONS;
    const oldKey = await deriveKey(oldStr, blob.saltB64, iter);
    let secrets;
    try {
      secrets = await decryptJson(oldKey, blob.ivB64, blob.ctB64);
    } catch {
      throw new Error('旧 PIN 错误');
    }
    const saltB64 = newSaltB64();
    const newKey = await deriveKey(newStr, saltB64, PBKDF2_ITERATIONS);
    const enc = await encryptJson(newKey, secrets || {});
    backend.set(VAULT_BLOB_KEY, { saltB64, ...enc });
    setMeta({ ...getMeta(), kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS } });
    memoryKey = newKey;
    memorySecrets = secrets || {};
    resetIdleTimer();
    return secrets;
  }

  function resetVault() {
    backend.del(VAULT_BLOB_KEY);
    backend.set(VAULT_META_KEY, {
      version: 1,
      enabled: false,
      kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS },
      lockTimeoutMin: getMeta().lockTimeoutMin || DEFAULT_LOCK_TIMEOUT_MIN
    });
    clearMemory();
  }

  function setLockTimeoutMin(min) {
    const v = clampTimeout(min);
    setMeta({ ...getMeta(), lockTimeoutMin: v });
    if (isUnlocked()) resetIdleTimer();
    return v;
  }

  function getLockTimeoutMin() {
    return getMeta().lockTimeoutMin || DEFAULT_LOCK_TIMEOUT_MIN;
  }

  return {
    isEnabled,
    isUnlocked,
    getMeta,
    setupPin,
    unlock,
    lock,
    getSecrets,
    updateSecrets,
    saveConfigSecrets,
    changePin,
    resetVault,
    setLockTimeoutMin,
    getLockTimeoutMin,
    splitSecretsFromConfig,
    mergeConfigWithSecrets,
    mergeSecretsByPath,
    configHasSensitiveValues,
    pickSensitivePaths,
    onLock(fn) {
      onLockCb = fn;
    },
    touch,
    MAX_LOCK_TIMEOUT_MIN,
    MIN_LOCK_TIMEOUT_MIN,
    DEFAULT_LOCK_TIMEOUT_MIN,
    SENSITIVE_PATHS
  };
}
