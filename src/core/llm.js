/** 渲染 {placeholder} 模板 */
export function renderTemplate(template, vars = {}) {
  return String(template ?? '').replace(/\{(\w+)\}/g, (_, key) => {
    const v = vars[key];
    return v === undefined || v === null ? '' : String(v);
  });
}

export function maskApiKey(key) {
  const s = String(key || '');
  if (!s) return '';
  if (s.length <= 8) return '***';
  return `${s.slice(0, 3)}***${s.slice(-3)}`;
}

export const DEFAULT_SYSTEM_TEMPLATE = `你是求职沟通助手。求职者背景如下（Markdown 简历）：
{resumeMarkdown}

目标岗位/行业：{targetRole}

当前招聘方信息：{hrName} / {jobTitle} / {company}
最近对话：
{recentMessages}

请用简体中文回复招聘方，要求：
1. 真诚、具体，结合简历中的技能与项目，不编造经历；
2. 长度 2–4 句，口语化，适合即时通讯；
3. 不要使用列表符号堆砌；必要时可问清岗位要求或可到岗时间；
4. 场景 {scene}：proactive=主动跟进问候；reply=回复对方最新消息。
生成回复正文，不要输出解释。`;

/** Tampermonkey 下优先 GM_xmlhttpRequest，绕过页面 CORS */
function defaultFetchImpl() {
  if (typeof GM_xmlhttpRequest === 'function') {
    return (url, init = {}) =>
      new Promise((resolve, reject) => {
        const headers = { ...(init.headers || {}) };
        GM_xmlhttpRequest({
          method: init.method || 'GET',
          url,
          headers,
          data: init.body,
          onload: (res) => {
            resolve({
              ok: res.status >= 200 && res.status < 300,
              status: res.status,
              text: async () => res.responseText,
              json: async () => JSON.parse(res.responseText || '{}')
            });
          },
          onerror: (err) => reject(new Error(err?.error || 'GM_xmlhttpRequest failed')),
          ontimeout: () => reject(new Error('llm timeout'))
        });
      });
  }
  return globalThis.fetch?.bind(globalThis);
}

/**
 * OpenAI 兼容 Chat Completions
 * @param {object} cfg { baseUrl, apiKey, model, temperature, timeoutMs, systemTemplate }
 * @param {object} ctx { scene, hrName, jobTitle, company, resumeMarkdown, targetRole, recentMessages }
 * @param {{ fetchImpl?: typeof fetch }} [deps]
 */
export async function chatComplete(cfg, ctx, deps = {}) {
  const fetchImpl = deps.fetchImpl || defaultFetchImpl();
  if (!fetchImpl) throw new Error('fetch unavailable');
  const baseUrl = String(cfg.baseUrl || '').replace(/\/+$/, '');
  const apiKey = String(cfg.apiKey || '');
  const model = String(cfg.model || '');
  if (!baseUrl) throw new Error('llm.baseUrl missing');
  if (!apiKey) throw new Error('llm.apiKey missing');
  if (!model) throw new Error('llm.model missing');

  const systemTemplate = cfg.systemTemplate || DEFAULT_SYSTEM_TEMPLATE;
  const system = renderTemplate(systemTemplate, {
    resumeMarkdown: ctx.resumeMarkdown || '',
    targetRole: ctx.targetRole || '',
    hrName: ctx.hrName || '',
    jobTitle: ctx.jobTitle || '',
    company: ctx.company || '',
    recentMessages: ctx.recentMessages || '',
    scene: ctx.scene || 'reply'
  });

  const user =
    ctx.scene === 'proactive'
      ? '请根据以上背景，为该会话生成 2–3 句主动跟进问候，直接输出正文。'
      : '请根据以上对话与背景，生成对招聘方最新消息的回复，直接输出正文。';

  const messages = [
    { role: 'system', content: system },
    ...(ctx.extraMessages || []),
    { role: 'user', content: user }
  ];

  const timeoutMs = Number(cfg.timeoutMs) || 30000;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: cfg.temperature ?? 0.6
      }),
      signal: ctrl.signal
    });
    if (!res.ok) {
      const body = await res.text().catch(() => '');
      throw new Error(`llm http ${res.status}: ${body.slice(0, 200)}`);
    }
    const data = await res.json();
    const text = data?.choices?.[0]?.message?.content;
    if (!text || !String(text).trim()) throw new Error('llm empty completion');
    return String(text).trim();
  } finally {
    clearTimeout(timer);
  }
}
