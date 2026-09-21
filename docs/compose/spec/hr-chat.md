---
feature: hr-chat
status: delivered
updated: 2026-09-11
branch: feat/hr-chat
commits: 4983be2..982a1a3
---

# BOSS 聊天页 HR 自动沟通闭环

## Report

**What was built** — 在 `https://www.zhipin.com/web/geek/chat` 上启用聊天闭环：主动问候开关（自定义文案或 OpenAI 兼容 LLM 生成，LLM 结果亦走草稿确认）；HR 新回复经轮询生成回复草稿，浮层「发送/跳过」一键确认，**不自动发送**。配置与已问候/已处理记录存 GM（`ra.boss.chat.*`），与投递 store 隔离。jobs 页配额结束后仅日志提示打开聊天页。简历 Markdown + 可编辑系统提示词模板 + baseUrl/apiKey/model 由配置写入。

**Verification** — `npm test`：38 pass / 0 fail / 1 skip（无 document 的 DOM fixture）。`npm run build`：PASS，`dist/resume-auto.user.js` ≈98 kB。Review 复核 criticals（GM 持久化、poller null baseline、模板字段、send 后 markHandled、文案与 HTML 转义）均已清除。

**Journey log**
- 评审发现 boot 未接 `gmBackend`、poller 在 `lastHandled==null` 时永不触发、模板未暴露 — 修复后补测 null-baseline 路径。
- 残余债：poller 会话 id 固定 `'current'`、seq 为 DOM 序号，多会话切换时可能误触发，后续应改稳定 convId + 消息 id。
- 自定义主动问候在 chat 页直接发送；`proactiveSource=llm` 与回复一律草稿确认。
- v1 未做「发送成功」DOM 二次确认，与 S2.3 文案有偏差，属可接受产品取舍。

## [S1] Problem

用户已在 jobs 列表页用 resume-auto 完成批量投递与默认招呼语发送，但大量会话「已读不回」或 HR 首条回复后无人跟进，沟通率低。需要在 **BOSS 消息/聊天页**（`https://www.zhipin.com/web/geek/chat`）形成闭环：配额后主动追加问候、HR 回复后自动起草（确认后发送）。

## [S2] Design

### 2.1 启用范围

| 项 | 约定 |
|----|------|
| 生效 URL | `zhipin.com` + path `/web/geek/chat` |
| jobs 页 | 仅日志提示打开聊天页 |
| 51job | 不在本功能范围 |

### 2.2 配置（GM，`ra.boss.chat.*`）

`proactiveEnabled` / `proactiveSource` (`custom`\|`llm`) / `proactiveCustom` / `replyMode=draft` / `autoReplyEnabled` / `proactiveMaxPerRun` / `llm.{baseUrl,apiKey,model,systemTemplate,temperature}` / `resumeMarkdown` / `targetRole`。

### 2.3–2.5 行为与 LLM

主动问候：开关 + custom 直发或 llm 草稿；会话启发式与 `greeted` 去重；间隔与单次上限。  
HR 回复：轮询 baseline → 新消息 → 草稿 → 用户点发送后 `markHandled`。  
LLM：`POST {baseUrl}/chat/completions`，模板占位 `{resumeMarkdown}{targetRole}{hrName}…{scene}`，GM_xmlhttpRequest 优先。

### 2.6 模块

`src/core/llm.js` · `src/core/chatStore.js` · `src/platforms/boss/chat/*` · `src/ui/chat/chatMode.js` · `index.user.js` 路由。

## [S3] Out of Scope

51job 聊天、全自动无确认发送、云端简历、列表投递算法变更。

## Tasks

- [x] T1: `core/llm.js` OpenAI 兼容调用 + 模板渲染 — acceptance: 单测成功/失败/占位符 (covers: S2.5)
- [x] T2: chat store（`ra.boss.chat.*`） — acceptance: 默认关闭；与投递 store 隔离 (covers: S2.2; depends: T1)
- [x] T3: chat selectors/extract/send — acceptance: 无 BOSS 依赖的启发式与 send 结构 (covers: S2.3, S2.4)
- [x] T4: chat poller — acceptance: null baseline 后新消息触发一次 (covers: S2.4; depends: T3)
- [x] T5: 浮层 chat 模式 UI（开关/草稿发送） — acceptance: CHAT_FIELDS 含模板与 LLM；草稿可发送/跳过 (covers: S2.3, S2.4)
- [x] T6: chat 路由 + jobs 提示 — acceptance: 仅 chat 页挂载 chat 模式 (covers: S2.1)
- [x] T7: vite grant/版本与 README — acceptance: test+build 通过 (covers: S2.1, S2.2)
