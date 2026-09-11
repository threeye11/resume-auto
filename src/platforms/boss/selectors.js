/**
 * BOSS直聘列表页选择器集中表。
 * 页面改版时只改这里。
 */
export const SEL = {
  host: /(^|\.)zhipin\.com$/i,
  jobList: '.job-list-box, .job-list-wrapper, [class*="job-list"]',
  jobCard: '.job-card-wrapper, .job-card-left, li.job-card-wrapper, [class*="job-card"]',
  title: '.job-name, .job-title, [class*="job-name"]',
  company: '.company-name, .boss-name, [class*="company-name"]',
  salary: '.salary, [class*="salary"]',
  area: '.job-area, .company-location, [class*="job-area"]',
  detailPanel:
    '.job-detail-box, .job-detail, .detail-box, [class*="job-detail"], [class*="job-detail-wrapper"]',
  /** 仅接受这些文案为投递按钮（已去空白） */
  applyText: /^(立即沟通|继续沟通|投递简历)$/,
  /** 明确排除，绝不能点 */
  rejectText: /^(收藏|取消收藏|已收藏|分享|举报|感兴趣)$/,
  appliedText: /继续沟通|已沟通/,
  cardLink: 'a'
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

export function normalizeBtnText(el) {
  return (el?.textContent || '').replace(/\s+/g, '');
}

/** 文案是否为投递按钮（严格，排除收藏等） */
export function isApplyButton(el) {
  if (!el) return false;
  const t = normalizeBtnText(el);
  if (!t) return false;
  if (SEL.rejectText.test(t)) return false;
  return SEL.applyText.test(t);
}

function collectCandidates(root) {
  const list = root.querySelectorAll?.(
    'a, button, .btn, [role="button"], span[class*="btn"], div[class*="btn"]'
  );
  return list ? Array.from(list) : [];
}

/** 在 root 内严格按文案找「立即沟通」；找不到返回 null（绝不点收藏） */
export function findApplyButton(root) {
  if (!root) return null;
  for (const b of collectCandidates(root)) {
    if (isApplyButton(b)) return b;
  }
  return null;
}

export function findDetailApplyButton() {
  const panels = Array.from(document.querySelectorAll(SEL.detailPanel));
  for (const scope of panels.length ? panels : []) {
    const btn = findApplyButton(scope);
    if (btn) return btn;
  }
  // 整页严格文案匹配
  for (const b of collectCandidates(document)) {
    if (isApplyButton(b)) return b;
  }
  return null;
}
