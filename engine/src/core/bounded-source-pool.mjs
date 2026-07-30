function abortError(signal) {
  return signal?.reason instanceof Error ? signal.reason : new Error('Source collection aborted.');
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError(signal);
}

function groupByDomain(lanes) {
  const groups = new Map();
  lanes.forEach((lane, index) => {
    const domain = String(lane.domain || '').trim().toLowerCase();
    if (!domain) throw new Error(`Source lane ${lane.name || index} requires a domain isolation key.`);
    if (!groups.has(domain)) groups.set(domain, []);
    groups.get(domain).push({ ...lane, index, domain });
  });
  return [...groups.values()];
}

export async function runBoundedSourceLanes(lanes, { concurrency = 3, signal } = {}) {
  if (!Array.isArray(lanes) || lanes.some((lane) => !lane?.name || typeof lane.run !== 'function')) {
    throw new TypeError('Source lanes require name, domain, and run().');
  }
  if (!lanes.length) return { results: [], timings: [], concurrency: 0 };
  const groups = groupByDomain(lanes);
  const limit = Math.max(1, Math.min(3, Number(concurrency) || 1));
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(signal.reason);
  if (signal?.aborted) forwardAbort();
  else signal?.addEventListener('abort', forwardAbort, { once: true });
  const results = new Array(lanes.length);
  const timings = new Array(lanes.length);
  let cursor = 0;
  let firstError = null;

  async function worker() {
    while (true) {
      throwIfAborted(controller.signal);
      const groupIndex = cursor;
      cursor += 1;
      if (groupIndex >= groups.length) return;
      for (const lane of groups[groupIndex]) {
        throwIfAborted(controller.signal);
        const startedAt = new Date().toISOString();
        const startedMs = Date.now();
        try {
          const value = await lane.run({ signal: controller.signal });
          throwIfAborted(controller.signal);
          results[lane.index] = { name: lane.name, domain: lane.domain, value };
          timings[lane.index] = {
            name: lane.name,
            domain: lane.domain,
            startedAt,
            endedAt: new Date().toISOString(),
            durationMs: Date.now() - startedMs,
            outcome: 'passed',
            signalCount: Array.isArray(value?.signals) ? value.signals.length : 0,
            roadblockCount: Array.isArray(value?.roadblocks) ? value.roadblocks.length : 0,
          };
        } catch (error) {
          const wasAborted = controller.signal.aborted;
          if (!firstError) firstError = error instanceof Error ? error : new Error(String(error));
          if (!controller.signal.aborted) controller.abort(firstError);
          timings[lane.index] = {
            name: lane.name,
            domain: lane.domain,
            startedAt,
            endedAt: new Date().toISOString(),
            durationMs: Date.now() - startedMs,
            outcome: wasAborted ? 'aborted' : 'failed',
            error: error instanceof Error ? error.message : String(error),
          };
          throw error;
        }
      }
    }
  }

  try {
    await Promise.allSettled(Array.from({ length: Math.min(limit, groups.length) }, () => worker()));
  } finally {
    signal?.removeEventListener('abort', forwardAbort);
  }
  if (firstError) throw firstError;
  throwIfAborted(controller.signal);
  return { results, timings, concurrency: limit };
}
