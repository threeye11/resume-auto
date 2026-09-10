import { SEL, textOf, makeId } from './selectors.js';

export function createBossAdapter({ logger } = {}) {
  function matchHost() {
    return SEL.host.test(location.hostname);
  }

  function extractList() {
    const cards = Array.from(document.querySelectorAll(SEL.jobCard));
    const jobs = [];
    const seen = new Set();
    for (const el of cards) {
      const title = textOf(el, SEL.title);
      const company = textOf(el, SEL.company);
      const salaryText = textOf(el, SEL.salary);
      const area = textOf(el, SEL.area);
      if (!title) continue;
      const href = el.closest('a')?.href || el.querySelector('a')?.href || '';
      const id = makeId(title, company, salaryText, href);
      if (seen.has(id)) continue;
      seen.add(id);
      jobs.push({ id, title, company, salaryText, city: area, el, href });
    }
    logger?.emit('scan', { count: jobs.length });
    return jobs;
  }

  function isApplied(job) {
    const el = job.el;
    if (!el) return false;
    const btn = el.querySelector(SEL.applyBtn);
    const txt = (btn?.textContent || '').trim();
    return SEL.appliedText.test(txt);
  }

  return {
    id: () => 'boss',
    matchHost,
    extractList,
    isApplied,
    apply: async () => 'fail',
    sendGreeting: async () => 'fail'
  };
}
