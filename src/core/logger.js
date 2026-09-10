/**
 * 轻量事件总线。type: scan|filter|dedupe|quota|apply|greet|error|progress|done
 */
export function createLogger({ historyLimit = 200 } = {}) {
  const handlers = new Map();
  const history = [];

  function on(type, fn) {
    if (!handlers.has(type)) handlers.set(type, new Set());
    handlers.get(type).add(fn);
    return () => off(type, fn);
  }

  function off(type, fn) {
    handlers.get(type)?.delete(fn);
  }

  function emit(type, payload = {}) {
    const entry = { type, payload, ts: Date.now() };
    history.push(entry);
    if (history.length > historyLimit) history.shift();
    const set = handlers.get(type);
    if (set) for (const fn of set) fn(payload, entry);
    const any = handlers.get('*');
    if (any) for (const fn of any) fn(payload, entry);
  }

  function recent() {
    return history.slice();
  }

  function clearHistory() {
    history.length = 0;
  }

  return { on, off, emit, recent, clearHistory };
}
