import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/index.user.js',
      userscript: {
        name: 'resume-auto · 招聘站自动投递与沟通',
        namespace: 'https://github.com/local/resume-auto',
        version: '0.3.0',
        description: 'BOSS/51job 批量投递 + BOSS 聊天页主动问候与回复草稿',
        author: 'local',
        match: ['https://www.zhipin.com/*', 'https://we.51job.com/*', 'https://*.51job.com/*'],
        grant: [
          'GM_setValue',
          'GM_getValue',
          'GM_deleteValue',
          'GM_addStyle',
          'GM_registerMenuCommand',
          'GM_xmlhttpRequest'
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
