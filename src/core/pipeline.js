import { matchFilter } from './filter.js';
import { createDedupe } from './dedupe.js';
import { checkQuota, consumeQuota } from './quota.js';
import { createScheduler } from './scheduler.js';

export function createPipeline({ adapter, store, logger }) {
  const scheduler = createScheduler({
    delayMs: () => {
      const c = store.getConfig();
      const min = c.delayMinMs || 800;
      const max = Math.max(min, c.delayMaxMs || 2000);
      return min + Math.floor(Math.random() * (max - min + 1));
    },
    failStreakLimit: 5,
    onError: (err, index) => {
      logger.emit('error', { where: 'pipeline', index, msg: err.message || String(err) });
    },
    onStreak: (failStreak) => {
      logger.emit('error', { where: 'streak', msg: '连续失败自动暂停', failStreak });
    }
  });

  let running = false;

  async function start() {
    if (running && scheduler.state() === 'paused') {
      scheduler.resume();
      return;
    }
    if (running) return;
    running = true;
    const cfg = store.getConfig();
    const jobs = adapter.extractList();

    const dedupe = createDedupe(store, {
      isApplied: (id) => {
        const j = jobs.find((x) => x.id === id);
        return j ? adapter.isApplied(j) : false;
      }
    });

    const survivors = [];
    let pass = 0;
    for (const job of jobs) {
      const f = matchFilter(job, cfg);
      if (!f.pass) {
        logger.emit('apply', { id: job.id, title: job.title, company: job.company, status: `排除:${f.reason}` });
        continue;
      }
      pass += 1;
      if (dedupe.shouldSkip(job.id)) {
        logger.emit('dedupe', { id: job.id, title: job.title });
        continue;
      }
      survivors.push(job);
    }
    logger.emit('filter', { pass, total: jobs.length });

    let ok = 0, skip = 0, fail = 0;
    const tasks = survivors.map((job, index) => async () => {
      const q = checkQuota(store, cfg.dailyLimit);
      if (!q.canApply) {
        logger.emit('quota', { stopped: true, count: q.count, limit: q.limit });
        scheduler.stop();
        return 'quota-stop';
      }
      const r = await adapter.apply(job);
      if (r === 'ok') {
        ok += 1;
        consumeQuota(store, 1);
        dedupe.mark(job.id);
        logger.emit('apply', { index: index + 1, title: job.title, company: job.company, status: 'ok' });
        if (cfg.greeting && String(cfg.greeting).trim()) {
          // 等会话/弹窗出现再发招呼
          await new Promise((r) => setTimeout(r, 800));
          const g = await adapter.sendGreeting(job, cfg.greeting);
          logger.emit('greet', { status: g, title: job.title });
        }
      } else if (r === 'skip') {
        skip += 1;
        dedupe.mark(job.id);
        logger.emit('apply', { index: index + 1, title: job.title, company: job.company, status: 'skip' });
      } else {
        fail += 1;
        logger.emit('apply', { index: index + 1, title: job.title, company: job.company, status: 'fail' });
      }
      logger.emit('progress', { done: ok + skip + fail, total: survivors.length });
      const qq = store.getQuota();
      logger.emit('quota', { count: qq.count, limit: cfg.dailyLimit });
    });

    try {
      await scheduler.run(tasks);
    } finally {
      if (scheduler.state() !== 'paused') {
        running = false;
        logger.emit('done', { ok, skip, fail });
      }
    }
  }

  return {
    start,
    pause: () => scheduler.pause(),
    resume: () => scheduler.resume(),
    stop: () => scheduler.stop(),
    isRunning: () => running
  };
}
