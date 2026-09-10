export function createDedupe(store, { isApplied = () => false } = {}) {
  function shouldSkip(jobId) {
    if (store.hasApplied(jobId)) return true;
    if (isApplied(jobId)) {
      store.markApplied(jobId);
      return true;
    }
    return false;
  }
  function mark(jobId) {
    store.markApplied(jobId);
  }
  return { shouldSkip, mark };
}
