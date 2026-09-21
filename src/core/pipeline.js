import { matchFilter } from './filter.js';
import { createDedupe } from './dedupe.js';
import { checkQuota, consumeQuota } from './quota.js';
import { createScheduler } from './scheduler.js';

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

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
          status: '已投跳过'
        });
        continue;
      }
      pending.push(job);
    }

    return { pending, filtered, skippedApplied };
  }

  function makeDedupe(jobs) {
    return createDedupe(store, {
      isApplied: (id) => {
        const j = jobs.find((x) => x.id === id);
        return j ? adapter.isApplied(j) : false;
      }
    });
  }

  /** 处理当前列表页；返回统计与是否可翻页 */
  async function runOnePage(pageNum, cfg, acc) {
    const jobs = adapter.extractList();
    const dedupe = makeDedupe(jobs);
    const { pending, filtered, skippedApplied } = buildQueue(jobs, cfg, dedupe);

    logger.emit('filter', {
      page: pageNum,
      pass: pending.length + skippedApplied,
      total: jobs.length,
      pending: pending.length,
      skippedApplied,
      filtered
    });

    const q0 = checkQuota(store, cfg.dailyLimit);
    if (pending.length === 0) {
      logger.emit('scan', {
        page: pageNum,
        count: jobs.length,
        pending: 0,
        note: `第 ${pageNum} 页无待投（已投跳过 ${skippedApplied}）`
      });
      acc.skip += skippedApplied;
      return { canPage: true, quotaStopped: false };
    }

    if (!q0.canApply) {
      logger.emit('quota', {
        stopped: true,
        count: q0.count,
        limit: q0.limit,
        pending: pending.length,
        note: `今日配额已用尽（${q0.count}/${q0.limit}），第 ${pageNum} 页仍有 ${pending.length} 条未投`
      });
      acc.skip += skippedApplied;
      return { canPage: false, quotaStopped: true };
    }

    logger.emit('scan', {
      page: pageNum,
      count: jobs.length,
      pending: pending.length,
      note: `第 ${pageNum} 页 · 待投 ${pending.length} 条（已跳过 ${skippedApplied} 条）`
    });

    let quotaStopped = false;
    const tasks = pending.map((job, index) => async () => {
      if (quotaStopped) return 'quota-stop';

      const q = checkQuota(store, cfg.dailyLimit);
      if (!q.canApply) {
        quotaStopped = true;
        logger.emit('quota', {
          stopped: true,
          count: q.count,
          limit: q.limit,
          note: `配额 ${q.count}/${q.limit} 已满，停止后续`
        });
        scheduler.stop();
        return 'quota-stop';
      }

      if (dedupe.shouldSkip(job.id)) {
        acc.skip += 1;
        logger.emit('apply', { index: index + 1, title: job.title, status: 'skip' });
        return 'skip';
      }

      const r = await adapter.apply(job);
      if (r === 'ok') {
        acc.ok += 1;
        consumeQuota(store, 1);
        dedupe.mark(job.id);
        logger.emit('apply', {
          index: index + 1,
          title: job.title,
          company: job.company,
          status: 'ok'
        });
        if (cfg.greeting && String(cfg.greeting).trim()) {
          await sleep(600);
          const g = await adapter.sendGreeting(job, cfg.greeting);
          if (g === 'ok') {
            logger.emit('greet', { status: 'ok', title: job.title });
          } else {
            logger.emit('greet', {
              status: 'default',
              title: job.title,
              note: '未发脚本招呼语（列表无输入框或平台不支持）'
            });
          }
        }
      } else if (r === 'skip') {
        acc.skip += 1;
        dedupe.mark(job.id);
        logger.emit('apply', {
          index: index + 1,
          title: job.title,
          company: job.company,
          status: 'skip'
        });
      } else {
        acc.fail += 1;
        logger.emit('apply', {
          index: index + 1,
          title: job.title,
          company: job.company,
          status: 'fail'
        });
      }

      logger.emit('progress', {
        done: acc.ok + acc.skip + acc.fail,
        total: pending.length,
        page: pageNum,
        ok: acc.ok,
        fail: acc.fail
      });
      const qq = store.getQuota();
      logger.emit('quota', { count: qq.count, limit: cfg.dailyLimit });
    });

    await scheduler.run(tasks);
    acc.skip += skippedApplied;

    if (quotaStopped || scheduler.state() === 'stopped') {
      return { canPage: false, quotaStopped: true };
    }
    // 暂停中：不翻页，等 resume 后由用户再点开始会 resume 当前页剩余；本页 run 已结束
    if (scheduler.state() === 'paused') {
      return { canPage: false, quotaStopped: false };
    }
    return { canPage: true, quotaStopped: false };
  }

  async function start() {
    if (running && scheduler.state() === 'paused') {
      scheduler.resume();
      return;
    }
    if (running) return;

    // 调度器若卡在 stopped/idle 残留，先复位，避免第二次「开始」无响应
    if (scheduler.state() === 'stopped') {
      scheduler.reset?.();
    }

    running = true;
    const cfg = store.getConfig();
    const maxPages = Math.max(1, Number(cfg.maxPages) || 1);
    const autoPage = Boolean(cfg.autoPage);
    const acc = { ok: 0, skip: 0, fail: 0 };
    let finishedNote = '';

    try {
      let page = 1;
      for (;;) {
        const { canPage, quotaStopped } = await runOnePage(page, cfg, acc);
        if (quotaStopped) {
          finishedNote = '配额用尽';
          break;
        }
        if (!autoPage || !canPage) break;
        if (page >= maxPages) {
          finishedNote = `已到设定最大页数 ${maxPages}`;
          break;
        }
        if (typeof adapter.nextPage !== 'function') break;

        logger.emit('scan', { note: `尝试翻到第 ${page + 1} 页…` });
        const flipped = await adapter.nextPage();
        if (!flipped) {
          finishedNote = '没有下一页或翻页失败';
          break;
        }
        page += 1;
        await sleep(800 + Math.floor(Math.random() * 600));
        if (scheduler.state() === 'stopped') {
          finishedNote = '已停止';
          break;
        }
      }

      if (scheduler.state() === 'paused') {
        // 保持 running=true，便于点「开始」resume
        return;
      }

      running = false;
      if (typeof adapter.id === 'function' && adapter.id() === 'boss') {
        logger.emit('error', {
          where: 'pipeline',
          msg: '投递结束。深聊/自动回复请打开 https://www.zhipin.com/web/geek/chat（功能仅在 chat 页生效）'
        });
      }
      logger.emit('done', {
        ok: acc.ok,
        skip: acc.skip,
        fail: acc.fail,
        ...(finishedNote ? { note: finishedNote } : {})
      });
    } catch (e) {
      running = false;
      logger.emit('error', { where: 'pipeline', msg: e.message || String(e) });
      logger.emit('done', { ok: acc.ok, skip: acc.skip, fail: acc.fail });
    } finally {
      // 非暂停态务必解锁，否则下次「开始」会被 running 挡住
      if (scheduler.state() !== 'paused' && scheduler.state() !== 'running') {
        running = false;
      }
    }
  }

  return {
    start,
    pause: () => scheduler.pause(),
    resume: () => scheduler.resume(),
    stop: () => {
      scheduler.stop();
      running = false;
    },
    isRunning: () => running
  };
}
