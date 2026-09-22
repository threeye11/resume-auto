import { appendLog } from './render.js';
import { mountConfigDrawer } from './config-drawer.js';
import styles from './styles.css?raw';

const DRAG_THRESHOLD = 5;
const EDGE_MARGIN = 8;

const ICON_MAXIMIZE = `
<svg class="ra-ico" viewBox="0 0 12 12" aria-hidden="true">
  <rect x="1.5" y="1.5" width="9" height="9" rx="1" fill="none" stroke="currentColor" stroke-width="1.4"/>
</svg>`;
const ICON_RESTORE = `
<svg class="ra-ico" viewBox="0 0 12 12" aria-hidden="true">
  <rect x="1.5" y="3.2" width="7" height="7" rx="1" fill="none" stroke="currentColor" stroke-width="1.3"/>
  <path d="M3.5 3.2V2.5a1 1 0 0 1 1-1H9.5a1 1 0 0 1 1 1V7a1 1 0 0 1-1 1h-.7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/>
</svg>`;

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

function clamp(n, min, max) {
  if (max < min) return min;
  return Math.min(Math.max(n, min), max);
}

export function mountTerminal({ logger, store, controls, configFields, onTestLlm } = {}) {
  const existing = document.getElementById('ra-root');
  if (existing?.__raApi) return existing.__raApi;

  const root = existing || document.createElement('div');
  root.id = 'ra-root';
  root.setAttribute('role', 'region');
  root.setAttribute('aria-label', 'resume-auto 控制台');
  if (!existing) document.body.appendChild(root);

  // 关键：控件全部落在 shadow root 内，页面自身脚本无法 querySelector 读到输入值
  const shadow = root.shadowRoot || root.attachShadow({ mode: 'open' });
  const style = document.createElement('style');
  style.textContent = styles;
  shadow.appendChild(style);

  const tpl = document.createElement('template');
  tpl.innerHTML = `
    <div class="ra-header">
      <span class="ra-title" id="ra-title">
        <span class="ra-title-dot" aria-hidden="true"></span>
        <span id="ra-title-text">resume-auto</span>
      </span>
      <span class="ra-status" id="ra-status">空闲</span>
      <span class="ra-win-btns">
        <button type="button" class="ra-win-btn" data-act="maximize" title="最大化" aria-label="最大化">${ICON_MAXIMIZE}</button>
        <button type="button" class="ra-win-btn" data-act="collapse" title="折叠" aria-label="折叠">
          <svg class="ra-ico" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M2.5 8.5h7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          </svg>
        </button>
      </span>
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
  for (const node of Array.from(tpl.content.children)) shadow.appendChild(node);

  const body = shadow.querySelector('#ra-body');
  const emptyEl = shadow.querySelector('#ra-empty');
  const statusEl = shadow.querySelector('#ra-status');
  const titleText = shadow.querySelector('#ra-title-text');
  const ballEl = shadow.querySelector('#ra-ball');
  const ballCode = shadow.querySelector('#ra-ball-code');
  const header = shadow.querySelector('.ra-header');
  const maxBtn = shadow.querySelector('[data-act="maximize"]');
  const drawer = mountConfigDrawer(shadow, {
    store,
    fields: configFields,
    onTestLlm
  });

  let statusText = '空闲';
  let collapsed = false;
  let maximized = false;
  let suppressClick = false;
  /** @type {{left:number,top:number,width:string,height:string}|null} */
  let restoreBox = null;

  function applyBallBadge(text) {
    const { code, tone } = ballBadgeFromText(text);
    ballCode.textContent = code;
    ballEl.dataset.tone = tone;
    ballEl.title = text || '';
  }

  /** 保证至少 EDGE_MARGIN 像素仍在视口内，防止拖出边界找不回 */
  function clampToViewport() {
    if (maximized || collapsed) return;
    const r = root.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const w = r.width;
    const h = r.height;
    const left = clamp(r.left, EDGE_MARGIN - w + 48, vw - EDGE_MARGIN - 24);
    const top = clamp(r.top, EDGE_MARGIN, vh - EDGE_MARGIN - 32);
    root.style.right = 'auto';
    root.style.bottom = 'auto';
    root.style.left = `${left}px`;
    root.style.top = `${top}px`;
  }

  function setMaximized(next) {
    if (next === maximized) return;
    if (next) {
      if (collapsed) setCollapsed(false);
      const r = root.getBoundingClientRect();
      restoreBox = {
        left: r.left,
        top: r.top,
        width: root.style.width || `${r.width}px`,
        height: root.style.height || ''
      };
      maximized = true;
      root.classList.add('ra-maximized');
      root.style.left = '';
      root.style.top = '';
      root.style.right = '';
      root.style.bottom = '';
      root.style.width = '';
      root.style.height = '';
      if (maxBtn) {
        maxBtn.dataset.act = 'restore';
        maxBtn.title = '向下还原';
        maxBtn.setAttribute('aria-label', '向下还原');
        maxBtn.innerHTML = ICON_RESTORE;
      }
    } else {
      maximized = false;
      root.classList.remove('ra-maximized');
      if (restoreBox) {
        root.style.left = `${restoreBox.left}px`;
        root.style.top = `${restoreBox.top}px`;
        root.style.right = 'auto';
        root.style.bottom = 'auto';
        if (restoreBox.width) root.style.width = restoreBox.width;
        if (restoreBox.height) root.style.height = restoreBox.height;
      } else {
        root.style.left = '';
        root.style.top = '';
        root.style.right = '16px';
        root.style.bottom = '16px';
      }
      clampToViewport();
      if (maxBtn) {
        maxBtn.dataset.act = 'maximize';
        maxBtn.title = '最大化';
        maxBtn.setAttribute('aria-label', '最大化');
        maxBtn.innerHTML = ICON_MAXIMIZE;
      }
    }
  }

  function setCollapsed(next) {
    if (next && maximized) setMaximized(false);
    collapsed = next;
    root.classList.toggle('ra-collapsed', next);
    ballEl.hidden = !next;
    if (next) ballEl.removeAttribute('hidden');
    else ballEl.setAttribute('hidden', '');
    header.style.display = next ? 'none' : '';
    titleText.textContent = next ? 'RA' : 'resume-auto';
    applyBallBadge(statusText);
    if (!next) clampToViewport();
  }

  function setStatus(s) {
    statusText = s;
    statusEl.textContent = s;
    applyBallBadge(s);
  }

  function enableDrag(handle) {
    if (!handle) return;
    let sx = 0, sy = 0, ox = 0, oy = 0, pending = false, dragging = false;

    handle.addEventListener('mousedown', (e) => {
      if (e.target.closest('button')) return;
      if (maximized && !collapsed) return;
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
      const r = root.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      // 拖拽实时夹紧：至少露出 EDGE_MARGIN，避免拖出屏幕
      const left = clamp(ox + dx, EDGE_MARGIN - r.width + 48, vw - EDGE_MARGIN - 24);
      const top = clamp(oy + dy, EDGE_MARGIN, vh - EDGE_MARGIN - 32);
      root.style.left = `${left}px`;
      root.style.top = `${top}px`;
    });

    window.addEventListener('mouseup', () => {
      pending = false;
      dragging = false;
      setTimeout(() => {
        suppressClick = false;
      }, 0);
    });
  }

  enableDrag(header);
  enableDrag(ballEl);

  shadow.addEventListener('click', (e) => {
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
    if (act === 'maximize') {
      setMaximized(true);
      return;
    }
    if (act === 'restore') {
      setMaximized(false);
      return;
    }
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

  const onResize = () => clampToViewport();
  window.addEventListener('resize', onResize);

  setCollapsed(false);
  setStatus('空闲');
  // 初始 right/bottom 定位，视口变化时再夹紧
  requestAnimationFrame(() => clampToViewport());

  const api = {
    root,
    shadow,
    /** 配置抽屉内的挂载点，如 slots.vault */
    slots: drawer.slots || {},
    setStatus,
    unmount: () => {
      un();
      window.removeEventListener('resize', onResize);
      root.remove();
      delete root.__raApi;
    }
  };
  root.__raApi = api;
  return api;
}
