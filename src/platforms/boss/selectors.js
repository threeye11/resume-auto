/**
 * BOSS直聘列表页选择器集中表。
 * 页面改版时只改这里。上线前用 DevTools 核对。
 */
export const SEL = {
  host: /(^|\.)zhipin\.com$/i,
  jobList: '.job-list-box, .job-list-wrapper, [class*="job-list"]',
  jobCard: '.job-card-wrapper, .job-card-left, li.job-card-wrapper, [class*="job-card"]',
  title: '.job-name, .job-title, [class*="job-name"]',
  company: '.company-name, .boss-name, [class*="company-name"]',
  salary: '.salary, [class*="salary"]',
  area: '.job-area, .company-location, [class*="job-area"]',
  applyBtn: '.op-btn, .btn-startchat, .start-chat-btn, [class*="start-chat"], button[class*="communicate"]',
  appliedText: /继续沟通|已沟通|继续/
};

export function textOf(el, sel) {
  const n = el?.querySelector?.(sel);
  return (n?.textContent || '').trim();
}

export function makeId(title, company, salary, href) {
  const base = [title, company, salary, href || ''].join('|');
  let h = 0;
  for (let i = 0; i < base.length; i++) {
    h = (Math.imul(31, h) + base.charCodeAt(i)) | 0;
  }
  return `boss_${(h >>> 0).toString(36)}`;
}
