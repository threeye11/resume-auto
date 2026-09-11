import { createLogger } from './core/logger.js';
import { createStore, gmBackend } from './core/store.js';
import { createPipeline } from './core/pipeline.js';
import { createBossAdapter } from './platforms/boss/adapter.js';
import { createW51Adapter } from './platforms/w51job/adapter.js';
import { mountTerminal } from './ui/terminal/terminal.js';

function pickAdapter(logger) {
  const host = location.hostname;
  if (/(^|\.)zhipin\.com$/i.test(host)) return createBossAdapter({ logger });
  if (/(^|\.)51job\.com$/i.test(host)) return createW51Adapter({ logger });
  return null;
}

function boot() {
  const logger = createLogger();
  const store = createStore(gmBackend());
  const adapter = pickAdapter(logger);

  if (!adapter || !adapter.matchHost()) return;

  const pipeline = createPipeline({ adapter, store, logger });
  const ui = mountTerminal({
    logger,
    store,
    controls: {
      onStart: () => {
        ui.setStatus('投递中…');
        pipeline.start();
      },
      onPause: () => {
        pipeline.pause();
        ui.setStatus('已暂停');
      },
      onStop: () => {
        pipeline.stop();
        ui.setStatus('已停止');
      }
    }
  });

  window.__ra = { adapter, logger, store, pipeline, ui };
  ui.setStatus(`就绪 · ${adapter.id()} · 配置后点开始`);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
