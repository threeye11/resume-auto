import { SENSITIVE_PATHS } from '../../core/vault.js';

/**
 * 字段描述：[key, label, type, hint, opts]
 * type: text | number | textarea | password | checkbox | select
 * hint 作为低透明度占位提示，聚焦/输入时消失（见 styles.css 的 ::placeholder 规则）
 * 结构项：{ section, help } 分节标题 · { slot } 挂载点 · { action } 按钮
 */
const FIELDS = [
  { section: '① 站内粗筛之后再做精筛', help: '脚本只读当前列表页已渲染的卡片，不替你点城市/行业下拉。先用站内筛选把列表收窄。' },
  ['jobInclude', '职位名包含', 'text', '逗号分隔，任一命中即通过。例：嵌入式,硬件,单片机'],
  ['companyInclude', '公司名包含', 'text', '留空 = 不限公司。例：汽车电子,研究院'],
  ['companyExclude', '公司名排除', 'text', '逗号分隔，命中即跳过。例：外包,外派,人力'],
  ['descExclude', '描述排除词', 'text', '预留项：当前列表页不抓职位描述，填了不生效'],
  { section: '② 薪资与配额' },
  ['salaryMin', '薪资下限 (K)', 'number', '0 = 不设下限'],
  ['salaryMax', '薪资上限 (K)', 'number', '0 = 不设上限'],
  ['skipNoSalary', '无薪资跳过', 'checkbox'],
  ['dailyLimit', '日配额', 'number', '当日最多成功投递次数；试跑先设 5'],
  { section: '③ 投递节奏与翻页' },
  ['greeting', '招呼语', 'textarea', '留空 = 保留原值。BOSS 建议以站内「消息→设置招呼语」为准'],
  ['autoPage', '自动翻页（当前页投完点下一页）', 'checkbox'],
  ['maxPages', '最多翻到第几页', 'number', '默认 3；开自动翻页时才生效'],
  ['delayMinMs', '点击间隔下限 (ms)', 'number', '默认 800'],
  ['delayMaxMs', '点击间隔上限 (ms)', 'number', '默认 2000，随机取值更像人工']
];

/** chat 页配置：按「先锁密钥 → 再喂背景 → 再配模型 → 最后开关」的顺序引导 */
export const CHAT_FIELDS = [
  {
    section: '① 先设 PIN（强烈建议）',
    help: 'API Key、简历、问候文案属敏感项。设 PIN 后它们以 AES-GCM 密文存放，未解锁读不到；不设 PIN 则明文留在扩展存储。'
  },
  { slot: 'vault' },
  {
    section: '② 你的背景（llm 模式的上下文）',
    help: 'custom 模式不读这两项，只把 ④ 的文案原文发出。'
  },
  ['resumeMarkdown', '简历 Markdown', 'textarea', '留空 = 保留原值。粘贴简历全文，技能 + 项目 + 可到岗时间越具体，生成越不像套话。'],
  ['targetRole', '目标岗位/行业', 'text', '例：嵌入式软件工程师（实习）/ 汽车电子、工业控制'],
  {
    section: '③ 大模型（仅问候来源选 llm 时需要）',
    help: 'OpenAI 兼容接口均可（DeepSeek、通义等）。填完点「测试连通性」确认能通。'
  },
  ['llm.baseUrl', 'LLM baseUrl', 'text', '例：https://api.deepseek.com/v1（只到版本号，不要带 /chat/completions）'],
  ['llm.apiKey', 'LLM API Key', 'password', '已保存 · 留空则不修改；换新 Key 时直接粘贴覆盖'],
  ['llm.model', 'LLM model', 'text', '例：deepseek-chat、qwen-plus'],
  { action: 'testLlm', label: '测试连通性' },
  ['llm.systemTemplate', '系统提示词模板', 'textarea', '留空 = 保留原值。占位符：{resumeMarkdown} {targetRole} {hrName} {jobTitle} {company} {recentMessages} {scene}'],
  {
    section: '④ 主动问候与回复',
    help: 'custom 直接发送且原文照发（不替换公司/岗位名，所有会话收到同一段）；llm 每个会话单独生成草稿，需点「发送」。首次试跑把单次上限设为 2。'
  },
  ['proactiveEnabled', '主动问候开关（仅聊天页）', 'checkbox'],
  [
    'proactiveSource',
    '问候来源',
    'select',
    'custom = 用下方固定文案直接发；llm = 大模型按会话生成草稿',
    {
      options: [
        ['custom', 'custom · 自定义文案（直接发送）'],
        ['llm', 'llm · 大模型生成（草稿确认）']
      ]
    }
  ],
  ['proactiveCustom', '自定义主动问候（2–3句）', 'textarea', '留空 = 保留原值。会一字不差发给所有会话，别写公司名/岗位名；建议单段不换行。'],
  ['autoReplyEnabled', 'HR回复自动起草（草稿+确认）', 'checkbox'],
  ['proactiveMaxPerRun', '单次最多问候会话数', 'number', '默认 10；首次试跑建议 2'],
  ['delayMinMs', '发送间隔下限 (ms)', 'number', '默认 2000；0 = 用默认'],
  ['delayMaxMs', '发送间隔上限 (ms)', 'number', '默认 4000；0 = 用默认']
];

