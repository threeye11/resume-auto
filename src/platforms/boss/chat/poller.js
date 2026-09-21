import { extractMessages } from './selectors.js';

/**
 * 轮询当前会话：对方新消息 seq > lastHandled 则触发一次。
 * 首次见到 convId：只建立 baseline，不触发草稿。
 * 之后若 store 无记录但本地 baseline 之后出现更新 seq，则触发并更新 baseline。
 */
export function createChatPoller({
  getConvId,
  getLastHandled,
  intervalMs = 2500,
  extract = () => extractMessages(document)
}) {
  let timer = null;
  /** @type {Map<string, number>} */
  const lastSeqByConv = new Map();
  const listeners = new Set();

  function poll() {
    const convId = getConvId?.();
    if (!convId) return;
    const messages = extract();
    const other = messages.filter((m) => m.role === 'other');
    if (!other.length) return;
    const latest = other[other.length - 1];
    const stored = getLastHandled?.(convId);

    // 本地已有 baseline
    if (lastSeqByConv.has(convId)) {
      const local = lastSeqByConv.get(convId);
      if (latest.seq <= local) return;
      lastSeqByConv.set(convId, latest.seq);
      const payload = { convId, seq: latest.seq, text: latest.text, messages };
      for (const fn of listeners) fn(payload);
      return;
    }

    // 无本地 baseline：若有 store 记录且消息更新 → 立即触发
    if (stored !== null && stored !== undefined) {
      if (latest.seq > stored) {
        lastSeqByConv.set(convId, latest.seq);
        const payload = { convId, seq: latest.seq, text: latest.text, messages };
        for (const fn of listeners) fn(payload);
      } else {
        lastSeqByConv.set(convId, latest.seq);
      }
      return;
    }

    // store 无记录：仅 baseline，避免把历史消息全当新回复
    lastSeqByConv.set(convId, latest.seq);
  }

  return {
    onNewReply(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
    start() {
      if (timer) return;
      timer = setInterval(poll, intervalMs);
    },
    stop() {
      if (timer) clearInterval(timer);
      timer = null;
    },
    pollOnce: poll,
    _lastSeqByConv: lastSeqByConv
  };
}
