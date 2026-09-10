export function checkQuota(store, limit) {
  const q = store.getQuota();
  const lim = Number(limit) || 0;
  return {
    canApply: q.count < lim,
    count: q.count,
    limit: lim,
    date: q.date
  };
}

export function consumeQuota(store, n = 1) {
  return store.addQuota(n);
}
