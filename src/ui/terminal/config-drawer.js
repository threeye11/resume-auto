const FIELDS = [
  ['jobInclude', '职位名包含', 'text'],
  ['companyInclude', '公司名包含', 'text'],
  ['companyExclude', '公司名排除', 'text'],
  ['descExclude', '描述排除词（预留）', 'text'],
  ['salaryMin', '薪资下限 (K)', 'number'],
  ['salaryMax', '薪资上限 (K)', 'number'],
  ['dailyLimit', '日配额', 'number'],
  ['greeting', '招呼语', 'textarea'],
  ['skipNoSalary', '无薪资跳过', 'checkbox'],
  ['autoPage', '自动翻页（当前页投完点下一页）', 'checkbox'],
  ['maxPages', '最多翻到第几页', 'number']
];

/** chat 页配置字段（支持 llm.* 路径） */
export const CHAT_FIELDS = [
  ['proactiveEnabled', '主动问候开关（仅聊天页）', 'checkbox'],
  ['proactiveSource', '问候来源 custom|llm', 'text'],
  ['proactiveCustom', '自定义主动问候（2–3句）', 'textarea'],
  ['autoReplyEnabled', 'HR回复自动起草（草稿+确认）', 'checkbox'],
  ['resumeMarkdown', '简历 Markdown', 'textarea'],
  ['targetRole', '目标岗位/行业', 'text'],
  ['llm.baseUrl', 'LLM baseUrl（OpenAI兼容）', 'text'],
  ['llm.apiKey', 'LLM API Key', 'text'],
  ['llm.model', 'LLM model', 'text'],
  ['llm.systemTemplate', '系统提示词模板（可编辑）', 'textarea'],
  ['proactiveMaxPerRun', '单次最多问候会话数', 'number']
];

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

export function mountConfigDrawer(root, { store, onSave, fields } = {}) {
  const list = fields || FIELDS;
  const drawer = document.createElement('div');
  drawer.className = 'ra-drawer';
  const cfg = store.getConfig();
  const inputs = {};

  for (const [key, label, type] of list) {
    const val = getPath(cfg, key);
    if (type === 'checkbox') {
      const wrap = document.createElement('label');
      wrap.className = 'ra-check';
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = Boolean(val);
      const span = document.createElement('span');
      span.textContent = label;
      wrap.appendChild(el);
      wrap.appendChild(span);
      drawer.appendChild(wrap);
      inputs[key] = { el, type };
      continue;
    }

    const field = document.createElement('div');
    field.className = 'ra-field';

    const lab = document.createElement('label');
    lab.className = 'ra-label';
    lab.textContent = label;
    field.appendChild(lab);

    let el;
    if (type === 'textarea') {
      el = document.createElement('textarea');
      el.value = val ?? '';
    } else if (type === 'password') {
      el = document.createElement('input');
      el.type = 'password';
      el.autocomplete = 'off';
      el.value = '';
    } else {
      el = document.createElement('input');
      el.type = type === 'number' ? 'number' : 'text';
      el.value = val ?? '';
      if (type === 'number') {
        el.min = '0';
        el.step = '1';
      }
    }
    field.appendChild(el);
    drawer.appendChild(field);
    inputs[key] = { el, type };
  }

  const saveBtn = document.createElement('button');
  saveBtn.type = 'button';
  saveBtn.className = 'ra-btn primary ra-save';
  saveBtn.textContent = '保存配置';
  saveBtn.addEventListener('click', () => {
    const partial = {};
    for (const [key, , type] of list) {
      const { el } = inputs[key];
      let v;
      if (type === 'checkbox') v = el.checked;
      else if (type === 'number') v = Number(el.value) || 0;
      else if (type === 'password') v = el.value;
      else v = el.value;
      setPath(partial, key, v);
    }
    Promise.resolve(store.updateConfig(partial))
      .then(() => {
        saveBtn.textContent = '已保存';
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
        }, 1200);
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
    toggle: () => drawer.classList.toggle('open')
  };
}
