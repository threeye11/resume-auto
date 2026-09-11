export function formatLine(entry) {
  const d = new Date(entry.ts);
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  const ss = String(d.getSeconds()).padStart(2, '0');
  return { ts: `${hh}:${mm}:${ss}`, text: describe(entry), cls: classOf(entry) };
}

function describe(e) {
  const p = e.payload || {};
  switch (e.type) {
    case 'scan':
      return p.note || `扫描 ${p.count ?? 0} 条`;
    case 'filter':
      return `列表 ${p.total ?? 0} · 筛过 ${p.pass ?? 0} · 已投跳过 ${p.skippedApplied ?? 0} · 待投 ${p.pending ?? 0}`;
    case 'dedupe':
      return `#${p.index ?? '-'} ${p.title || p.id || ''} @${p.company || ''} 已投跳过`;
    case 'quota':
      if (p.stopped) {
        return p.note || `已达今日上限 ${p.count}/${p.limit}`;
      }
      return `配额 ${p.count}/${p.limit}`;
    case 'apply':
      return `#${p.index ?? '-'} ${p.title || ''}@${p.company || ''} ${p.status || ''}`;
    case 'greet':
      return `招呼 ${p.status || ''}`;
    case 'error':
      return `错误 ${p.where || ''}: ${p.msg || p.error || ''}`;
    case 'progress':
      return `进度 ${p.done ?? 0}/${p.total ?? 0}`;
    case 'done':
      return `结束 成功${p.ok ?? 0} 跳过${p.skip ?? 0} 失败${p.fail ?? 0}${p.note ? ` · ${p.note}` : ''}`;
    default:
      return JSON.stringify(p);
  }
}

function classOf(e) {
  const p = e.payload || {};
  if (e.type === 'error') return 'ra-err';
  if (e.type === 'apply' && p.status === 'ok') return 'ra-ok';
  if (e.type === 'apply' && (p.status === 'skip' || String(p.status).includes('排除'))) return 'ra-warn';
  if (e.type === 'done') return 'ra-ok';
  return '';
}

export function appendLog(bodyEl, entry, max = 200) {
  const { ts, text, cls } = formatLine(entry);
  const div = document.createElement('div');
  div.className = `ra-line ${cls}`;
  div.innerHTML = `<span class="ra-ts">${ts}</span>`;
  div.appendChild(document.createTextNode(text));
  bodyEl.appendChild(div);
  while (bodyEl.childElementCount > max) bodyEl.removeChild(bodyEl.firstChild);
  bodyEl.scrollTop = bodyEl.scrollHeight;
}
