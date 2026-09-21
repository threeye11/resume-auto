---
feature: hr-chat
status: in-progress
updated: 2026-09-11
branch: feat/hr-chat
commits: 
---

# BOSS 聊天页 HR 自动沟通闭环

## Report

## [S1] Problem

用户已在 jobs 列表页用 resume-auto 完成批量投递与默认招呼语发送，但大量会话「已读不回」或 HR 首条回复后无人跟进，沟通率低。需要在 **BOSS 消息/聊天页**（`https://www.zhipin.com/web/geek/chat`）形成闭环：

1. 投递配额完成后，对相关会话**主动追加 2–3 句**深聊开场（提高回复率）；
2. HR 回复后可**自动起草**求职者回复（人工确认后发送），降低漏回。

列表页投递逻辑保持不变；聊天自动化**仅在 chat 页生效**，且由开关显式启用。

## [S2] Design

### 2.1 启用范围

| 项 | 约定 |
|----|------|
| 生效 URL | hostname 匹配 `zhipin.com` 且 path 匹配 `/web/geek/chat`（含 query） |
| 入口 | `index.user.js`：chat 页挂载 **chat 终端模式**（与 jobs 投递终端共用浮层壳，模式不同） |
| 51job | 不在本功能范围 |
| jobs 页 | 配额跑完后仅**日志提示**：「自动问候仅在聊天页生效，请打开消息页」；不跳转、不在列表页发深聊 |

### 2.2 配置（存 GM，namespace `boss.chat`）

| 键 | 说明 |
|----|------|
| `proactiveEnabled` | 主动问候总开关，默认 false |
| `proactiveSource` | `'custom' \| 'llm'` |
| `proactiveCustom` | 自定义 2–3 句模板（支持 `\n`） |
| `replyMode` | `'draft'`（v1 唯一实现）；预留 `'auto'` 字段但 UI 不启用全自动 |
| `autoReplyEnabled` | HR 回复自动起草开关，默认 false |
| `llm.baseUrl` | OpenAI 兼容，如 `https://api.deepseek.com/v1` |
| `llm.apiKey` | 仅存本地 GM，不入库、不写入日志全文 |
| `llm.model` | 如 `deepseek-chat` |
| `resumeMarkdown` | 简历全文（MD） |
| `targetRole` | 可选：目标岗位/行业关键词 |
| `systemPromptTemplate` | 可编辑系统提示词模板，占位符见 2.5 |

API Key 在终端日志中只显示掩码（如 `sk-***abc`）。

### 2.3 主动问候（Proactive Greeting）

**触发：** chat 页 + `proactiveEnabled` + 用户点「开始问候」（或「开始」在 chat 模式下 = 跑主动问候队列）。

**目标会话判定（v1）：**

1. 从会话列表 DOM 提取会话项：对方名/职位/公司、未读标记、最近消息摘要、会话元素；
2. 进入队列的条件（可配置子集，v1 固定）：
   - 存在今日投递痕迹 **或** 会话仍处于「仅己方招呼/极短对话」（启发式：消息条数 ≤ 2 且最后一条为己方）；
   - 未发送过本脚本的主动问候（GM 记录 `greeted: <convId>`）；
3. `convId`：优先 DOM 上稳定 id；否则 `hash(对方名+职位+公司)`。

**发送内容：**

- `proactiveSource=custom`：使用 `proactiveCustom`，按 `\n` 拆成 2–3 条或一条多行（v1：**一条消息、内含换行/分号连接**，降低刷屏与风控）；
- `proactiveSource=llm`：调用 2.5 模板，用户消息为「请为该岗位会话生成 2–3 句主动跟进问候」，附上会话上下文与简历摘要；输出写入草稿，**默认仍走确认发送**（与回复草稿同一确认流）。

**节奏：** 会话间随机延迟（默认 2–4s，可配）；单次运行上限默认 `proactiveMaxPerRun=10`。

**成功判定：** 发送输入框写入并点击发送后，消息列表出现对应文本或发送按钮状态变化；否则记 fail，不写 `greeted`。

### 2.4 HR 回复 → 草稿 + 一键发送

**触发：** `autoReplyEnabled` + chat 页。

