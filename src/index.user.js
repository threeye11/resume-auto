import { createLogger } from './core/logger.js';
import { createStore, gmBackend } from './core/store.js';
import { createPipeline } from './core/pipeline.js';
import { createBossAdapter } from './platforms/boss/adapter.js';
import { mountTerminal } from './ui/terminal/terminal.js';

function boot() {
  const logger = createLogger();
  const store = createStore(gmBackend());
  const adapter = createBossAdapter({ logger });

  if (!adapter.matchHost()) return;

  const pipeline = createPipeline({ adapter, store, logger });
  const ui = mountTerminal({
    logger,
    store,
    controls: {
      onStart: () => {
        ui.setStatus('投递中…');
        pipeline.start();
      },
      onPause: () => pipeline.pause(),
      onStop: () => {
        pipeline.stop();
        ui.setStatus('已停止');
      }
    }
  });

  window.__ra = { adapter, logger, store, pipeline, ui };
  ui.setStatus('就绪 · 配置后点开始');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
