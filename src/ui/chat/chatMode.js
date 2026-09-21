import { mountTerminal } from '../terminal/terminal.js';
import { CHAT_FIELDS } from '../terminal/config-drawer.js';
import { createLogger } from '../../core/logger.js';
import { createChatStore, validateLlmConfig } from '../../core/chatStore.js';
import { chatComplete } from '../../core/llm.js';
import { gmBackend } from '../../core/store.js';
import {
  isChatPage,
  extractConversations,
  extractMessages,
  shouldProactiveGreet,
  formatHistoryForLlm,
  convIdFrom
} from '../../platforms/boss/chat/selectors.js';
import { clickConversation, sendChatMessage } from '../../platforms/boss/chat/send.js';
import { createChatPoller } from '../../platforms/boss/chat/poller.js';
import { createVaultStore } from '../../core/vault.js';
import { mountVaultPanel, createVaultAwareChatStore } from '../vaultPanel.js';

function memBackend() {
  const m = new Map();
  return {
    get: (k, d) => (m.has(k) ? m.get(k) : d),
    set: (k, v) => m.set(k, v),
    del: (k) => m.delete(k)
  };
}

export function mountChatMode({ logger, store, backend, vault } = {}) {
  const log = logger || createLogger();
  const usedBackend =
    backend || (store ? null : typeof GM_getValue === 'function' ? gmBackend() : memBackend());
  const chatStoreRaw = store || createChatStore(usedBackend);
  const vaultStore = vault || createVaultStore(usedBackend || gmBackendSafe());
  const chatStore = createVaultAwareChatStore(chatStoreRaw, vaultStore);
  const drafts = [];
  const draftListeners = new Set();

  function gmBackendSafe() {
    try {
      if (typeof GM_getValue === 'function') return gmBackend();
    } catch {
      /* node */
    }
    return memBackend();
  }

  /** 合并 vault 中的敏感字段到配置视图 */
  function effectiveConfig() {
    return chatStore.getEffectiveConfig();
  }

  function assertLlmReady(cfg) {
    if (vaultStore.isEnabled() && !vaultStore.isUnlocked()) {
      return '保险库已锁定，请先在配置中输入 PIN 解锁';
    }
    return validateLlmConfig(cfg);
  }

  vaultStore.onLock?.(() => {
    log.emit('error', { where: 'vault', msg: '保险库已自动锁定，敏感字段已从内存清除' });
  });

  function emitDraft(d) {
    drafts.push(d);
    for (const fn of draftListeners) fn(d, drafts);
  }

  function onDraft(fn) {
    draftListeners.add(fn);
    return () => draftListeners.delete(fn);
  }

  let chatPaused = false;

  async function runProactive() {
    const cfg = effectiveConfig();
    chatPaused = false;
    if (!cfg.proactiveEnabled) {
      log.emit('error', { where: 'chat', msg: '未开启主动问候开关' });
      return;
    }
    if (cfg.proactiveSource === 'llm') {
      const err = assertLlmReady(cfg);
      if (err) {
        log.emit('error', { where: 'chat', msg: `LLM/保险库：${err}` });
        return;
      }
    }
    if (cfg.proactiveSource === 'custom' && !String(cfg.proactiveCustom || '').trim()) {
      log.emit('error', { where: 'chat', msg: '自定义问候内容为空' });
      return;
    }

    const convs = extractConversations();
    log.emit('scan', { count: convs.length, note: `会话列表 ${convs.length} 条` });

    let sent = 0;
    const max = Number(cfg.proactiveMaxPerRun) || 10;
    let streakFail = 0;

    for (const conv of convs) {
      if (chatPaused) break;
      if (sent >= max) break;
      if (chatStore.hasGreeted(conv.id)) {
        log.emit('dedupe', { title: conv.name, status: '已问候跳过' });
        continue;
      }
      clickConversation(conv);
      await sleep(500);
      const messages = extractMessages();
      if (!shouldProactiveGreet(conv, messages)) {
        log.emit('filter', { note: `${conv.name || conv.id} 不适合主动问候` });
        continue;
      }

      let text = '';
      if (cfg.proactiveSource === 'custom') {
        text = String(cfg.proactiveCustom).replace(/<br\s*\/?>/gi, '\n').trim();
      } else {
        try {
          text = await chatComplete(cfg.llm, {
            scene: 'proactive',
            hrName: conv.name,
            jobTitle: conv.job,
            company: conv.company,
            resumeMarkdown: cfg.resumeMarkdown,
            targetRole: cfg.targetRole,
            recentMessages: formatHistoryForLlm(messages)
          });
        } catch (e) {
          log.emit('error', { where: 'llm', msg: e.message || String(e) });
          streakFail += 1;
          if (streakFail >= 3) break;
          continue;
        }
      }

      if (cfg.proactiveSource === 'llm') {
        // LLM 问候也走草稿确认（与回复一致）
        emitDraft({
          kind: 'proactive',
          convId: conv.id,
          name: conv.name,
          company: conv.company,
          preview: text,
          text
        });
        log.emit('greet', { status: 'draft', title: conv.name });
        continue;
      }

      const r = await sendChatMessage(text);
      if (r.ok) {
        sent += 1;
        streakFail = 0;
        chatStore.markGreeted(conv.id);
        log.emit('greet', { status: 'ok', title: conv.name });
      } else {
        streakFail += 1;
        log.emit('error', { where: 'chat', msg: `发送失败 ${conv.name}: ${r.reason}` });
        if (streakFail >= 3) break;
      }
      const min = cfg.delayMinMs || 2000;
      const maxd = cfg.delayMaxMs || 4000;
      await sleep(min + Math.floor(Math.random() * Math.max(1, maxd - min)));
    }

    log.emit('done', { ok: sent, note: `主动问候完成（发送 ${sent}）` });
  }

  const poller = createChatPoller({
    getConvId: () => {
      const msgs = extractMessages();
      if (!msgs.length) return null;
      // 无会话 id 时用页面当前可见名粗粒度
      return 'current';
    },
    getLastHandled: (id) => chatStore.lastHandled(id)
  });

  poller.onNewReply(async ({ convId, seq, text, messages }) => {
    const cfg = effectiveConfig();
    if (!cfg.autoReplyEnabled) return;
    log.emit('error', { where: 'chat', msg: `检测到 HR 回复：${String(text).slice(0, 40)}` });
    const err = assertLlmReady(cfg);
    if (err) {
      log.emit('error', { where: 'llm', msg: err });
      return;
    }
    try {
      const draft = await chatComplete(cfg.llm, {
        scene: 'reply',
        hrName: '',
        jobTitle: '',
        company: '',
        resumeMarkdown: cfg.resumeMarkdown,
        targetRole: cfg.targetRole,
        recentMessages: formatHistoryForLlm(messages)
      });
      emitDraft({
        kind: 'reply',
        convId,
        seq,
        name: convId,
        preview: String(text).slice(0, 60),
        text: draft
      });
      // 不在草稿创建时 markHandled；发送成功后再写入
      log.emit('greet', { status: 'draft-reply', title: convId });
    } catch (e) {
      log.emit('error', { where: 'llm', msg: e.message || String(e) });
    }
  });

  function startPoller() {
    const cfg = chatStore.getConfig();
    if (!cfg.autoReplyEnabled) {
      log.emit('error', { where: 'chat', msg: '自动回复草稿未开启' });
      return;
    }
    poller.start();
    log.emit('scan', { note: 'HR 回复监听已启动（仅草稿）' });
  }

  async function sendDraft(index) {
    const d = drafts[index];
    if (!d) return false;
    const r = await sendChatMessage(d.text);
    if (r.ok) {
      if (d.kind === 'proactive' && d.convId) chatStore.markGreeted(d.convId);
      if (d.kind === 'reply' && d.convId) chatStore.markHandled(d.convId, d.seq ?? Date.now());
    }
    log.emit('greet', { status: r.ok ? 'ok' : 'fail', title: d.name || d.convId });
    return r.ok;
  }

  function skipDraft(index) {
    drafts.splice(index, 1);
    log.emit('greet', { status: 'skip-draft' });
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  const controls = {
    onStart: () => {
      log.emit('scan', { note: 'chat 模式：开始主动问候' });
      runProactive();
      startPoller();
    },
    onPause: () => {
      chatPaused = true;
      log.emit('error', { where: 'chat', msg: '已暂停（主动问候循环将停止）' });
    },
    onStop: () => {
      chatPaused = true;
      poller.stop();
      log.emit('done', { ok: 0, note: 'chat 已停止' });
    }
  };

  return {
    logger: log,
    store: chatStore,
    vault: vaultStore,
    effectiveConfig,
    controls,
    onDraft,
    getDrafts: () => drafts.slice(),
    drafts,
    sendDraft,
    skipDraft,
    runProactive,
    startPoller,
    poller
  };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

export function bootChatIfNeeded() {
  if (!isChatPage()) return null;
  const logger = createLogger();
  const chat = mountChatMode({ logger, backend: gmBackend() });
  const ui = mountTerminal({
    logger,
    store: {
      getConfig: () => chat.store.getConfig(),
      updateConfig: (p) => chat.store.updateConfig(p)
    },
    controls: chat.controls,
    configFields: CHAT_FIELDS
  });

  const drawerEl =
    ui.root?.querySelector?.('.ra-drawer') || document.querySelector('#ra-root .ra-drawer');
  if (drawerEl) {
    // 传入 vault-aware store：setup/改 PIN 后走同一套 scrub（敏感路径写空）
    mountVaultPanel(drawerEl, { vault: chat.vault, chatStore: chat.store });
  }
  chat.onDraft((d, all) => {
    logger.emit('apply', {
      title: d.name,
      company: d.company,
      status: `草稿#${all.length - 1}: ${String(d.preview || '').slice(0, 24)}`
    });
    renderDrafts();
  });

  function renderDrafts() {
    let panel = document.getElementById('ra-chat-drafts');
    if (!panel) {
      panel = document.createElement('div');
      panel.id = 'ra-chat-drafts';
      panel.style.cssText =
        'padding:8px 12px;border-top:1px solid rgba(255,255,255,.08);max-height:140px;overflow:auto;font-size:12px';
      ui.root?.appendChild?.(panel) || document.getElementById('ra-root')?.appendChild(panel);
    }
    const list = chat.getDrafts();
    panel.innerHTML = list
      .map(
        (d, i) => `
      <div style="margin-bottom:8px;border-bottom:1px solid rgba(255,255,255,.06);padding-bottom:6px">
        <div style="color:#a0a0a0">${escapeHtml(d.kind)} · ${escapeHtml(d.name || d.convId)} ${escapeHtml(d.preview || '')}</div>
        <div style="margin:4px 0;white-space:pre-wrap;color:#e0e0e0">${escapeHtml(String(d.text).slice(0, 160))}</div>
        <button type="button" class="ra-btn primary" data-draft-send="${i}">发送</button>
        <button type="button" class="ra-btn" data-draft-skip="${i}">跳过</button>
      </div>`
      )
      .join('');
  }

  document.getElementById('ra-root')?.addEventListener('click', async (e) => {
    const send = e.target.closest?.('[data-draft-send]');
    if (send) {
      const i = Number(send.getAttribute('data-draft-send'));
      await chat.sendDraft(i);
      chat.drafts?.splice?.(i, 1);
      renderDrafts();
      return;
    }
    const skip = e.target.closest?.('[data-draft-skip]');
    if (skip) {
      const i = Number(skip.getAttribute('data-draft-skip'));
      chat.skipDraft(i);
      renderDrafts();
    }
  });

  ui.setStatus('就绪 · chat · 开关见配置');
  window.__raChat = { ...chat, ui, convIdFrom };
  return { chat, ui };
}
