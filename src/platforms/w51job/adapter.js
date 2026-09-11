import { SEL, textOf, makeId, findApplyButton, isAppliedButton, normalizeBtnText } from './selectors.js';
import { applyJob, sendGreeting, closeOverlays } from './actions.js';

function clickLike(el) {
  if (!el) return false;
  try {
    el.click();
    return true;
  } catch {
    /* fallthrough */
  }
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
  return true;
}

export function createW51Adapter({ logger } = {}) {
  function matchHost() {
    return SEL.host.test(location.hostname);
  }

  function extractList() {
    let cards = Array.from(document.querySelectorAll(SEL.jobCard));
    if (cards.length === 0) {
      const btns = Array.from(document.querySelectorAll('a, button, .btn')).filter((b) =>
        SEL.applyText.test((b.textContent || '').replace(/\s/g, ''))
      );
      cards = btns.map((b) => b.closest('li, .e, .tbox, [class*="item"]') || b.parentElement);
    }

    const jobs = [];
    const seen = new Set();
    for (const el of cards) {
      if (!el || el === document.body) continue;
      // 跳过弹层内的节点，避免微信扫码弹窗污染列表
      if (el.closest('[class*="dialog"], [class*="modal"], [class*="mask"]')) continue;
      const title =
        textOf(el, SEL.title) || textOf(el, 'a') || (el.querySelector('a')?.title ?? '');
      const company = textOf(el, SEL.company);
      const salaryText = textOf(el, SEL.salary);
      const area = textOf(el, SEL.area);
      if (!title || title.length > 80) continue;
      const href = el.querySelector('a')?.href || '';
      const id = makeId(title, company, salaryText, href);
      if (seen.has(id)) continue;
      seen.add(id);
      jobs.push({ id, title, company, salaryText, city: area, el, href });
    }
    return jobs;
  }

  function isApplied(job) {
    const root = job.el?.closest?.('li, .e, .tbox, [class*="job-item"]') || job.el;
    const btn = findApplyButton(root);
    return isAppliedButton(btn);
  }

  function listSignature() {
    return extractList()
      .map((j) => j.id)
      .join('|');
  }

  /** 当前高亮页码（分页条里带 on/active/current 类或橙色选中） */
  function getActivePage() {
    const nodes = document.querySelectorAll(
      '[class*="pagination"] *, [class*="page"] *, [class*="pager"] *'
    );
    let found = 0;
    for (const el of nodes) {
      const t = normalizeBtnText(el);
      if (!/^\d{1,3}$/.test(t)) continue;
      const cls = (el.className || '').toString();
      if (/on|active|current|select|checked|cur/.test(cls)) {
        found = Number(t);
        break;
      }
      // 无 class 时用 aria-current
      if (el.getAttribute?.('aria-current') === 'page') {
        found = Number(t);
        break;
      }
    }
    if (found) return found;
    // 兜底：分页区域里第一个 .on 下的数字
    const on = document.querySelector(
      '[class*="pagination"] .on, [class*="page"] .on, [class*="pagination"] .active'
    );
    if (on) {
      const t = normalizeBtnText(on);
      if (/^\d+$/.test(t)) return Number(t);
    }
    return 0;
  }

  /** 点「下一页」；以页码变化为主、列表 ID 变化为辅 */
  async function nextPage() {
    // 先清残留弹层，避免挡住分页/列表
    await closeOverlays({ logger, times: 3 });

    const pageBefore = getActivePage();
    const sigBefore = listSignature();

    let btn =
      document.querySelector(SEL.nextPageSel) ||
      Array.from(document.querySelectorAll('a, button, span')).find((el) =>
        SEL.nextBtnText.test(normalizeBtnText(el))
      );
    if (btn && (btn.disabled || /disabled|is-disabled/.test(btn.className || ''))) {
      btn = null;
    }
    if (!btn) {
      logger?.emit('error', { where: 'page', msg: '下一页按钮未找到或已到末页' });
      return false;
    }

    clickLike(btn);
    logger?.emit('scan', {
      note: `已点下一页（当前页 ${pageBefore || '?'}），等待列表刷新…`
    });

    for (let i = 0; i < 16; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const pageAfter = getActivePage();
      if (pageBefore && pageAfter && pageAfter !== pageBefore) {
        logger?.emit('scan', { note: `翻页成功：${pageBefore} → ${pageAfter}` });
        await closeOverlays({ logger, times: 2 });
        return true;
      }
      const sigAfter = listSignature();
      if (sigAfter && sigAfter !== sigBefore) {
        logger?.emit('scan', { note: '列表已更新（ID 变化）' });
        return true;
      }
    }

    // 最后再确认一次（弹层关掉后列表可能才显示）
    await closeOverlays({ logger, times: 2 });
    const pageEnd = getActivePage();
    if (pageBefore && pageEnd && pageEnd !== pageBefore) return true;
    const sigEnd = listSignature();
    if (sigEnd && sigEnd !== sigBefore) return true;

    logger?.emit('error', {
      where: 'page',
      msg: `点击下一页后未检测到翻页（页码 ${pageBefore}→${pageEnd}）`
    });
    return false;
  }

  return {
    id: () => 'w51job',
    matchHost,
    extractList,
    isApplied,
    nextPage,
    apply: (job) => applyJob(job, { logger }),
    sendGreeting: (job, greeting) => sendGreeting(job, greeting, { logger })
  };
}
