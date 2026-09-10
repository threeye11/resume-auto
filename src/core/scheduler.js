function rand(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

/**
 * @param {object} opts
 * @param {() => number} [opts.delayMs]
 * @param {(err: Error, index: number) => void} [opts.onError]
 * @param {number} [opts.failStreakLimit]
 */
export function createScheduler({
  delayMs = () => rand(800, 2000),
  onError = () => {},
  failStreakLimit = 5
} = {}) {
  let status = 'idle'; // idle | running | paused | stopped
  let failStreak = 0;
  let pausedResolve = null;
  let stopFlag = false;

  function state() { return status; }
  function pause() { if (status === 'running') status = 'paused'; }
  function resume() {
    if (status === 'paused') {
      status = 'running';
      if (pausedResolve) { pausedResolve(); pausedResolve = null; }
    }
  }
  function stop() {
    stopFlag = true;
    status = 'stopped';
    if (pausedResolve) { pausedResolve(); pausedResolve = null; }
  }
  function reset() {
    stopFlag = false;
    failStreak = 0;
    if (status !== 'running') status = 'idle';
  }

  async function waitIfPaused() {
    while (status === 'paused' && !stopFlag) {
      await new Promise((r) => { pausedResolve = r; });
    }
  }

  async function run(jobs) {
    status = 'running';
    stopFlag = false;
    failStreak = 0;
    const results = [];
    for (let i = 0; i < jobs.length; i++) {
      if (stopFlag) break;
      await waitIfPaused();
      if (stopFlag) break;
      const d = delayMs();
      if (d > 0) await sleep(d);
      await waitIfPaused();
      if (stopFlag) break;
      try {
        const r = await jobs[i](i);
        results.push({ index: i, ok: true, result: r });
        failStreak = 0;
      } catch (e) {
        results.push({ index: i, ok: false, error: e });
        failStreak += 1;
        onError(e, i);
        if (failStreak >= failStreakLimit) {
          status = 'paused';
          break;
        }
      }
    }
    if (status === 'running') status = 'idle';
    if (status === 'stopped') status = 'idle';
    return results;
  }

  return { run, pause, resume, stop, reset, state };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
