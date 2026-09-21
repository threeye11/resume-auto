/** BOSS 聊天页选择器（文案兜底 + 常见 class） */
export const CHAT_SEL = {
  host: /(^|\.)zhipin\.com$/i,
  path: /\/web\/geek\/chat/,
  convList: [
    '[class*="conversation-list"]',
    '[class*="chat-list"]',
    '[class*="message-list"] aside',
    '.user-list',
    '[class*="userlist"]'
  ].join(', '),
  convItem: [
    '[class*="conversation-item"]',
    '[class*="chat-item"]',
    '[class*="user-card"]',
    '[class*="item-user"]',
    'li[class*="user"]'
  ].join(', '),
  convName: ['[class*="name"]', '[class*="user-name"]', 'p.name', '.name'].join(', '),
  convJob: ['[class*="job"]', '[class*="position"]'].join(', '),
  convCompany: ['[class*="company"]', '[class*="corp"]'].join(', '),
  convUnread: ['[class*="unread"]', '[class*="badge"]', '[class*="dot"]'].join(', '),
  messageList: [
    '[class*="message-list"]',
    '[class*="chat-msg"]',
    '[class*="conversation-content"]',
    '[class*="msg-list"]'
  ].join(', '),
  messageItem: [
    '[class*="message-item"]',
    '[class*="msg-item"]',
    '[class*="item-message"]',
    '[class*="bubble"]'
  ].join(', '),
  messageText: ['[class*="content"]', '[class*="text"]', 'p', 'span'].join(', '),
  /** 己方消息容器常见 class */
  messageSelf: /[class*="self"]|[class*="me"]|[class*="right"]/i,
  messageOther: /[class*="other"]|[class*="boss"]|[class*="left"]|[class*="recruiter"]/i,
  input: [
    'textarea',
    '[contenteditable="true"]',
    'textarea[class*="input"]',
    '[class*="chat-input"] textarea',
    '[class*="reply"] textarea'
  ].join(', '),
  sendBtnText: /^(发送|发送消息)$/,
  sendBtnSel: ['.btn-send', '[class*="send"] button', '[class*="chat-input"] button'].join(', ')
};

export function isChatPage(url) {
  const raw = url || (typeof location !== 'undefined' ? location.href : '');
  if (!raw) return false;
  try {
    const u = new URL(raw, 'https://www.zhipin.com');
    return CHAT_SEL.host.test(u.hostname) && CHAT_SEL.path.test(u.pathname);
  } catch {
    return false;
  }
}

export function normalizeText(el) {
  return (el?.textContent || '').replace(/\s+/g, ' ').trim();
}

export function convIdFrom(name, job, company) {
  const base = `${name || ''}|${job || ''}|${company || ''}`;
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (Math.imul(31, h) + base.charCodeAt(i)) | 0;
  }
  return `chat_${(h >>> 0).toString(36)}`;
}

export function extractConversations(doc = document) {
  const roots = [];
  for (const sel of CHAT_SEL.convList.split(',').map((s) => s.trim())) {
    doc.querySelectorAll(sel).forEach((n) => roots.push(n));
  }
  let items = [];
  if (roots.length) {
    for (const r of roots) {
      for (const sel of CHAT_SEL.convItem.split(',').map((s) => s.trim())) {
        r.querySelectorAll(sel).forEach((n) => items.push(n));
      }
    }
  }
  if (!items.length) {
    // 兜底：整页疑似会话卡片
    items = Array.from(doc.querySelectorAll(CHAT_SEL.convItem)).filter((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 40 && r.height > 20;
    });
  }

  const out = [];
  const seen = new Set();
  for (const el of items) {
    const name =
      normalizeText(el.querySelector(CHAT_SEL.convName)) ||
      normalizeText(el).slice(0, 20);
    if (!name || name.length > 40) continue;
    const job = normalizeText(el.querySelector(CHAT_SEL.convJob)).slice(0, 40);
    const company = normalizeText(el.querySelector(CHAT_SEL.convCompany)).slice(0, 40);
    const id = convIdFrom(name, job, company);
    if (seen.has(id)) continue;
    seen.add(id);
    const unread = Boolean(el.querySelector(CHAT_SEL.convUnread));
    out.push({ id, name, job, company, unread, el });
  }
  return out;
}

export function extractMessages(doc = document) {
  const nodes = [];
  for (const sel of CHAT_SEL.messageList.split(',').map((s) => s.trim())) {
    doc.querySelectorAll(sel).forEach((n) => nodes.push(n));
  }
  let msgs = [];
  const scopes = nodes.length ? nodes : [doc];
  for (const scope of scopes) {
    for (const sel of CHAT_SEL.messageItem.split(',').map((s) => s.trim())) {
      scope.querySelectorAll(sel).forEach((n) => msgs.push(n));
    }
  }
  if (!msgs.length) return [];

  return msgs.map((el, index) => {
    const cls = (el.className || '') + ' ' + (el.parentElement?.className || '');
    const text = normalizeText(el.querySelector(CHAT_SEL.messageText) || el);
    let role = 'other';
    if (CHAT_SEL.messageSelf.test(cls)) role = 'self';
    else if (CHAT_SEL.messageOther.test(cls)) role = 'other';
    return { seq: index, text, role, el };
  });
}

/** 启发式：是否适合主动问候（仅己方短对话或有未读） */
export function shouldProactiveGreet(conv, messages) {
  if (conv.unread) return true;
  if (!messages || messages.length === 0) return true;
  if (messages.length > 6) return false;
  const last = messages[messages.length - 1];
  return last?.role === 'self' && messages.filter((m) => m.role === 'other').length === 0;
}

export function formatHistoryForLlm(messages, limit = 10) {
  return messages
    .slice(-limit)
    .map((m) => `${m.role === 'self' ? '我' : '对方'}：${m.text}`)
    .join('\n');
}
