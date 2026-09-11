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

  /**
   * 指针式扫描：从上到下走一遍列表。
   * 已投过 → 跳过并继续下一个；未投过 → 进入待投队列。
   */
  function buildQueue(jobs, cfg, dedupe) {
    const pending = [];
    let filtered = 0;
    let skippedApplied = 0;

    for (let i = 0; i < jobs.length; i++) {
      const job = jobs[i];
      const f = matchFilter(job, cfg);
      if (!f.pass) {
        filtered += 1;
        logger.emit('apply', {
          index: i + 1,
          title: job.title,
          company: job.company,
          status: `排除:${f.reason}`
        });
        continue;
      }
      if (dedupe.shouldSkip(job.id)) {
        skippedApplied += 1;
        logger.emit('dedupe', {
          index: i + 1,
          title: job.title,
          company: job.company,
          status: '已投跳过→找下一个'
        });
        continue;
      }
      pending.push(job);
    }

    return { pending, filtered, skippedApplied };
  }

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

    const { pending, filtered, skippedApplied } = buildQueue(jobs, cfg, dedupe);

    logger.emit('filter', {
      pass: pending.length + skippedApplied,
      total: jobs.length,
      pending: pending.length,
      skippedApplied,
      filtered
    });

    // 开跑前先看配额：已满则不再点任何岗位，但已把「还有哪些未投」扫完
    const q0 = checkQuota(store, cfg.dailyLimit);
    if (pending.length === 0) {
      running = false;
      logger.emit('done', {
        ok: 0,
        skip: skippedApplied,
        fail: 0,
        note: skippedApplied > 0 ? '列表内均已投过或被排除' : '无可投岗位'
      });
      return;
    }
    if (!q0.canApply) {
      running = false;
      logger.emit('quota', {
        stopped: true,
        count: q0.count,
        limit: q0.limit,
        pending: pending.length,
        note: `今日配额已用尽（${q0.count}/${q0.limit}），仍有 ${pending.length} 条未投。可在「配置」里重置今日配额后再开始`
      });
      logger.emit('done', { ok: 0, skip: skippedApplied, fail: 0, note: '配额用尽未投递' });
      return;
    }

    logger.emit('scan', {
      count: jobs.length,
      pending: pending.length,
      skippedApplied,
      note: `待投 ${pending.length} 条（已跳过 ${skippedApplied} 条已投）`
    });

    let ok = 0;
    let skip = 0;
    let fail = 0;
    let quotaStopped = false;

    // 只对「未投过」的岗位建任务；过程中已投/配额仍会再判一次
    const tasks = pending.map((job, index) => async () => {
      if (quotaStopped) return 'quota-stop';

      const q = checkQuota(store, cfg.dailyLimit);
      if (!q.canApply) {
        quotaStopped = true;
        logger.emit('quota', {
          stopped: true,
          count: q.count,
          limit: q.limit,
          note: `配额 ${q.count}/${q.limit} 已满，停止后续 ${pending.length - index} 条`
        });
        scheduler.stop();
        return 'quota-stop';
      }

      // 指针前进时再验一次（可能其它窗口刚投过）
      if (dedupe.shouldSkip(job.id)) {
        skip += 1;
        logger.emit('apply', { index: index + 1, title: job.title, status: 'skip' });
        return 'skip';
      }

      const r = await adapter.apply(job);
      if (r === 'ok') {
        ok += 1;
        consumeQuota(store, 1);
        dedupe.mark(job.id);
        logger.emit('apply', {
          index: index + 1,
          title: job.title,
          company: job.company,
          status: 'ok'
        });
        if (cfg.greeting && String(cfg.greeting).trim()) {
          await new Promise((r2) => setTimeout(r2, 800));
          const g = await adapter.sendGreeting(job, cfg.greeting);
          logger.emit('greet', { status: g, title: job.title });
        }
      } else if (r === 'skip') {
        skip += 1;
        dedupe.mark(job.id);
        logger.emit('apply', {
          index: index + 1,
          title: job.title,
          company: job.company,
          status: 'skip'
        });
      } else {
        fail += 1;
        logger.emit('apply', {
          index: index + 1,
          title: job.title,
          company: job.company,
          status: 'fail'
        });
      }

      logger.emit('progress', {
        done: ok + skip + fail,
        total: pending.length,
        ok,
        fail,
        skippedApplied
      });
      const qq = store.getQuota();
      logger.emit('quota', { count: qq.count, limit: cfg.dailyLimit });
    });

    try {
      await scheduler.run(tasks);
    } finally {
      if (scheduler.state() !== 'paused') {
        running = false;
        logger.emit('done', { ok, skip: skip + skippedApplied, fail, pending: pending.length });
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
