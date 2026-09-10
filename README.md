# resume-auto

Tampermonkey 用户脚本：BOSS直聘筛选批量投递 + 自定义招呼语 + 浮层终端。

## 安装
1. 安装[篡改猴](https://www.tampermonkey.net/)
2. `npm install && npm run build`
3. 将 `dist/resume-auto.user.js` 导入篡改猴

## 使用
1. 登录 BOSS直聘，打开职位列表（先用站内筛选缩小范围）
2. 右下角浮层 →「配置」填职位关键词/排除公司/薪资/招呼语/日配额
3. 「开始」；可暂停/停止/导出日志

## 开发
- `npm test` — core 单测
- `npm run dev` — 终端 UI 预览（index.html）
- 选择器：`src/platforms/boss/selectors.js`

## 免责
仅供个人求职学习交流，使用自动化有账号风控风险，禁止商用。
