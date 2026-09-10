import { SEL } from './selectors.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function clickLike(el) {
  if (!el) return false;
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}

/**
 * @returns {Promise<'ok'|'skip'|'fail'>}
 */
export async function applyJob(job, { logger } = {}) {
  const root = job.el?.closest?.('li, .job-card-wrapper, .job-card-box') || job.el;
  if (!root) return 'fail';

  const btn0 = root.querySelector(SEL.applyBtn);
  const t0 = (btn0?.textContent || '').trim();
  if (/继续沟通/.test(t0)) return 'skip';

  const btn = root.querySelector(SEL.applyBtn);
  if (!btn) {
    logger?.emit('error', { where: 'apply', jobId: job.id, msg: 'apply button not found' });
    return 'fail';
  }

  clickLike(btn);
  await sleep(400);

  const dialogSend =
    document.querySelector('.boss-dialog .btn, .dialog-footer .btn, [class*="dialog"] button') ||
    Array.from(document.querySelectorAll('button, .btn')).find((b) => /^(发送|确定|继续沟通)/.test((b.textContent || '').trim()));
  if (dialogSend) {
    clickLike(dialogSend);
    await sleep(300);
  }

  const after = (root.querySelector(SEL.applyBtn)?.textContent || '').trim();
  if (/继续沟通|已沟通/.test(after)) return 'ok';
  await sleep(500);
  return 'ok';
}

export async function sendGreeting(job, greeting, { logger } = {}) {
  if (!greeting || !String(greeting).trim()) return 'fail';
  const text = String(greeting).replace(/<br\s*\/?>/gi, '\n');

  const input =
    document.querySelector('textarea.input-area, textarea[class*="chat"], .chat-input textarea, [contenteditable="true"]') ||
    document.querySelector('.chat-conversation textarea');

  if (!input) {
    logger?.emit('error', { where: 'greet', jobId: job.id, msg: 'chat input not found' });
    return 'fail';
  }

  input.focus();
  if ('value' in input) {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  } else {
    input.textContent = text;
    input.dispatchEvent(new InputEvent('input', { bubbles: true, data: text }));
  }
  await sleep(200);

  const sendBtn =
    document.querySelector('.btn-send, [class*="send"], .chat-input button') ||
    Array.from(document.querySelectorAll('button')).find((b) => /^发送$/.test((b.textContent || '').trim()));
  if (!sendBtn) {
    logger?.emit('error', { where: 'greet', jobId: job.id, msg: 'send button not found' });
    return 'fail';
  }
  clickLike(sendBtn);
  return 'ok';
}
