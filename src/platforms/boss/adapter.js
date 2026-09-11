import { SEL, textOf, makeId, findApplyButton, findDetailApplyButton } from './selectors.js';
import { applyJob, sendGreeting } from './actions.js';

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
    const root =
      job.el?.closest?.('li.job-card-wrapper, li, .job-card-wrapper, .job-card-box') || job.el;
    const btn = findApplyButton(root) || findDetailApplyButton();
    const txt = (btn?.textContent || '').trim();
    return SEL.appliedText.test(txt);
  }

  return {
    id: () => 'boss',
    matchHost,
    extractList,
    isApplied,
    apply: (job) => applyJob(job, { logger }),
    sendGreeting: (job, greeting) => sendGreeting(job, greeting, { logger })
  };
}
