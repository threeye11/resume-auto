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

function findDialogRoot() {
  const sels = [
    '[class*="boss-dialog"]',
    '[class*="dialog-box"]',
    '[class*="modal"]',
    '[role="dialog"]'
  ];
  for (const sel of sels) {
    for (const el of document.querySelectorAll(sel)) {
      const r = el.getBoundingClientRect();
      const style = window.getComputedStyle(el);
      if (r.width < 120 || r.height < 60) continue;
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const t = el.textContent || '';
      if (/已向BOSS发送消息|留在此页|继续沟通/.test(t)) return el;
    }
  }
  return null;
}

function findByText(root, re) {
  const scope = root || document;
  const nodes = scope.querySelectorAll('a, button, .btn, [role="button"], span[class*="btn"]');
  for (const el of nodes) {
    if (re.test(btnText(el))) return el;
  }
  return null;
}

/** 找「留在此页」：优先弹窗内，再整页（绝不点继续沟通） */
function findStayButton() {
  const dialog = findDialogRoot();
  if (dialog) {
    const stay = findByText(dialog, /^留在此页$/);
    if (stay) return stay;
  }
  return findByText(document, /^留在此页$/);
}

/**
 * 处理「已向BOSS发送消息」弹窗。
 * 批量投递：只点「留在此页」，绝不能点「继续沟通」（会跳进聊天页打断队列）。
 */
async function dismissApplyDialog({ logger } = {}) {
  for (let i = 0; i < 6; i++) {
    const stay = findStayButton();
    if (stay) {
      clickLike(stay);
      await sleep(350);
      // 弹窗若还在，再点一次
      if (findStayButton()) {
        clickLike(findStayButton());
        await sleep(250);
      }
      logger?.emit('apply', { status: 'dialog:留在此页' });
      return 'stayed';
    }
    // 弹窗可能刚出来按钮还没挂上
    await sleep(180);
  }
  return 'none';
}

/**
 * 策略（严格按文案，绝不点「收藏」「继续沟通」）：
 * 1. 卡片上有「立即沟通」→ 直接点
 * 2. 没有 → 点卡片选中，再在右侧详情里点「立即沟通」
 * 3. 弹窗 → 只点「留在此页」
 */
export async function applyJob(job, { logger } = {}) {
  const root = cardRoot(job);
  if (!root) {
    logger?.emit('error', { where: 'apply', jobId: job.id, msg: 'card element missing' });
    return 'fail';
  }

  // 已投过（文案变成继续沟通）
  const existing = findApplyButton(root) || findDetailApplyButton();
  if (existing && SEL.appliedText.test(btnText(existing))) return 'skip';

  let btn = findApplyButton(root);
  let viaDetail = false;

  if (!btn) {
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

  // 绝不点「继续沟通」——那会进聊天
  if (btnText(btn) === '继续沟通') return 'skip';
  if (btnText(btn) !== '立即沟通' && btnText(btn) !== '投递简历') {
    logger?.emit('error', {
      where: 'apply',
      jobId: job.id,
      msg: `refuse to click "${btnText(btn)}"`
    });
    return 'fail';
  }

  clickLike(btn);
  await sleep(450);

  const dialogResult = await dismissApplyDialog({ logger });

  const afterBtn = viaDetail
    ? findDetailApplyButton()
    : findApplyButton(root) || findDetailApplyButton();
  const after = btnText(afterBtn);
  if (SEL.appliedText.test(after)) return 'ok';

  await sleep(400);
  const after2 = btnText(findDetailApplyButton() || findApplyButton(root) || afterBtn);
  if (SEL.appliedText.test(after2)) return 'ok';

  if (dialogResult === 'stayed') return 'ok';

  if (after2 === '立即沟通' || after === '立即沟通') {
    logger?.emit('error', {
      where: 'apply',
      jobId: job.id,
      title: job.title,
      msg: `click did not apply, still "${after2 || after}", dialog=${dialogResult}`
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

/**
 * 补发自定义招呼语。
 * 批量模式：只在当前页已有输入框时写入；绝不点「继续沟通」跳转聊天。
 */
export async function sendGreeting(job, greeting, { logger } = {}) {
  if (!greeting || !String(greeting).trim()) return 'fail';
  const text = String(greeting).replace(/<br\s*\/?>/gi, '\n');

  let input = findVisibleChatInput();
  if (!input) {
    await sleep(400);
    input = findVisibleChatInput();
  }
  if (!input) {
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
    Array.from(document.querySelectorAll('button, .btn')).find((b) =>
      /^发送$/.test(btnText(b))
    ) || document.querySelector('.btn-send, .chat-input button');
  if (!sendBtn) {
    logger?.emit('error', { where: 'greet', jobId: job.id, msg: 'send button not found' });
    return 'fail';
  }
  clickLike(sendBtn);
  return 'ok';
}
