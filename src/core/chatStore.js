import { DEFAULT_SYSTEM_TEMPLATE } from './llm.js';

export const CHAT_DEFAULT_CONFIG = {
  proactiveEnabled: false,
  proactiveSource: 'custom', // 'custom' | 'llm'
  proactiveCustom: '',
  replyMode: 'draft',
  autoReplyEnabled: false,
  proactiveMaxPerRun: 10,
  delayMinMs: 2000,
  delayMaxMs: 4000,
  llm: {
    baseUrl: '',
    apiKey: '',
    model: '',
    temperature: 0.6,
    systemTemplate: DEFAULT_SYSTEM_TEMPLATE
  },
  resumeMarkdown: '',
  targetRole: ''
};

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 聊天闭环存储。与投递 store 分离。
 * backend: { get(k,d), set(k,v), del(k) }
 */
export function createChatStore(backend, { today = () => todayStr() } = {}) {
  const KEYS = {
    config: 'ra.boss.chat.config',
    greeted: 'ra.boss.chat.greeted',
    handled: 'ra.boss.chat.handled'
  };

  function getConfig() {
    const raw = backend.get(KEYS.config, null) || {};
    return {
      ...CHAT_DEFAULT_CONFIG,
      ...raw,
      llm: { ...CHAT_DEFAULT_CONFIG.llm, ...(raw.llm || {}) }
    };
  }

  function updateConfig(partial) {
    const cur = getConfig();
    const next = {
      ...cur,
      ...partial
    };
    if (partial.llm !== undefined) {
      // 整对象替换（默认值 + partial），避免合并残留旧 apiKey
      next.llm = { ...CHAT_DEFAULT_CONFIG.llm, ...(partial.llm || {}) };
    } else {
      next.llm = cur.llm;
    }
    backend.set(KEYS.config, next);
    return next;
  }

  function getGreeted() {
    return backend.get(KEYS.greeted, {}) || {};
  }

  function hasGreeted(convId) {
    return Boolean(getGreeted()[convId]);
  }

  function markGreeted(convId) {
    const map = { ...getGreeted(), [convId]: { at: Date.now(), date: today() } };
    backend.set(KEYS.greeted, map);
  }

  function getHandled() {
    return backend.get(KEYS.handled, {}) || {};
  }

  function lastHandled(convId) {
    return getHandled()[convId]?.seq ?? null;
  }

  function markHandled(convId, seq) {
    const map = { ...getHandled(), [convId]: { seq, at: Date.now() } };
    backend.set(KEYS.handled, map);
  }

  function clearGreeted() {
    backend.set(KEYS.greeted, {});
  }

  return {
    getConfig,
    updateConfig,
    hasGreeted,
    markGreeted,
    getGreeted,
    lastHandled,
    markHandled,
    clearGreeted,
    today
  };
}

/** OpenAI 兼容配置校验；返回 error 字符串或 null */
export function validateLlmConfig(cfg) {
  if (!cfg?.llm?.baseUrl) return '缺少 llm.baseUrl';
  if (!cfg?.llm?.apiKey) return '缺少 llm.apiKey';
  if (!cfg?.llm?.model) return '缺少 llm.model';
  return null;
}