const SECRET = new Set(SENSITIVE_PATHS);

function getPath(obj, path) {
  return String(path)
    .split('.')
    .reduce((o, k) => (o == null ? undefined : o[k]), obj);
}

function setPath(obj, path, value) {
  const keys = path.split('.');
  let o = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    if (typeof o[keys[i]] !== 'object' || o[keys[i]] == null) o[keys[i]] = {};
    o = o[keys[i]];
  }
  o[keys[keys.length - 1]] = value;
}

function normalizeItem(item) {
  if (Array.isArray(item)) {
    const [key, label, type = 'text', hint, opts] = item;
    return { key, label, type, hint, ...(opts || {}) };
  }
  return item;
}

export function normalizeFields(fields) {
  return (fields || []).map(normalizeItem);
}

/** 掩码项（密码框）与保险库字段：留空表示不修改，避免不回显却把已存值覆盖成空 */
export function isNoOverwriteOnBlank(f) {
  return f.type === 'password' || SECRET.has(f.key);
}

/** 表单原始值 → 可提交的 patch（剔除"留空即不修改"字段的空值） */
export function buildSavePatch(list, raw) {
  const partial = {};
  for (const f of list) {
    if (!f.key) continue;
    const v = getPath(raw, f.key);
    if (isNoOverwriteOnBlank(f) && (v === '' || v === null || v === undefined)) continue;
    setPath(partial, f.key, v);
  }
  return partial;
}

function makeHelp(text) {
  const el = document.createElement('div');
  el.className = 'ra-help';
  el.textContent = text;
  return el;
}

