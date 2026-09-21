import { CHAT_SEL, normalizeText } from './selectors.js';

function clickLike(el) {
  if (!el) return false;
  try {
    el.click();
    return true;
  } catch {
    /* fallthrough */
  }
  const opts = { bubbles: true, cancelable: true, view: window };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
  return true;
}

export function findChatInput(doc = document) {
  for (const sel of CHAT_SEL.input.split(',').map((s) => s.trim())) {
    for (const el of doc.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (r.width < 40 || r.height < 16) continue;
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      return el;
    }
  }
  return null;
}

export function findSendButton(doc = document) {
  for (const sel of CHAT_SEL.sendBtnSel.split(',').map((s) => s.trim())) {
    const el = doc.querySelector(sel);
    if (el && CHAT_SEL.sendBtnText.test(normalizeText(el))) return el;
  }
  const nodes = doc.querySelectorAll('button, .btn, [role="button"]');
  for (const el of nodes) {
    if (CHAT_SEL.sendBtnText.test(normalizeText(el))) return el;
  }
  return null;
}

export function clickConversation(conv) {
  if (!conv?.el) return false;
  return clickLike(conv.el);
}

/** 写入并发送；beforeText 用于发送后比对 */
export async function sendChatMessage(text, { doc = document } = {}) {
  const input = findChatInput(doc);
  if (!input) return { ok: false, reason: 'input-not-found' };

  input.focus();
  if (input.tagName === 'TEXTAREA' || input.tagName === 'INPUT') {
    const proto = Object.getOwnPropertyDescriptor(
      input.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value'
    );
    proto?.set?.call(input, text);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    input.textContent = text;
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })
    );
  }

  await new Promise((r) => setTimeout(r, 200));
  const btn = findSendButton(doc);
  if (!btn) return { ok: false, reason: 'send-btn-not-found' };
  clickLike(btn);
  await new Promise((r) => setTimeout(r, 400));
  return { ok: true, reason: 'sent' };
}
