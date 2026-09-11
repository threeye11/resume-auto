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
  /** 卡片上可能出现的投递按钮 */
  applyBtn: [
    '.op-btn',
    '.btn-startchat',
    '.start-chat-btn',
    '[class*="start-chat"]',
    'button[class*="communicate"]',
    'button[class*="startchat"]',
    '.job-card-op button',
    '.job-card-body .op-btn'
  ].join(', '),
  /** 右侧详情区投递按钮容器 */
  detailPanel: '.job-detail-box, .job-detail, .detail-box, [class*="job-detail"], [class*="job-detail-wrapper"]',
  detailApplyBtn: [
    '.btn-startchat',
    '.start-chat-btn',
    '[class*="start-chat"]',
    'button[class*="communicate"]',
    '.job-detail-box .op-btn',
    '.job-detail .btn',
    '.job-detail button'
  ].join(', '),
  /** 按钮文案匹配投递 */
  applyText: /^立即沟通$|^继续沟通$|^投递简历$/,
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

/** 在 root 内按选择器或按钮文案找「立即沟通」 */
export function findApplyButton(root) {
  if (!root) return null;
  const fromSel = root.querySelector?.(SEL.applyBtn);
  if (fromSel && SEL.applyText.test((fromSel.textContent || '').trim())) {
    return fromSel;
  }
  const buttons = root.querySelectorAll?.('button, a.btn, .btn, [role="button"]') || [];
  for (const b of buttons) {
    const t = (b.textContent || '').trim();
    if (SEL.applyText.test(t)) return b;
  }
  // 选择器命中但文案不标准时，仍用选择器结果（可能是图标按钮）
  return fromSel || null;
}

export function findDetailApplyButton() {
  const panels = Array.from(document.querySelectorAll(SEL.detailPanel));
  const scopes = panels.length ? panels : [document];
  for (const scope of scopes) {
    const btn = findApplyButton(scope);
    if (btn) return btn;
  }
  // 兜底：整页文案匹配
  const all = document.querySelectorAll('button, a.btn, .btn, [role="button"]');
  for (const b of all) {
    const t = (b.textContent || '').trim();
    if (SEL.applyText.test(t)) return b;
  }
  return null;
}
