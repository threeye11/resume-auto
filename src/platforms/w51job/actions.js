import {
  SEL,
  findApplyButton,
  findChatButton,
  findPageApplyButton,
  findPageChatButton,
  isApplyButton,
  isAppliedButton,
  normalizeBtnText
} from './selectors.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clickLike(el) {
  if (!el) return false;
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
    job.el?.closest?.('li, .e, .tbox, [class*="job-item"], [class*="joblist"] > *') || job.el
  );
}

function btnText(btn) {
  return normalizeBtnText(btn);
}

function findByText(root, re) {
  const scope = root || document;
  const nodes = scope.querySelectorAll('a, button, .btn, [role="button"], span[class*="btn"]');
  for (const el of nodes) {
    if (re.test(btnText(el))) return el;
  }
  return null;
}

/** 投递成功后的确认弹窗：点关闭/确定，不要点进无关页 */
async function dismissDialog({ logger } = {}) {
  for (let i = 0; i < 5; i++) {
    const stay =
      findByText(document, /^留在此页$|^关闭$|^知道了$|^确定$|^继续浏览$|^暂不$|^完成$/) ||
      document.querySelector(
        '[class*="dialog"] .close, [class*="modal"] .close, [class*="icon-close"]'
      );
    if (stay) {
      const t = btnText(stay);
      if (/收藏|举报|分享/.test(t)) {
        await sleep(150);
        continue;
      }
      clickLike(stay);
      await sleep(250);
      logger?.emit('apply', { status: `dialog:${t || 'close'}` });
      return 'dismissed';
    }
    await sleep(180);
  }
  return 'none';
}

/** 第二步：点「去聊聊」打开会话（不离开列表时可侧栏聊天） */
async function clickChat({ logger, root } = {}) {
  let chat = findChatButton(root) || findPageChatButton();
  if (!chat) {
    await sleep(300);
    chat = findChatButton(root) || findPageChatButton();
  }
  if (!chat) {
    logger?.emit('apply', { status: 'chat:not-found' });
    return 'none';
  }
  clickLike(chat);
  await sleep(500);
  // 聊天页可能弹引导，关掉
  await dismissDialog({ logger });
  logger?.emit('apply', { status: `chat:${btnText(chat)}` });
  return 'clicked';
}

function findVisibleChatInput() {
  const sels = [
    'textarea',
    '[contenteditable="true"]',
    'textarea[class*="chat"]',
    '.chat-input textarea',
    '[class*="chat"] [contenteditable]'
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

/**
 * 51job 流程：
 * 1. 点「投递」
 * 2. 点「去聊聊」
 */
export async function applyJob(job, { logger } = {}) {
  const root = cardRoot(job);
  if (!root) {
    logger?.emit('error', { where: 'apply', jobId: job.id, msg: 'card element missing' });
    return 'fail';
  }

  let btn = findApplyButton(root);
  if (btn && isAppliedButton(btn)) {
    // 已投过但可能还没聊——仍尝试点去聊聊
    await clickChat({ logger, root });
    return 'skip';
  }

  if (!btn || !isApplyButton(btn)) {
    const link = root.querySelector('a') || root;
    clickLike(link);
    await sleep(500);
    btn = findPageApplyButton();
    if (!btn) {
      await sleep(400);
      btn = findPageApplyButton();
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

  // 第一步：投递
  clickLike(btn);
  await sleep(450);
  await dismissDialog({ logger });

  // 第二步：去聊聊
  await clickChat({ logger, root });

  const appliedNow =
    isAppliedButton(findApplyButton(root)) || isAppliedButton(findPageApplyButton());
  if (appliedNow) return 'ok';

  await sleep(300);
  if (isAppliedButton(findPageApplyButton()) || isAppliedButton(findApplyButton(root))) {
    return 'ok';
  }

  logger?.emit('apply', {
    jobId: job.id,
    title: job.title,
    status: 'clicked-unverified'
  });
  return 'ok';
}

/** 去聊聊打开会话后，尝试把配置里的招呼语写入并发送 */
export async function sendGreeting(job, greeting, { logger } = {}) {
  if (!greeting || !String(greeting).trim()) return 'fail';
  const text = String(greeting).replace(/<br\s*\/?>/gi, '\n');

  let input = findVisibleChatInput();
  if (!input) {
    await sleep(500);
    input = findVisibleChatInput();
  }
  if (!input) {
    logger?.emit('error', { where: 'greet', jobId: job.id, msg: 'chat input not found after 去聊聊' });
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
    input.dispatchEvent(
      new InputEvent('input', { bubbles: true, data: text, inputType: 'insertText' })
    );
  }
  await sleep(250);

  const sendBtn =
    findByText(document, /^发送$|^发送消息$/) ||
    document.querySelector('.btn-send, [class*="chat"] button[type="submit"]');
  if (!sendBtn) {
    logger?.emit('error', { where: 'greet', jobId: job.id, msg: 'send button not found' });
    return 'fail';
  }
  clickLike(sendBtn);
  return 'ok';
}
