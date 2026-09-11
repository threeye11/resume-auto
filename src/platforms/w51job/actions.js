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

/** 投递后弹窗：只点留在列表/关闭，绝不点进聊天 */
async function dismissDialog({ logger } = {}) {
  for (let i = 0; i < 5; i++) {
    const stay =
      findByText(document, /^留在此页$|^关闭$|^知道了$|^确定$|^继续浏览$|^暂不$/) ||
      document.querySelector('[class*="dialog"] .close, [class*="modal"] .close, [class*="icon-close"]');
    if (stay && !/^已投递$/.test(btnText(stay))) {
      // 避免误点「继续沟通」类
      if (/继续沟通|去沟通|聊一聊/.test(btnText(stay))) {
        await sleep(150);
        continue;
      }
      clickLike(stay);
      await sleep(250);
      logger?.emit('apply', { status: `dialog:${btnText(stay) || 'close'}` });
      return 'dismissed';
    }
    await sleep(180);
  }
  return 'none';
}

export async function applyJob(job, { logger } = {}) {
  const root = cardRoot(job);
  if (!root) {
    logger?.emit('error', { where: 'apply', jobId: job.id, msg: 'card element missing' });
    return 'fail';
  }

  let btn = findApplyButton(root);
  if (btn && isAppliedButton(btn)) return 'skip';
  // 整页可能已是已投递状态
  const pageBtn = findPageApplyButton();
  if ((!btn || !isApplyButton(btn)) && pageBtn && isAppliedButton(pageBtn)) return 'skip';

  if (!btn || !isApplyButton(btn)) {
    // 点卡片让右侧详情刷新
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

  if (isAppliedButton(btn)) return 'skip';

  clickLike(btn);
  await sleep(400);
  await dismissDialog({ logger });

  const after = btnText(findApplyButton(root) || findPageApplyButton());
  if (isAppliedButton(findApplyButton(root)) || isAppliedButton(findPageApplyButton())) {
    return 'ok';
  }
  if (SEL.appliedText.test(after)) return 'ok';

  await sleep(400);
  if (isAppliedButton(findPageApplyButton()) || isAppliedButton(findApplyButton(root))) {
    return 'ok';
  }

  // 51job 有时点了不改文案但会 toast；点过且不是明确失败则算 ok
  logger?.emit('apply', {
    jobId: job.id,
    title: job.title,
    status: 'clicked-unverified'
  });
  return 'ok';
}

export async function sendGreeting(job, greeting, { logger } = {}) {
  // 51job 批量列表页通常无会话输入框；不跳转
  if (!greeting || !String(greeting).trim()) return 'fail';
  return 'fail';
}
