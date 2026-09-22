---
feature: secure-secrets
status: delivered
updated: 2026-09-22
branch: feat/hr-chat
commits: 67de666..HEAD
---

# PIN + AES-GCM 敏感字段加密

## Report

**What was built** — 浏览器原生 **PBKDF2-SHA256（310000）→ AES-GCM-256** 保险库：PIN 从不落盘；GM 仅存 `{salt,iv,ct}`。敏感路径在启用 PIN 后从 `ra.boss.chat.config` **写空清除**，运行时仅在解锁后经内存合并。vault-aware 保存：锁定时拒绝敏感写入，解锁时密文进 vault。自动锁定分钟可配，上限 43200（30 天）。支持改 PIN（换盐）与重置保险库。

**Verification** — `npm test`：62 pass / 0 fail / 1 skip。`npm run build`：PASS（128.2 kB，`@version 0.4.0`）。覆盖：加解密、错误 PIN、GM 无明文、锁定拒写、路径合并、掩码与"留空不覆盖"规则、引导顺序结构。

**Journey log**
- `chatStore.updateConfig` 浅合并导致「删键不清值」；scrub 必须显式写空。
- UI 必须挂 vault-aware store，禁止直接写 `store.raw`。
- `updateSecrets` 按 `SENSITIVE_PATHS` 路径合并，避免丢掉 `llm.systemTemplate`。
- jobs 页 `greeting` 明文仍在投递 config（v1 未接 vault）。
- 2026-09-22 加固轮见下文 [S5]。

## [S5] 2026-09-22 加固：输入面与暴露面收敛

| 变更 | 位置 |
|------|------|
| 保险库面板挂到配置抽屉 **① 号 slot**，引导顺序变为「先 PIN → 背景 → 模型 → 开关」 | `config-drawer.js` 的 `{ slot: 'vault' }`、`chatMode.js` 取 `ui.slots.vault` |
| `llm.apiKey` 改 **掩码框且永不回显**，带「显示」切换；保存成功后清空敏感输入框 | `config-drawer.js` |
| 掩码项与全部 `SENSITIVE_PATHS` 字段统一 **留空 = 不修改**（`buildSavePatch` 剔除空值），避免不回显反把已存值覆盖成空 | `config-drawer.js` |
| 浮层整体进 **Shadow DOM**（`#ra-root` 仅作宿主），招聘站页面脚本 `querySelector` 读不到配置输入框；样式 `#ra-root` → `:host` | `terminal.js`、`styles.css` |
| 新增 **「测试连通性」**：`testConnection()` 只发一条 `ping`（`max_tokens:8`，不注入简历），apiKey 留空时回落到保险库解密值，日志仅记 `maskApiKey` | `core/llm.js`、`chatMode.js` |

**本轮修掉的两个真 bug**
1. `chatStore.updateConfig` 对 `llm` 是**整对象替换**，因此保险库未启用时只提交非敏感 `llm.baseUrl` 也会把已存 `apiKey` 清成默认空值 → vault-aware 分支改为先 `mergePartial` 再写（回归用例：`vault 未启用时部分保存不清空已存 apiKey`）。
2. Chrome 中 **`:host.class` 形式在后代选择器里不匹配**（`:host .x`、`:host(.class) .y` 才生效），Shadow DOM 迁移后最大化/折叠静默失效 → 状态类统一写成 `:host(.ra-maximized)` / `:host(.ra-collapsed)`。仅浏览器实测可发现。

**残余暴露面（已知、可接受）**：解锁期间 `window.__raChat.effectiveConfig()` 在控制台可直接取到明文 Key（保留了调试入口）；未设 PIN 时敏感项仍明文存 GM。

## [S1] Problem

API Key 与简历等隐私以明文写入 GM，存在本机泄露风险。

## [S2] Design

实现见：`src/core/crypto.js`、`src/core/vault.js`、`src/ui/vaultPanel.js`。

加密字段：`llm.apiKey`、`llm.systemTemplate`、`resumeMarkdown`、`targetRole`、`proactiveCustom`、`greeting`。

## [S3] Out of Scope

云同步 PIN、生物识别、jobs 页 greeting 的 vault 接入。

## Tasks

- [x] T1: crypto.js PBKDF2+AES-GCM (covers: S2)
- [x] T2: vault.js 生命周期与路径合并 (covers: S2)
- [x] T3: 保险库 UI + vault-aware 保存 (covers: S2)
- [x] T4: chat LLM 锁定门闩 (covers: S2)
- [x] T5: README + test/build (covers: S2)
- [x] T6: 掩码输入 + 留空不覆盖 + Shadow DOM 隔离 + 连通性测试 + PIN 前置引导 (covers: S5)
