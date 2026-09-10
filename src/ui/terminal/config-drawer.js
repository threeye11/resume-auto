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

    const lab = document.createElement('label');
    lab.textContent = label;
    drawer.appendChild(lab);
    let el;
    if (type === 'textarea') {
      el = document.createElement('textarea');
      el.value = cfg[key] ?? '';
    } else {
      el = document.createElement('input');
      el.type = type === 'number' ? 'number' : 'text';
      el.value = cfg[key] ?? '';
      if (type === 'number') {
        el.min = '0';
        el.step = '1';
      }
    }
    inputs[key] = { el, type };
    drawer.appendChild(el);
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

  root.appendChild(drawer);
  return {
    open: () => drawer.classList.add('open'),
    close: () => drawer.classList.remove('open'),
    toggle: () => drawer.classList.toggle('open')
  };
}
