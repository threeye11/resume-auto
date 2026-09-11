import { SEL, findApplyButton, findDetailApplyButton, isApplyButton, normalizeBtnText } from './selectors.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clickLike(el) {
  if (!el) return false;
  // 优先原生 click（React/Vue 更容易吃到）；失败再补完整指针序列
  try {
    el.click();
    return true;
  } catch {
    /* fallthrough */
  }
  const opts = { bubbles: true, cancelable: true, view: window, buttons: 1 };
  el.dispatchEvent(new PointerEvent('pointerdown', opts));
  el.dispatchEvent(new MouseEvent('mousedown', opts));
  el.dispatchEvent(new PointerEvent('pointerup', opts));
  el.dispatchEvent(new MouseEvent('mouseup', opts));
  el.dispatchEvent(new MouseEvent('click', opts));
  return true;
}

function cardRoot(job) {
  return (
    job.el?.closest?.('li.job-card-wrapper, li, .job-card-wrapper, .job-card-box, .job-card-left') ||
    job.el
  );
}

function btnText(btn) {
  return normalizeBtnText(btn);
}

/**
 * 策略（严格按文案，绝不点「收藏」）：
 * 1. 卡片上有「立即沟通」→ 直接点
 * 2. 没有 → 点卡片选中，再在右侧详情里点「立即沟通」
 */
export async function applyJob(job, { logger } = {}) {
  const root = cardRoot(job);
  if (!root) {
    logger?.emit('error', { where: 'apply', jobId: job.id, msg: 'card element missing' });
    return 'fail';
  }

  // 已投过
  const existing = findApplyButton(root) || findDetailApplyButton();
  if (existing && SEL.appliedText.test(btnText(existing))) return 'skip';

  let btn = findApplyButton(root);
  let viaDetail = false;

  if (!btn) {
    // 点击卡片让右侧详情刷新
    const cardLink = root.querySelector(SEL.cardLink) || root;
    clickLike(cardLink);
    await sleep(600);
    btn = findDetailApplyButton();
    viaDetail = true;
    if (!btn) {
      await sleep(400);
      btn = findDetailApplyButton();
    }
  }

  if (!btn || !isApplyButton(btn)) {
    logger?.emit('error', {
      where: 'apply',
      jobId: job.id,
      title: job.title,
      msg: `apply button not found (nearest="${btnText(btn)}")`
    });
    return 'fail';
  }

  if (SEL.appliedText.test(btnText(btn))) return 'skip';

  logger?.emit('apply', {
    jobId: job.id,
    title: job.title,
    status: `click:${btnText(btn)}`,
    viaDetail
  });
  clickLike(btn);
  await sleep(450);

  // 弹窗确认（招呼语 / 确认投递）
  const dialogSend =
    document.querySelector('.boss-dialog .btn, .dialog-footer .btn, [class*="dialog"] .btn') ||
    Array.from(document.querySelectorAll('button, .btn')).find((b) =>
      /^(发送|确定|发送并继续)$/.test(btnText(b))
    );
  if (dialogSend && dialogSend !== btn) {
    clickLike(dialogSend);
    await sleep(350);
  }

  const afterBtn = viaDetail ? findDetailApplyButton() : findApplyButton(root) || findDetailApplyButton();
  const after = btnText(afterBtn);
  if (SEL.appliedText.test(after)) return 'ok';

  await sleep(500);
  const after2 = btnText(findDetailApplyButton() || findApplyButton(root) || afterBtn);
  if (SEL.appliedText.test(after2)) return 'ok';

  // 仍显示「立即沟通」说明没点成功——不能记 ok，否则会污染去重库
  if (after2 === '立即沟通' || after === '立即沟通') {
    logger?.emit('error', {
      where: 'apply',
      jobId: job.id,
      title: job.title,
      msg: `click did not apply, still "${after2 || after}"`
    });
    return 'fail';
  }
  return 'fail';
}

function findVisibleChatInput() {
  const sels = [
    'textarea.input-area',
    'textarea[class*="chat"]',
    '.chat-input textarea',
    '.chat-conversation textarea',
    '.msg-input textarea',
    'textarea',
    '[contenteditable="true"]'
  ];
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (r.width < 40 || r.height < 16) continue;
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      return el;
    }
  }
  return null;
}

function findContinueChatButton() {
  const nodes = document.querySelectorAll('a, button, .btn, [role="button"]');
  for (const b of nodes) {
    const t = (b.textContent || '').replace(/\s/g, '');
    if (t === '继续沟通') return b;
  }
  return null;
}

export async function sendGreeting(job, greeting, { logger } = {}) {
  if (!greeting || !String(greeting).trim()) return 'fail';
  const text = String(greeting).replace(/<br\s*\/?>/gi, '\n');

  // 列表页点完「立即沟通」后，聊天框可能延迟出现；先等再找
  let input = findVisibleChatInput();
  if (!input) {
    const cont = findContinueChatButton();
    if (cont) {
      clickLike(cont);
      await sleep(600);
      input = findVisibleChatInput();
    }
  }
  if (!input) {
    await sleep(500);
    input = findVisibleChatInput();
  }

  if (!input) {
    logger?.emit('error', {
      where: 'greet',
      jobId: job.id,
      msg: 'chat input not found（列表页投递后未弹出会话；可清空招呼语或稍后在消息页手动发）'
    });
    return 'fail';
  }

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
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' }));
  }
  await sleep(250);

  const sendBtn =
    Array.from(document.querySelectorAll('button, .btn')).find((b) =>
      /^发送$/.test((b.textContent || '').replace(/\s/g, ''))
    ) || document.querySelector('.btn-send, .chat-input button');
  if (!sendBtn) {
    logger?.emit('error', { where: 'greet', jobId: job.id, msg: 'send button not found' });
    return 'fail';
  }
  clickLike(sendBtn);
  return 'ok';
}
