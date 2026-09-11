/**
 * 前程无忧 we.51job.com 选择器（SPA，以文案兜底为主）
 */
export const SEL = {
  host: /(^|\.)51job\.com$/i,
  jobCard: [
    '.j_joblist .e',
    '.joblist .e',
    '[class*="job-list"] [class*="item"]',
    '[class*="joblist"] .tbox',
    '[class*="job-item"]',
    'li[class*="job"]'
  ].join(', '),
  title: [
    'p.t span.j',
    '.jname',
    '[class*="job-name"]',
    '[class*="jname"]',
    'a[class*="job"]'
  ].join(', '),
  company: ['.cname', '[class*="company"]', '[class*="corp"]'].join(', '),
  salary: ['.sal', '[class*="sal"]', '[class*="salary"]'].join(', '),
  area: ['.d at', '.job-area', '[class*="area"]', '[class*="city"]'].join(', '),
  /** 只认这些文案为投递按钮 */
  applyText: /^(投递|立即投递|申请职位)$/,
  appliedText: /^(已投递|继续投递|投递成功)$/,
  /** 投递后需要再点的「去聊聊」 */
  chatText: /^(去聊聊|去聊聘|聊一聊|立即沟通)$/,
  rejectText: /^(收藏|取消收藏|感兴趣|举报|分享|查职位)$/,
  /** 分页 */
  nextBtnText: /^(下一页|下页|>)$/,
  nextPageSel: [
    '[class*="pagination"] [class*="next"]',
    '[class*="page"] a.next',
    '.btn-next',
    'a[aria-label="下一页"]',
    'button[aria-label="下一页"]'
  ].join(', ')
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
  return `w51_${(h >>> 0).toString(36)}`;
}

export function normalizeBtnText(el) {
  return (el?.textContent || '').replace(/\s+/g, '');
}

export function isApplyButton(el) {
  if (!el) return false;
  const t = normalizeBtnText(el);
  if (!t) return false;
  if (SEL.rejectText.test(t)) return false;
  return SEL.applyText.test(t);
}

export function isAppliedButton(el) {
  const t = normalizeBtnText(el);
  return SEL.appliedText.test(t);
}

export function isChatButton(el) {
  if (!el) return false;
  const t = normalizeBtnText(el);
  return SEL.chatText.test(t);
}

function collectCandidates(root) {
  const list = root.querySelectorAll?.(
    'a, button, .btn, [role="button"], span[class*="btn"], div[class*="btn"]'
  );
  return list ? Array.from(list) : [];
}

/** 在 root 内找「投递」按钮 */
export function findApplyButton(root) {
  if (!root) return null;
  for (const b of collectCandidates(root)) {
    if (isApplyButton(b)) return b;
  }
  return null;
}

/** 找「去聊聊」 */
export function findChatButton(root) {
  if (!root) return null;
  for (const b of collectCandidates(root)) {
    if (isChatButton(b)) return b;
  }
  return null;
}

export function findPageChatButton() {
  const panels = document.querySelectorAll(
    '[class*="job-detail"], [class*="jobdetail"], [class*="detail-box"], .rtbox'
  );
  for (const p of panels) {
    const btn = findChatButton(p);
    if (btn) return btn;
  }
  for (const b of collectCandidates(document)) {
    if (isChatButton(b)) return b;
  }
  return null;
}

/** 整页/详情找投递按钮 */
export function findPageApplyButton() {
  // 常见右侧详情区
  const panels = document.querySelectorAll(
    '[class*="job-detail"], [class*="jobdetail"], [class*="detail-box"], .rtbox'
  );
  for (const p of panels) {
    const btn = findApplyButton(p);
    if (btn) return btn;
  }
  for (const b of collectCandidates(document)) {
    if (isApplyButton(b)) return b;
  }
  return null;
}
