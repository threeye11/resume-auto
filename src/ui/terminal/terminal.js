import { appendLog } from './render.js';
import { mountConfigDrawer } from './config-drawer.js';
import styles from './styles.css?raw';

export function mountTerminal({ logger, store, controls }) {
  const existing = document.getElementById('ra-root');
  if (existing) return existing;

  const style = document.createElement('style');
  style.textContent = styles;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.id = 'ra-root';
  root.innerHTML = `
    <div class="ra-header">
      <span class="ra-title">resume-auto</span>
      <span class="ra-status" id="ra-status">空闲</span>
    </div>
    <div class="ra-body" id="ra-body"></div>
    <div class="ra-actions">
      <button class="ra-btn primary" data-act="start">开始</button>
      <button class="ra-btn" data-act="pause">暂停</button>
      <button class="ra-btn" data-act="stop">停止</button>
      <button class="ra-btn" data-act="config">配置</button>
      <button class="ra-btn" data-act="export">导出</button>
      <button class="ra-btn" data-act="collapse">折叠</button>
    </div>
  `;
  document.body.appendChild(root);

  const body = root.querySelector('#ra-body');
  const statusEl = root.querySelector('#ra-status');
  const drawer = mountConfigDrawer(root, { store });

  (function enableDrag(handle) {
    let sx = 0, sy = 0, ox = 0, oy = 0, dragging = false;
    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      dragging = true;
      sx = e.clientX; sy = e.clientY;
      const r = root.getBoundingClientRect();
      ox = r.left; oy = r.top;
      root.style.right = 'auto';
      root.style.bottom = 'auto';
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      root.style.left = ox + (e.clientX - sx) + 'px';
      root.style.top = oy + (e.clientY - sy) + 'px';
    });
    window.addEventListener('mouseup', () => { dragging = false; });
  })(root.querySelector('.ra-header'));

  root.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-act]');
    if (!btn) return;
    const act = btn.getAttribute('data-act');
    if (act === 'start') controls?.onStart?.();
    if (act === 'pause') controls?.onPause?.();
    if (act === 'stop') controls?.onStop?.();
    if (act === 'config') drawer.toggle();
    if (act === 'export') {
      const lines = logger.recent().map((e) => {
        const d = new Date(e.ts);
        return `${d.toISOString()} ${e.type} ${JSON.stringify(e.payload)}`;
      });
      const blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `resume-auto-${Date.now()}.txt`;
      a.click();
    }
    if (act === 'collapse') root.classList.toggle('ra-collapsed');
  });

  root.addEventListener('click', (e) => {
    if (root.classList.contains('ra-collapsed') && e.target === root) {
      root.classList.remove('ra-collapsed');
    }
  });

  const un = logger.on('*', (payload, entry) => {
    appendLog(body, entry);
    if (entry.type === 'progress') {
      statusEl.textContent = `投递中 ${entry.payload.done}/${entry.payload.total}`;
    }
    if (entry.type === 'done') statusEl.textContent = '已结束';
    if (entry.type === 'quota' && entry.payload.stopped) statusEl.textContent = '配额用尽';
    if (entry.type === 'error' && entry.payload.where === 'streak') statusEl.textContent = '已暂停(连续失败)';
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
