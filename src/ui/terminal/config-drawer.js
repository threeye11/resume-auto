const FIELDS = [
  ['jobInclude', '职位名包含', 'text'],
  ['companyInclude', '公司名包含', 'text'],
  ['companyExclude', '公司名排除', 'text'],
  ['descExclude', '描述排除词（预留）', 'text'],
  ['salaryMin', '薪资下限 (K)', 'number'],
  ['salaryMax', '薪资上限 (K)', 'number'],
  ['dailyLimit', '日配额', 'number'],
  ['greeting', '招呼语', 'textarea'],
  ['skipNoSalary', '无薪资跳过', 'checkbox']
];

export function mountConfigDrawer(root, { store, onSave }) {
  const drawer = document.createElement('div');
  drawer.className = 'ra-drawer';
  const cfg = store.getConfig();
  const inputs = {};

  for (const [key, label, type] of FIELDS) {
    if (type === 'checkbox') {
      const wrap = document.createElement('label');
      wrap.className = 'ra-check';
      const el = document.createElement('input');
      el.type = 'checkbox';
      el.checked = Boolean(cfg[key]);
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
      el.value = cfg[key] ?? '';
      el.placeholder = '投递成功后可选发送…';
    } else {
      el = document.createElement('input');
      el.type = type === 'number' ? 'number' : 'text';
      el.value = cfg[key] ?? '';
      if (type === 'number') {
        el.min = '0';
        el.step = '1';
      } else {
        el.placeholder = '逗号分隔，留空不限';
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
    for (const [key, , type] of FIELDS) {
      const { el } = inputs[key];
      if (type === 'checkbox') partial[key] = el.checked;
      else if (type === 'number') partial[key] = Number(el.value) || 0;
      else partial[key] = el.value;
    }
    store.updateConfig(partial);
    saveBtn.textContent = '已保存';
    setTimeout(() => {
      saveBtn.textContent = '保存配置';
    }, 1200);
    onSave?.(partial);
  });
  drawer.appendChild(saveBtn);

  // 维护：清除误记的已投 / 重置当日配额
  const maint = document.createElement('div');
  maint.className = 'ra-maint';
  maint.style.display = 'flex';
  maint.style.gap = '8px';
  maint.style.marginTop = '10px';

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = 'ra-btn ghost';
  clearBtn.style.flex = '1';
  clearBtn.textContent = '清除已投记录';
  clearBtn.addEventListener('click', () => {
    if (!window.confirm('清除本地已投 jobId 列表？（去重会重新允许投递）')) return;
    store.clearApplied?.();
    clearBtn.textContent = '已清除';
    setTimeout(() => {
      clearBtn.textContent = '清除已投记录';
    }, 1200);
  });

  const resetQBtn = document.createElement('button');
  resetQBtn.type = 'button';
  resetQBtn.className = 'ra-btn ghost';
  resetQBtn.style.flex = '1';
  resetQBtn.textContent = '重置今日配额';
  resetQBtn.addEventListener('click', () => {
    if (!window.confirm('将今日已投次数清零？')) return;
    store.resetQuota?.();
    resetQBtn.textContent = '已重置';
    setTimeout(() => {
      resetQBtn.textContent = '重置今日配额';
    }, 1200);
  });

  maint.appendChild(clearBtn);
  maint.appendChild(resetQBtn);
  drawer.appendChild(maint);

  root.appendChild(drawer);
  return {
    open: () => drawer.classList.add('open'),
    close: () => drawer.classList.remove('open'),
    toggle: () => drawer.classList.toggle('open')
  };
}
