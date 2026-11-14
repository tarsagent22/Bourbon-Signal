export class WorkerTimeoutError extends Error {
  constructor(task, timeoutMs) {
    super(`Worker task ${task?.id || task?.url || '[unnamed]'} exceeded ${timeoutMs}ms`);
    this.name = 'WorkerTimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

export async function runBoundedPool(tasks, worker, options = {}) {
  const concurrency = Math.max(1, Math.floor(options.concurrency ?? 4));
  const perDomain = Math.max(1, Math.floor(options.perDomain ?? concurrency));
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? 18_000));
  const domainFor = options.domainFor || ((task) => task.domain || (task.url ? new URL(task.url).hostname : 'default'));
  const isReady = options.isReady || (() => true);
  const waitForReady = options.waitForReady || null;
  if (options.isReady && !waitForReady) throw new Error('A worker readiness predicate requires a waitForReady callback.');
  const pending = tasks.map((task, index) => ({ task, index, domain: domainFor(task) }));
  const results = new Array(tasks.length);
  const domainActive = new Map();
  const readiness = new Map();
  let active = 0;

  return new Promise((resolve) => {
    function waitForPendingReadiness() {
      if (!waitForReady) return;
      for (const item of pending) {
        if (isReady(item.task) || readiness.has(item.index)) continue;
        readiness.set(item.index, { status: 'waiting' });
        Promise.resolve().then(() => waitForReady(item.task)).then(
          () => readiness.set(item.index, { status: 'ready' }),
          (reason) => readiness.set(item.index, { status: 'failed', reason }),
        ).finally(schedule);
      }
    }

    const schedule = () => {
      waitForPendingReadiness();
      while (active < concurrency && pending.length) {
        const eligibleIndex = pending.findIndex((item) => {
          const gate = readiness.get(item.index);
          return (domainActive.get(item.domain) || 0) < perDomain
            && (isReady(item.task) || gate?.status === 'ready' || gate?.status === 'failed');
        });
        if (eligibleIndex < 0) break;
        const [{ task, index, domain }] = pending.splice(eligibleIndex, 1);
        const gate = readiness.get(index);
        if (gate?.status === 'failed') {
          const at = new Date().toISOString();
          results[index] = { status: 'rejected', reason: gate.reason, task, startedAt: at, finishedAt: at };
          continue;
        }
        const startedAt = new Date().toISOString();
        active += 1;
        domainActive.set(domain, (domainActive.get(domain) || 0) + 1);
        const controller = new AbortController();
        let timer;
        const timeout = new Promise((_, reject) => {
          timer = setTimeout(() => {
            controller.abort();
            reject(new WorkerTimeoutError(task, timeoutMs));
          }, timeoutMs);
        });
        Promise.race([Promise.resolve().then(() => worker(task, { signal: controller.signal, index })), timeout])
          .then((value) => { results[index] = { status: 'fulfilled', value, task, startedAt, finishedAt: new Date().toISOString() }; })
          .catch((reason) => { results[index] = { status: 'rejected', reason, task, startedAt, finishedAt: new Date().toISOString() }; })
          .finally(() => {
            clearTimeout(timer);
            active -= 1;
            domainActive.set(domain, (domainActive.get(domain) || 1) - 1);
            if (!pending.length && active === 0) resolve(results);
            else schedule();
          });
      }
      if (!pending.length && active === 0) resolve(results);
    };
    schedule();
  });
}
