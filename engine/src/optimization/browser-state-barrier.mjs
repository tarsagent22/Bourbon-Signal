import { runBoundedPool } from './worker-pool.mjs';

// Browser-bound state collectors share the normal state pool but remain parked
// until their own source artifact has been independently validated.
export function runStatePoolWithBrowserBarriers(tasks, worker, {
  concurrency = 4,
  perDomain = 1,
  timeoutMs = 18_000,
  domainFor,
  barriers = new Map(),
} = {}) {
  const ready = new Set();
  return runBoundedPool(tasks, worker, {
    concurrency, perDomain, timeoutMs, domainFor: domainFor || (task => task.id),
    isReady: task => !barriers.has(task.id) || ready.has(task.id),
    waitForReady: async task => {
      const barrier = barriers.get(task.id);
      if (!barrier) return;
      await barrier;
      ready.add(task.id);
    },
  });
}
