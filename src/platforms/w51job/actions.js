import {
  SEL,
  findApplyButton,
  findPageApplyButton,
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

/** 投递后确认弹窗：点关闭/确定 */
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

/**
 * 51job 流程：只点「投递」。
 * 不点「去聊聊」——会拉起微信扫码，页面不支持脚本继续沟通。
 */
export async function applyJob(job, { logger } = {}) {
  const root = cardRoot(job);
  if (!root) {
    logger?.emit('error', { where: 'apply', jobId: job.id, msg: 'card element missing' });
    return 'fail';
  }

  let btn = findApplyButton(root);
  if (btn && isAppliedButton(btn)) return 'skip';

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

  clickLike(btn);
  await sleep(450);
  await dismissDialog({ logger });

  if (isAppliedButton(findApplyButton(root)) || isAppliedButton(findPageApplyButton())) {
    return 'ok';
  }

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

/** 51job 列表页无站内会话，不发脚本招呼语 */
export async function sendGreeting(job, greeting) {
  if (!greeting || !String(greeting).trim()) return 'fail';
  return 'fail';
}
