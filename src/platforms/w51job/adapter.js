import { SEL, textOf, makeId, findApplyButton, isAppliedButton } from './selectors.js';
import { applyJob, sendGreeting } from './actions.js';

export function createW51Adapter({ logger } = {}) {
  function matchHost() {
    return SEL.host.test(location.hostname);
  }

  function extractList() {
    let cards = Array.from(document.querySelectorAll(SEL.jobCard));
    // 兜底：按投递按钮反推卡片
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
      const title = textOf(el, SEL.title) || textOf(el, 'a') || (el.querySelector('a')?.title ?? '');
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
    const root =
      job.el?.closest?.('li, .e, .tbox, [class*="job-item"]') || job.el;
    const btn = findApplyButton(root);
    return isAppliedButton(btn);
  }

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

  function listSignature() {
    const jobs = extractList();
    return jobs.map((j) => j.id).join('|');
  }

  /** 点分页「下一页」；成功翻页且列表变化则 true */
  async function nextPage() {
    const before = listSignature();
    let btn =
      document.querySelector(SEL.nextPageSel) ||
      Array.from(document.querySelectorAll('a, button, span')).find((el) =>
        SEL.nextBtnText.test((el.textContent || '').replace(/\s/g, ''))
      );
    // 禁用态的下一页
    if (btn && (btn.disabled || /disabled|is-disabled/.test(btn.className || ''))) {
      btn = null;
    }
    if (!btn) {
      logger?.emit('error', { where: 'page', msg: '下一页按钮未找到或已到末页' });
      return false;
    }
    clickLike(btn);
    // SPA 列表异步刷新
    for (let i = 0; i < 12; i++) {
      await new Promise((r) => setTimeout(r, 250));
      const after = listSignature();
      if (after && after !== before) return true;
    }
    const after = listSignature();
    if (after && after !== before) return true;
    logger?.emit('error', { where: 'page', msg: '点击下一页后列表未变化' });
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
