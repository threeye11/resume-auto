import { appendLog } from './render.js';
import { mountConfigDrawer } from './config-drawer.js';
import styles from './styles.css?raw';

const TITLE_COLLAPSED = 'RA';

export function mountTerminal({ logger, store, controls }) {
  const existing = document.getElementById('ra-root');
  if (existing) return existing;

  const style = document.createElement('style');
  style.textContent = styles;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'ra-root';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'resume-auto 控制台');
  root.innerHTML = `
    <div class="ra-header">
      <span class="ra-title" id="ra-title">resume-auto</span>
      <span class="ra-status" id="ra-status">空闲</span>
    </div>
    <div class="ra-body" id="ra-body">
      <div class="ra-empty" id="ra-empty">等待开始 · 日志会显示在这里</div>
    </div>
    <div class="ra-actions">
      <button type="button" class="ra-btn primary" data-act="start">▶ 开始</button>
      <button type="button" class="ra-btn" data-act="pause">⏸ 暂停</button>
      <button type="button" class="ra-btn" data-act="stop">⏹ 停止</button>
      <button type="button" class="ra-btn" data-act="config">⚙ 配置</button>
      <button type="button" class="ra-btn" data-act="export">⇩ 导出</button>
      <button type="button" class="ra-btn ghost" data-act="collapse">— 折叠</button>
    </div>
  `;
  document.body.appendChild(root);

  const body = root.querySelector('#ra-body');
  const emptyEl = root.querySelector('#ra-empty');
  const statusEl = root.querySelector('#ra-status');
  const titleEl = root.querySelector('#ra-title');
  const drawer = mountConfigDrawer(root, { store });

  (function enableDrag(handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      if (root.classList.contains('ra-collapsed')) return;
      dragging = true;
      sx = e.clientX;
      sy = e.clientY;
      const r = root.getBoundingClientRect();
      ox = r.left;
      oy = r.top;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      root.style.left = ox + (e.clientX - sx) + 'px';
      root.style.top = oy + (e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => {
      dragging = false;
    });
  })(root.querySelector('.ra-header'));

  function setCollapsed(collapsed) {
    root.classList.toggle('ra-collapsed', collapsed);
    titleEl.textContent = collapsed ? TITLE_COLLAPSED : 'resume-auto';
  }

  // 单一点击委托：折叠态下点球任意位置展开
  root.addEventListener('click', (e) => {
    if (root.classList.contains('ra-collapsed')) {
      setCollapsed(false);
      return;
    }

    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');

    if (act === 'start') controls?.onStart?.();
    if (act === 'pause') controls?.onPause?.();
    if (act === 'stop') controls?.onStop?.();
    if (act === 'config') drawer.toggle();
    if (act === 'collapse') {
      drawer.close();
      setCollapsed(true);
      return;
    }
    if (act === 'export') {
      const lines = logger.recent().map((entry) => {
        const d = new Date(entry.ts);
        return `${d.toISOString()} ${entry.type} ${JSON.stringify(entry.payload)}`;
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `resume-auto-${Date.now()}.txt`;
      a.click();
      URL.revokeObjectURL(a.href);
    }
  });

  const un = logger.on('*', (payload, entry) => {
    if (emptyEl) emptyEl.remove();
    appendLog(body, entry);
    if (entry.type === 'progress') {
      statusEl.textContent = `投递中 ${entry.payload.done}/${entry.payload.total}`;
    }
    if (entry.type === 'done') statusEl.textContent = '已结束';
    if (entry.type === 'quota' && entry.payload.stopped) statusEl.textContent = '配额用尽';
    if (entry.type === 'error' && entry.payload.where === 'streak') {
      statusEl.textContent = '已暂停(连续失败)';
    }
  });

  function setStatus(s) {
    statusEl.textContent = s;
  }

  return {
    root,
    setStatus,
    unmount: () => {
      un();
      root.remove();
      style.remove();
    }
  };
}
