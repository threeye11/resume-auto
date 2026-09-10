const KEYS = {
  config: 'ra.config',
  applied: 'ra.applied',
  quota: 'ra.quota'
};

export const DEFAULT_CONFIG = {
  jobInclude: '',
  companyInclude: '',
  companyExclude: '',
  descExclude: '',
  salaryMin: 0,
  salaryMax: 0,
  dailyLimit: 100,
  greeting: '',
  delayMinMs: 800,
  delayMaxMs: 2000,
  skipNoSalary: false
};

function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** backend: { get(key, def), set(key, val), del(key) } */
export function createStore(backend, { today = () => todayStr() } = {}) {
  function getConfig() {
    const raw = backend.get(KEYS.config, null);
    return { ...DEFAULT_CONFIG, ...(raw || {}) };
  }

  function updateConfig(partial) {
    const next = { ...getConfig(), ...partial };
    backend.set(KEYS.config, next);
    return next;
  }

  function getApplied() {
    return backend.get(KEYS.applied, []) || [];
  }

  function markApplied(id) {
    const list = getApplied();
    if (!list.includes(id)) {
      list.push(id);
      const capped = list.length > 5000 ? list.slice(-5000) : list;
      backend.set(KEYS.applied, capped);
    }
  }

  function hasApplied(id) {
    return getApplied().includes(id);
  }

  function getQuota() {
    const raw = backend.get(KEYS.quota, null);
    const d = today();
    if (!raw || raw.date !== d) {
      return { date: d, count: 0 };
    }
    return raw;
  }

  function addQuota(n = 1) {
    const q = getQuota();
    const next = { date: q.date, count: q.count + n };
    backend.set(KEYS.quota, next);
    return next;
  }

  function resetQuotaForDate(date) {
    backend.set(KEYS.quota, { date, count: 0 });
  }

  return {
    getConfig,
    updateConfig,
    getApplied,
    markApplied,
    hasApplied,
    getQuota,
    addQuota,
    resetQuotaForDate,
    today
  };
}

/** 浏览器 GM 后端 */
export function gmBackend() {
  return {
    get: (k, d) => {
      try {
        const v = GM_getValue(k, d);
        return v === undefined || v === null ? d : v;
      } catch {
        return d;
      }
    },
    set: (k, v) => {
      try {
        GM_setValue(k, v);
      } catch {
        /* noop */
      }
    },
    del: (k) => {
      try {
        GM_deleteValue(k);
      } catch {
        /* noop */
      }
    }
  };
}
