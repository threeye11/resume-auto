import { SEL, findApplyButton, findDetailApplyButton } from './selectors.js';

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
  return (btn?.textContent || '').trim();
}

/**
 * 策略：
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

  if (!btn || !SEL.applyText.test(btnText(btn))) {
    // 点击卡片让右侧详情刷新
    const cardLink = root.querySelector(SEL.cardLink) || root;
    clickLike(cardLink);
    await sleep(600);
    btn = findDetailApplyButton();
    viaDetail = true;
    if (!btn) {
      // 再等一轮，详情区可能异步渲染
      await sleep(400);
      btn = findDetailApplyButton();
    }
  }

  if (!btn) {
    logger?.emit('error', {
      where: 'apply',
      jobId: job.id,
      title: job.title,
      msg: 'apply button not found on card or detail'
    });
    return 'fail';
  }

  if (SEL.appliedText.test(btnText(btn))) return 'skip';

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

  await sleep(400);
  const after2 = btnText(findDetailApplyButton() || afterBtn);
  if (SEL.appliedText.test(after2)) return 'ok';

  // 点击已发出、文案未变也记 ok，由日志观察
  return 'ok';
}

export async function sendGreeting(job, greeting, { logger } = {}) {
  if (!greeting || !String(greeting).trim()) return 'fail';
  const text = String(greeting).replace(/<br\s*\/?>/gi, '\n');

  const input =
    document.querySelector(
      'textarea.input-area, textarea[class*="chat"], .chat-input textarea, .chat-conversation textarea'
    ) ||
    Array.from(document.querySelectorAll('textarea, [contenteditable="true"]')).find((el) => {
      const r = el.getBoundingClientRect();
      return r.width > 80 && r.height > 20;
    });

  if (!input) {
    logger?.emit('error', { where: 'greet', jobId: job.id, msg: 'chat input not found' });
    return 'fail';
  }

  input.focus();
  if ('value' in input && input.tagName === 'TEXTAREA') {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    input.textContent = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }
  await sleep(200);

  const sendBtn =
    Array.from(document.querySelectorAll('button, .btn')).find((b) => /^发送$/.test(btnText(b))) ||
    document.querySelector('.btn-send, .chat-input button');
  if (!sendBtn) {
    logger?.emit('error', { where: 'greet', jobId: job.id, msg: 'send button not found' });
    return 'fail';
  }
  clickLike(sendBtn);
  return 'ok';
}
