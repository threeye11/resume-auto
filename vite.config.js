import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/index.user.js',
      userscript: {
        name: 'resume-auto · 招聘站自动投递',
        namespace: 'https://github.com/local/resume-auto',
        version: '0.2.0',
        description: 'BOSS直聘 / 前程无忧 筛选、去重、限配额批量投递 + 浮层终端',
        author: 'local',
        match: ['https://www.zhipin.com/*', 'https://we.51job.com/*', 'https://*.51job.com/*'],
        grant: [
          'GM_setValue',
          'GM_getValue',
          'GM_deleteValue',
          'GM_addStyle',
          'GM_registerMenuCommand'
        ],
        'run-at': 'document-idle',
        noframes: true
      },
      build: {
        fileName: 'resume-auto.user.js'
      }
    })
  ]
});
