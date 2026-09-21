---
feature: secure-secrets
status: delivered
updated: 2026-09-11
branch: feat/hr-chat
commits: 67de666..HEAD
---

# PIN + AES-GCM 敏感字段加密

## Report

**What was built** — 浏览器原生 **PBKDF2-SHA256（310000）→ AES-GCM-256** 保险库：PIN 从不落盘；GM 仅存 `{salt,iv,ct}`。敏感路径在启用 PIN 后从 `ra.boss.chat.config` **写空清除**，运行时仅在解锁后经内存合并。vault-aware 保存：锁定时拒绝敏感写入，解锁时密文进 vault。自动锁定分钟可配，上限 43200（30 天）。支持改 PIN（换盐）与重置保险库。

**Verification** — `npm test`：51 pass / 0 fail / 1 skip。`npm run build`：PASS（≈118 kB）。覆盖：加解密、错误 PIN、GM 无明文、锁定拒写、路径合并。

**Journey log**
- `chatStore.updateConfig` 浅合并导致「删键不清值」；scrub 必须显式写空。
- UI 必须挂 vault-aware store，禁止直接写 `store.raw`。
- `updateSecrets` 按 `SENSITIVE_PATHS` 路径合并，避免丢掉 `llm.systemTemplate`。
- jobs 页 `greeting` 明文仍在投递 config（v1 未接 vault）。

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
