import { runBoundedPool } from '../optimization/worker-pool.mjs';
import { decideSourceSchedule } from '../optimization/source-scheduler.mjs';
import { validateSourceValue } from './source-adapter.mjs';
import { SourceCircuitBreaker } from './circuit-breaker.mjs';
import {
  CircuitOpenSourceError,
  CollapsedSourceError,
  SourceTimeoutError,
  normalizeSourceError,
} from './source-error.mjs';
import {
  createSourceFailureResult,
  createSourceSkippedResult,
  createSourceSuccessResult,
} from './source-result.mjs';

function previousMap(value) {
  if (value instanceof Map) return value;
  if (Array.isArray(value)) return new Map(value.map((entry) => [entry.sourceId, entry]));
  return new Map(Object.entries(value || {}));
}

function quarantineSet(value, env = process.env) {
  const configured = new Set(String(env.BOURBON_SIGNAL_QUARANTINED_SOURCES || '').split(',').map((item) => item.trim()).filter(Boolean));
  for (const item of value || []) configured.add(String(item));
  return configured;
}

function nowIso(now) {
  const value = now();
  return typeof value === 'string' ? value : new Date(value).toISOString();
}

function collapseError(adapter, previous, value) {
  if (!previous?.lastGoodAt || previous.value == null) return null;
  const baseline = adapter.recordCount(previous.value);
  const current = adapter.recordCount(value);
  if (!Number.isFinite(baseline) || !Number.isFinite(current) || baseline < adapter.collapse.minBaseline) return null;
  const floor = Math.ceil(baseline * adapter.collapse.minRatio);
  if (current >= floor) return null;
  return new CollapsedSourceError(`Source ${adapter.id} record count collapsed from ${baseline} to ${current}`, {
    details: { sourceId: adapter.id, previousRecordCount: baseline, candidateRecordCount: current, minimumRecordCount: floor },
  });
}

async function executeWithTimeout(adapter, context, workerSignal, attempt, timeoutMs) {
  const controller = new AbortController();
  const forwardAbort = () => controller.abort(workerSignal.reason);
  if (workerSignal?.aborted) forwardAbort();
  else workerSignal?.addEventListener('abort', forwardAbort, { once: true });
  let timer;
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new SourceTimeoutError(adapter.id, timeoutMs);
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });
    return await Promise.race([
      Promise.resolve().then(() => adapter.execute(context, { signal: controller.signal, attempt, source: adapter })),
      timeout,
    ]);
  } finally {
    clearTimeout(timer);
    workerSignal?.removeEventListener('abort', forwardAbort);
  }
}

function schedulingDecision(adapter, options, now) {
  const metrics = { sourceId: adapter.id, ...(adapter.scheduleMetrics || {}), ...(options.sourceMetrics?.[adapter.id] || {}) };
  return decideSourceSchedule(metrics, {
    now,
    baseCadenceMs: options.baseCadenceMs,
    minCadenceMs: options.minCadenceMs,
    maxCadenceMs: options.maxCadenceMs,
  });
}

export async function runSourceAdapters(adapters, context = {}, options = {}) {
  const list = [...(adapters || [])];
  const ids = new Set();
  for (const adapter of list) {
    if (adapter?.contractVersion !== 'bourbon-signal-source-adapter-v1') throw new TypeError('runSourceAdapters requires standardized source adapters');
    if (ids.has(adapter.id)) throw new TypeError(`Duplicate source adapter id: ${adapter.id}`);
    ids.add(adapter.id);
  }
  if (!list.length) return { results: [], circuitState: {}, schedules: [] };

  const now = options.now || (() => new Date().toISOString());
  const sleep = options.sleep || ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const prior = previousMap(options.previousResults);
  const quarantined = quarantineSet(options.quarantinedSourceIds, options.env);
  const circuitBreaker = options.circuitBreaker || new SourceCircuitBreaker(options.circuitBreakerOptions);
  const maxAttempts = Math.max(1, Math.floor(Number(options.maxAttempts ?? 2)));
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? 18_000));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 250));
  const scheduledAt = nowIso(now);
  const schedules = list.map((adapter) => options.schedule === false
    ? { sourceId: adapter.id, decision: 'scheduler_disabled' }
    : schedulingDecision(adapter, options, scheduledAt));
  const tasks = list.map((adapter, index) => ({ adapter, index, schedule: schedules[index], id: adapter.id, domain: adapter.domain }));

  const poolResults = await runBoundedPool(tasks, async (task, { signal }) => {
    const { adapter, schedule } = task;
    const previous = prior.get(adapter.id) || null;
    const sourceQuarantined = quarantined.has(adapter.id);
    if (schedule.decision === 'disabled') {
      return createSourceSkippedResult({ adapter, previous, status: 'disabled', now: nowIso(now), schedule, quarantined: sourceQuarantined });
    }
    if (schedule.decision === 'wait' && previous?.value != null) {
      return createSourceSkippedResult({ adapter, previous, status: 'not_due', now: nowIso(now), schedule, quarantined: sourceQuarantined });
    }
    if (schedule.decision === 'wait') schedule.decision = 'probe_now_missing_previous';
    const circuit = circuitBreaker.canExecute(adapter.id);
    if (!circuit.allowed) {
      const error = new CircuitOpenSourceError(adapter.id, { details: circuit });
      return createSourceSkippedResult({ adapter, previous, status: 'circuit_open', now: nowIso(now), schedule, error, quarantined: sourceQuarantined });
    }

    const startedAt = nowIso(now);
    let attemptCount = 0;
    let lastError = null;
    while (attemptCount < maxAttempts) {
      attemptCount += 1;
      try {
        const candidate = validateSourceValue(adapter, await executeWithTimeout(adapter, context, signal, attemptCount, timeoutMs));
        const collapsed = collapseError(adapter, previous, candidate);
        if (collapsed) throw collapsed;
        circuitBreaker.recordSuccess(adapter.id);
        return createSourceSuccessResult({
          adapter,
          value: candidate,
          startedAt,
          finishedAt: nowIso(now),
          attemptCount,
          quarantined: sourceQuarantined,
          schedule,
        });
      } catch (error) {
        lastError = normalizeSourceError(error);
        if (!lastError.transient || attemptCount >= maxAttempts) break;
        await sleep(retryDelayMs * attemptCount);
      }
    }
    circuitBreaker.recordFailure(adapter.id, lastError);
    return createSourceFailureResult({
      adapter,
      error: lastError,
      previous,
      startedAt,
      finishedAt: nowIso(now),
      attemptCount,
      schedule,
      quarantined: sourceQuarantined,
    });
  }, {
    concurrency: Math.max(1, Math.floor(Number(options.concurrency ?? 4))),
    perDomain: Math.max(1, Math.floor(Number(options.perDomain ?? 1))),
    timeoutMs: timeoutMs * maxAttempts + retryDelayMs * maxAttempts + 1_000,
    domainFor: (task) => task.domain,
  });

  const results = poolResults.map((settled, index) => {
    if (settled.status === 'fulfilled') return settled.value;
    const adapter = list[index];
    const error = normalizeSourceError(settled.reason);
    circuitBreaker.recordFailure(adapter.id, error);
    return createSourceFailureResult({
      adapter,
      error,
      previous: prior.get(adapter.id) || null,
      startedAt: scheduledAt,
      finishedAt: nowIso(now),
      attemptCount: maxAttempts,
      schedule: schedules[index],
      quarantined: quarantined.has(adapter.id),
    });
  });
  return { results, circuitState: circuitBreaker.snapshot(), schedules };
}
