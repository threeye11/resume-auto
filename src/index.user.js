import { createBossAdapter } from './platforms/boss/adapter.js';
import { createLogger } from './core/logger.js';

const logger = createLogger();
logger.on('*', (p, e) => console.debug('[ra]', e.type, p));

const adapter = createBossAdapter({ logger });
if (adapter.matchHost()) {
  setTimeout(() => {
    const jobs = adapter.extractList();
    console.info('[resume-auto] extracted', jobs.length, jobs.slice(0, 3));
  }, 1500);
}
