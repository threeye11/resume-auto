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

  return {
    id: () => 'w51job',
    matchHost,
    extractList,
    isApplied,
    apply: (job) => applyJob(job, { logger }),
    sendGreeting: (job, greeting) => sendGreeting(job, greeting, { logger })
  };
}