export function mountConfigDrawer(root, { store, onSave, onTestLlm, fields } = {}) {
  const list = normalizeFields(fields || FIELDS);
  const drawer = document.createElement('div');
  drawer.className = 'ra-drawer';
  const cfg = store.getConfig();
  const inputs = {};
  const slots = {};

  for (const f of list) {
    if (f.section) {
      const h = document.createElement('div');
      h.className = 'ra-section';
      h.textContent = f.section;
      drawer.appendChild(h);
      if (f.help) drawer.appendChild(makeHelp(f.help));
      continue;
    }
    if (f.slot) {
      const box = document.createElement('div');
      box.className = 'ra-slot';
      box.dataset.slot = f.slot;
      drawer.appendChild(box);
      slots[f.slot] = box;
      continue;
    }
    if (f.action) {
      const wrap = document.createElement('div');
      wrap.className = 'ra-action-row';
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'ra-btn';
      btn.textContent = f.label || '测试';
      const out = document.createElement('span');
      out.className = 'ra-action-result';
      btn.addEventListener('click', () => {
        if (!onTestLlm) return;
        btn.disabled = true;
        btn.textContent = '测试中…';
        out.textContent = '';
        out.className = 'ra-action-result';
        Promise.resolve(onTestLlm(collectRaw()))
          .then((r) => {
            const ok = r?.ok;
            out.textContent = ok
              ? `通过 ${r.latencyMs ?? ''}ms${r.detail ? ` · ${r.detail}` : ''}`
              : `失败：${r?.detail || '未知错误'}`;
            out.classList.add(ok ? 'ok' : 'fail');
          })
          .catch((e) => {
            out.textContent = `失败：${e?.message || e}`;
            out.classList.add('fail');
          })
          .finally(() => {
            btn.disabled = false;
            btn.textContent = f.label || '测试';
          });
      });
      wrap.append(btn, out);
      drawer.appendChild(wrap);
      continue;
    }

    const type = f.type || 'text';
    const val = getPath(cfg, f.key);

    if (type === 'checkbox') {
      const wrap = document.createElement('label');
      wrap.className = 'ra-check';
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = Boolean(val);
      const span = document.createElement('span');
      span.textContent = f.label;
      wrap.appendChild(el);
      wrap.appendChild(span);
      drawer.appendChild(wrap);
      if (f.hint) drawer.appendChild(makeHelp(f.hint));
      inputs[f.key] = { el, type };
      continue;
    }

    const field = document.createElement('div');
    field.className = 'ra-field';

    const lab = document.createElement('label');
    lab.className = 'ra-label';
    lab.textContent = f.label;
    field.appendChild(lab);

    let el;
    if (type === 'select') {
      el = document.createElement('select');
      for (const [v, text] of f.options || []) {
        const opt = document.createElement('option');
        opt.value = v;
        opt.textContent = text;
        el.appendChild(opt);
      }
      el.value = val ?? (f.options?.[0]?.[0] ?? '');
    } else if (type === 'textarea') {
      el = document.createElement('textarea');
      el.value = isNoOverwriteOnBlank(f) ? '' : (val ?? '');
      if (isNoOverwriteOnBlank(f) && val) el.dataset.hasStored = '1';
    } else {
      el = document.createElement('input');
      el.type = type === 'number' ? 'number' : type === 'password' ? 'password' : 'text';
      if (type === 'number') {
        el.min = '0';
        el.step = '1';
      }
      // 掩码项永不回显，避免肩窥与页面脚本读取
      el.value = type === 'password' ? '' : (val ?? '');
      if (type === 'number' || type === 'password') el.placeholder = f.hint || '';
    }
    if (type !== 'number' && type !== 'password' && type !== 'select') el.placeholder = f.hint || '';
    field.appendChild(el);

    if (type === 'password') {
      const toggle = document.createElement('button');
      toggle.type = 'button';
      toggle.className = 'ra-reveal';
      toggle.textContent = '显示';
      toggle.addEventListener('click', (e) => {
        e.preventDefault();
        const shown = el.type === 'text';
        el.type = shown ? 'password' : 'text';
        toggle.textContent = shown ? '显示' : '隐藏';
      });
      lab.appendChild(toggle);
    }
    if (type === 'select' && f.hint) field.appendChild(makeHelp(f.hint));
    drawer.appendChild(field);
    inputs[f.key] = { el, type };
  }

  function collectRaw() {
    const partial = {};
    for (const f of list) {
      if (!f.key) continue;
      const { el, type } = inputs[f.key];
      let v;
      if (type === 'checkbox') v = el.checked;
      else if (type === 'number') v = Number(el.value) || 0;
      else v = el.value;
      setPath(partial, f.key, v);
    }
    return partial;
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'ra-btn primary ra-save';
  saveBtn.textContent = '保存配置';
  saveBtn.addEventListener('click', () => {
    const raw = collectRaw();
    const partial = buildSavePatch(list, raw);
    // 保存后不把明文留在 DOM 里
    const wipe = () => {
      for (const f of list) {
        if (!f.key || !isNoOverwriteOnBlank(f)) continue;
        const { el, type } = inputs[f.key];
        if (type === 'password') {
          el.value = '';
          el.type = 'password';
          const t = el.parentElement?.querySelector('.ra-reveal');
          if (t) t.textContent = '显示';
        } else if (type === 'textarea') {
          el.value = '';
          el.dataset.hasStored = '1';
        }
      }
    };
    Promise.resolve(store.updateConfig(partial))
      .then(() => {
        saveBtn.textContent = '已保存';
        wipe();
        onSave?.(partial);
      })
      .catch((e) => {
        saveBtn.textContent = '保存失败';
        try {
          window.alert(String(e?.message || e));
        } catch {
          /* ignore */
        }
      })
      .finally(() => {
        setTimeout(() => {
          saveBtn.textContent = '保存配置';
        }, 1600);
      });
  });
  drawer.appendChild(saveBtn);

  if (typeof store.clearApplied === 'function' || typeof store.resetQuota === 'function') {
    const maint = document.createElement('div');
    maint.className = 'ra-maint';
    maint.style.display = 'flex';
    maint.style.gap = '8px';
    maint.style.marginTop = '10px';

    if (typeof store.clearApplied === 'function') {
      const clearBtn = document.createElement('button');
      clearBtn.type = 'button';
      clearBtn.className = 'ra-btn ghost';
      clearBtn.style.flex = '1';
      clearBtn.textContent = '清除已投记录';
      clearBtn.addEventListener('click', () => {
        if (!window.confirm('清除本地已投 jobId 列表？（去重会重新允许投递）')) return;
        store.clearApplied();
      });
      maint.appendChild(clearBtn);
    }
    if (typeof store.resetQuota === 'function') {
      const resetQBtn = document.createElement('button');
      resetQBtn.type = 'button';
      resetQBtn.className = 'ra-btn ghost';
      resetQBtn.style.flex = '1';
      resetQBtn.textContent = '重置今日配额';
      resetQBtn.addEventListener('click', () => {
        if (!window.confirm('将今日已投次数清零？')) return;
        store.resetQuota();
      });
      maint.appendChild(resetQBtn);
    }
    drawer.appendChild(maint);
  }

  root.appendChild(drawer);
  return {
    open: () => drawer.classList.add('open'),
    close: () => drawer.classList.remove('open'),
    toggle: () => drawer.classList.toggle('open'),
    slots
  };
}
