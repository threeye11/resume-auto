import { defineConfig } from 'vite';
import monkey from 'vite-plugin-monkey';

export default defineConfig({
  plugins: [
    monkey({
      entry: 'src/index.user.js',
      userscript: {
        name: 'resume-auto · BOSS直聘自动投递',
        namespace: 'https://github.com/local/resume-auto',
        version: '0.1.0',
        description: '筛选、去重、限配额批量投递 + 浮层终端',
        author: 'local',
        match: ['https://www.zhipin.com/*'],
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
