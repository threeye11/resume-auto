import { appendLog } from './render.js';
import { mountConfigDrawer } from './config-drawer.js';
import styles from './styles.css?raw';

const DRAG_THRESHOLD = 5;

/** 折叠球上的短状态码 */
function ballBadgeFromText(text) {
  const t = String(text || '');
  if (/投递中|运行|running/i.test(t)) return { code: 'RUN', tone: 'run' };
  if (/已暂停|暂停|paused/i.test(t)) return { code: 'PAU', tone: 'pause' };
  if (/配额/.test(t)) return { code: 'LIM', tone: 'warn' };
  if (/已结束|结束|done/i.test(t)) return { code: 'END', tone: 'end' };
  if (/就绪|空闲|ready/i.test(t)) return { code: 'IDLE', tone: 'idle' };
  if (/错误|失败|fail/i.test(t)) return { code: 'ERR', tone: 'err' };
  return { code: 'RA', tone: 'idle' };
}

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
      <span class="ra-title" id="ra-title">
        <span class="ra-title-dot" aria-hidden="true"></span>
        <span id="ra-title-text">resume-auto</span>
      </span>
      <span class="ra-status" id="ra-status">空闲</span>
    </div>
    <div class="ra-actions">
      <div class="ra-group">
        <button type="button" class="ra-btn primary" data-act="start">开始</button>
        <button type="button" class="ra-btn" data-act="pause">暂停</button>
        <button type="button" class="ra-btn danger" data-act="stop">停止</button>
      </div>
      <div class="ra-group-sec">
        <button type="button" class="ra-btn ghost" data-act="config">配置</button>
        <button type="button" class="ra-btn ghost" data-act="export">导出</button>
        <button type="button" class="ra-btn ghost" data-act="collapse">折叠</button>
      </div>
    </div>
    <div class="ra-body" id="ra-body">
      <div class="ra-empty" id="ra-empty">等待开始 · 日志会显示在这里</div>
    </div>
    <div class="ra-ball" id="ra-ball" hidden aria-hidden="true">
      <span class="ra-ball-code" id="ra-ball-code">RA</span>
    </div>
  `;
  document.body.appendChild(root);

  const body = root.querySelector('#ra-body');
  const emptyEl = root.querySelector('#ra-empty');
  const statusEl = root.querySelector('#ra-status');
  const titleText = root.querySelector('#ra-title-text');
  const ballEl = root.querySelector('#ra-ball');
  const ballCode = root.querySelector('#ra-ball-code');
  const header = root.querySelector('.ra-header');
  const drawer = mountConfigDrawer(root, { store });

  let statusText = '空闲';
  let collapsed = false;
  let suppressClick = false;

  function applyBallBadge(text) {
    const { code, tone } = ballBadgeFromText(text);
    ballCode.textContent = code;
    ballEl.dataset.tone = tone;
    ballEl.title = text || '';
  }

  function setCollapsed(next) {
    collapsed = next;
    root.classList.toggle('ra-collapsed', next);
    ballEl.hidden = !next;
    header.hidden = next;
    titleText.textContent = next ? 'RA' : 'resume-auto';
    applyBallBadge(statusText);
  }

  function setStatus(s) {
    statusText = s;
    statusEl.textContent = s;
    applyBallBadge(s);
  }

  // 拖拽：展开用 header，折叠球用 ball；超过阈值才移动，否则视为点击展开
  function enableDrag(handle) {
    if (!handle) return;
    let sx = 0, sy = 0, ox = 0, oy = 0, pending = false, dragging = false;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      pending = true;
      dragging = false;
      suppressClick = false;
      sx = e.clientX;
      sy = e.clientY;
      const r = root.getBoundingClientRect();
      ox = r.left;
      oy = r.top;
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (!pending) return;
      const dx = e.clientX - sx;
      const dy = e.clientY - sy;
      if (!dragging && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
      if (!dragging) {
        dragging = true;
        suppressClick = true;
        root.style.right = 'auto';
        root.style.bottom = 'auto';
      }
      root.style.left = ox + dx + 'px';
      root.style.top = oy + dy + 'px';
    });

    window.addEventListener('mouseup', () => {
      pending = false;
      dragging = false;
      // click 事件在 mouseup 后触发，用 suppressClick 抑制误展开
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    });
  }

  enableDrag(header);
  enableDrag(ballEl);

  root.addEventListener('click', (e) => {
    if (collapsed) {
      if (suppressClick) return;
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
    if (emptyEl?.isConnected) emptyEl.remove();
    appendLog(body, entry);
    if (entry.type === 'progress') {
      setStatus(`投递中 ${entry.payload.done}/${entry.payload.total}`);
    }
    if (entry.type === 'done') setStatus('已结束');
    if (entry.type === 'quota' && entry.payload.stopped) setStatus('配额用尽');
    if (entry.type === 'error' && entry.payload.where === 'streak') {
      setStatus('已暂停(连续失败)');
    }
  });

  setStatus('空闲');

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