**检测：** 轮询或 MutationObserver 扫描当前会话消息流；识别「对方最新一条」且时间戳/序号大于该会话已处理标记。

**行为：**

1. 读取当前会话上下文（最近 N 条，N 默认 10，双方分角色）；
2. 调 LLM（2.5）生成回复草稿；
3. 浮层「待发送」区展示：会话名、HR 原话、草稿、「发送」「跳过」「编辑后发送」；
4. **不自动点发送**；发送成功后更新 `lastHandled`。

**失败：** API 错误、超时（默认 30s）→ 日志 error，草稿区显示原因，不阻塞其它会话检测。

### 2.5 LLM 契约（OpenAI Chat Completions）

```
POST {baseUrl}/chat/completions
Authorization: Bearer {apiKey}
Body: { model, messages: [system, ...history, user], temperature: 0.6 }
```

**默认 system 模板（可编辑）：**

```
你是求职沟通助手。求职者背景如下（Markdown 简历）：
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
生成回复正文，不要输出解释。
```

`proactiveCustom` 场景不调用 LLM。`scene` 与会话字段在组装 messages 时替换。

**隐私：** 简历与 API Key 仅存浏览器 GM；不上传到本项目服务器。

### 2.6 模块结构

```text
src/
  platforms/boss/chat/
    selectors.js     # 会话列表、消息流、输入框、发送按钮
    extract.js       # 会话/消息提取
    send.js          # 写入输入框并发送（与投递 actions 同类 clickLike 策略）
    poller.js        # HR 新回复检测
  core/llm.js        # OpenAI 兼容 client（可注入 fetch，便于单测）
  core/chatStore.js  # 或扩展 createStore ns：boss.chat 配置/已问候/已处理
  ui/terminal/       # chat 模式：问候队列日志 + 待发送草稿列表
  index.user.js      # chat 路由 → chat 模式 boot
```

浮层 chat 模式操作：`开始问候` / `暂停` / `停止` / `配置` / 草稿区发送/跳过。

### 2.7 错误与风控

- 非 chat 页点「问候」→ 提示仅聊天页生效；
- 未配 LLM 且 `proactiveSource=llm` 或 `autoReplyEnabled` → 阻止开始并提示去配置；
- 单次问候达上限停止；连续发送失败 3 次自动暂停；
- 不点击招聘方无关按钮；不访问非 zhipin 域。

## [S3] Out of Scope

- 51job 聊天自动化
- 全自动无确认发送（UI 可预留，v1 不交付）
- 多轮复杂谈判策略、面试约面日程写入
- 服务端代理、云端简历库
- 修改 jobs 列表投递算法

## Tasks

- [ ] T1: `core/llm.js` OpenAI 兼容调用 + 占位符模板渲染 — acceptance: 单测覆盖成功/HTTP 失败/模板替换；不泄漏 apiKey 到返回字符串日志字段 (covers: S2.5)
- [ ] T2: chat store（`boss.chat` 配置与 greeted/lastHandled） — acceptance: 单测隔离于投递 store；默认 proactive/auto 均为关 (covers: S2.2; depends: T1)
- [ ] T3: `platforms/boss/chat/selectors+extract+send` — acceptance: 单测可用 fixture DOM 列出会话/消息；send 写入输入框；无真实 BOSS 依赖 (covers: S2.3, S2.4)
- [ ] T4: chat poller（新 HR 回复检测） — acceptance: 单测：新消息触发一次；已处理不重复 (covers: S2.4; depends: T3)
- [ ] T5: 浮层 chat 模式 UI（开关、草稿区、一键发送） — acceptance: preview 页可模拟草稿发送/跳过；非 chat 路由不挂载投递控件误用 (covers: S2.3, S2.4)
- [ ] T6: `index.user.js` chat 路由 + jobs 页配额后提示 — acceptance: chat URL 进入 chat 模式；jobs 完成日志含「仅聊天页生效」提示 (covers: S2.1)
- [ ] T7: vite `@match` 与 build/README 更新 — acceptance: `npm test`+`npm run build` 通过；README 增加聊天闭环章节 (covers: S2.1, S2.2)
