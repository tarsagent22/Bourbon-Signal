import { runBoundedPool } from '../optimization/worker-pool.mjs';
import { decideSourceSchedule } from '../optimization/source-scheduler.mjs';
import { validateSourceValue } from './source-adapter.mjs';
import { SourceCircuitBreaker } from './circuit-breaker.mjs';
import { SourceCheckpointStore, checkpointPrevious, checkpointMetrics } from './source-checkpoint.mjs';
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
  statusForSourceError,
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
  const comparison = { previous: previous.value, candidate: value };
  const baseline = adapter.recordCount(previous.value, comparison);
  const current = adapter.recordCount(value, comparison);
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
  let settled = false;
  const execution = Promise.resolve().then(() => {
    controller.signal.throwIfAborted();
    return adapter.execute(context, { signal: controller.signal, attempt, source: adapter });
  }).finally(() => { settled = true; });
  try {
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => {
        const error = new SourceTimeoutError(adapter.id, timeoutMs);
        controller.abort(error);
        reject(error);
      }, timeoutMs);
    });
    return await Promise.race([
      execution,
      timeout,
    ]);
  } catch (error) {
    if (controller.signal.aborted) {
      // Allow cooperative abort handlers to settle, but never wait indefinitely
      // for a transport/parser that ignores cancellation.
      let graceTimer;
      await Promise.race([execution.catch(() => {}), new Promise((resolve) => { graceTimer = setTimeout(resolve, 0); })]);
      clearTimeout(graceTimer);
      error.executionTerminated = settled;
    }
    throw error;
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
  const prior = new Map(previousMap(options.previousResults));
  const quarantined = quarantineSet(options.quarantinedSourceIds, options.env);
  const checkpointErrors = [];
  const checkpointDirectory = options.checkpointDirectory ?? (options.env || process.env).BOURBON_SIGNAL_SOURCE_CHECKPOINT_DIRECTORY;
  let checkpoints = null;
  const restoredCircuits = {};
  if (checkpointDirectory) {
    try { checkpoints = new SourceCheckpointStore(checkpointDirectory); }
    catch { checkpointErrors.push({ code: 'checkpoint_directory_invalid' }); }
  }
  if (checkpoints) {
    // Clone option maps: checkpoint recovery must not mutate caller-owned policy.
    options = { ...options, sourceMetrics: { ...options.sourceMetrics } };
    for (const adapter of list) {
      try {
        const saved = await checkpoints.read(adapter);
        const previous = prior.get(adapter.id);
        if (!saved || (previous && Date.parse(previous.checkedAt) >= Date.parse(saved.result.checkedAt))) continue;
        prior.set(adapter.id, checkpointPrevious(saved, nowIso(now)));
        const metrics = options.sourceMetrics[adapter.id] || {};
        options.sourceMetrics[adapter.id] = Date.parse(metrics.lastProbeAt) > Date.parse(saved.result.checkedAt)
          ? metrics : { ...metrics, ...checkpointMetrics(saved.result, saved.circuit) };
        restoredCircuits[adapter.id] = saved.circuit;
      } catch (error) { checkpointErrors.push({ sourceId: adapter.id, code: error.code }); }
    }
  }
  const circuitBreaker = options.circuitBreaker || new SourceCircuitBreaker(options.circuitBreakerOptions);
  const maxAttempts = Math.max(1, Math.floor(Number(options.maxAttempts ?? 2)));
  const timeoutMs = Math.max(1, Number(options.timeoutMs ?? 18_000));
  const retryDelayMs = Math.max(0, Number(options.retryDelayMs ?? 250));
  const scheduledAt = nowIso(now);
  const schedules = list.map((adapter) => options.schedule === false
    ? { sourceId: adapter.id, decision: 'scheduler_disabled' }
    : schedulingDecision(adapter, options, scheduledAt));
  const tasks = list.map((adapter, index) => ({ adapter, index, schedule: schedules[index], id: adapter.id, domain: adapter.domain }));
  const poolTaskTimeoutMs = Math.max(...list.map((adapter) => {
    const attempts = adapter.maxAttempts ?? maxAttempts;
    const attemptTimeoutMs = adapter.timeoutMs ?? timeoutMs;
    return attemptTimeoutMs * attempts + retryDelayMs * attempts + 1_000;
  }));

  const executeTask = async (task, { signal }) => {
    const { adapter, schedule } = task;
    // A caller-owned breaker remains authoritative. A restored breaker is used
    // only for this source when its durable attempt is newer than the caller's.
    const sourceCircuit = restoredCircuits[adapter.id]
      ? circuitBreaker.withCheckpoint(adapter.id, restoredCircuits[adapter.id])
      : circuitBreaker;
    const previous = prior.get(adapter.id) || null;
    const sourceQuarantined = quarantined.has(adapter.id);
    if (schedule.decision === 'disabled') {
      return createSourceSkippedResult({ adapter, previous, status: 'disabled', now: nowIso(now), schedule, quarantined: sourceQuarantined });
    }
    if (schedule.decision === 'wait' && previous?.value != null) {
      return createSourceSkippedResult({ adapter, previous, status: 'not_due', now: nowIso(now), schedule, quarantined: sourceQuarantined });
    }
    if (schedule.decision === 'wait') schedule.decision = 'probe_now_missing_previous';
    let circuit = sourceCircuit.canExecute(adapter.id);
    if (circuit.allowed && sourceCircuit !== circuitBreaker) {
      circuit = circuitBreaker.canExecute(adapter.id);
      if (!circuit.allowed) restoredCircuits[adapter.id] = circuitBreaker.snapshot(adapter.id);
    }
    if (!circuit.allowed) {
      const error = new CircuitOpenSourceError(adapter.id, { details: circuit });
      return createSourceSkippedResult({ adapter, previous, status: 'circuit_open', now: nowIso(now), schedule, error, quarantined: sourceQuarantined });
    }

    const startedAt = nowIso(now);
    const adapterTimeoutMs = adapter.timeoutMs ?? timeoutMs;
    const adapterMaxAttempts = adapter.maxAttempts ?? maxAttempts;
    let attemptCount = 0;
    let lastError = null;
    const attempts = [];
    while (attemptCount < adapterMaxAttempts) {
      attemptCount += 1;
      const attemptStartedAt = nowIso(now);
      try {
        const candidate = validateSourceValue(adapter, await executeWithTimeout(adapter, context, signal, attemptCount, adapterTimeoutMs));
        const collapsed = collapseError(adapter, previous, candidate);
        if (collapsed) throw collapsed;
        const attemptFinishedAt = nowIso(now);
        attempts.push({
          attempt: attemptCount,
          startedAt: attemptStartedAt,
          finishedAt: attemptFinishedAt,
          outcome: 'success',
          error: null,
        });
        sourceCircuit.recordSuccess(adapter.id);
        if (sourceCircuit !== circuitBreaker) circuitBreaker.recordSuccess(adapter.id);
        restoredCircuits[adapter.id] = sourceCircuit.snapshot(adapter.id);
        return createSourceSuccessResult({
          adapter,
          value: candidate,
          startedAt,
          finishedAt: attemptFinishedAt,
          attemptCount,
          attempts,
          quarantined: sourceQuarantined,
          schedule,
        });
      } catch (error) {
        lastError = normalizeSourceError(error);
        attempts.push({
          attempt: attemptCount,
          startedAt: attemptStartedAt,
          finishedAt: nowIso(now),
          outcome: statusForSourceError(lastError),
          error: {
            kind: lastError.kind,
            code: lastError.code,
            message: lastError.message,
          },
        });
        // A timed-out promise may still be running. Never overlap it with a retry.
        if ((lastError.kind === 'timeout' && error.executionTerminated !== true) || signal.aborted || !lastError.transient || attemptCount >= adapterMaxAttempts) break;
        await sleep(retryDelayMs * attemptCount);
      }
    }
    sourceCircuit.recordFailure(adapter.id, lastError);
    if (sourceCircuit !== circuitBreaker) circuitBreaker.recordFailure(adapter.id, lastError);
    restoredCircuits[adapter.id] = sourceCircuit.snapshot(adapter.id);
    return createSourceFailureResult({
      adapter,
      error: lastError,
      previous,
      startedAt,
      finishedAt: nowIso(now),
      attemptCount,
      attempts,
      schedule,
      quarantined: sourceQuarantined,
    });
  };
  const poolResults = await runBoundedPool(tasks, async (task, worker) => {
    const result = await executeTask(task, worker);
    // Outside the collection retry loop: storage failure never reruns a fetch.
    // Commit here rather than after Promise.all so healthy siblings are durable.
    if (checkpoints && result.attemptCount > 0) {
      try { await checkpoints.write(task.adapter, result, restoredCircuits[task.adapter.id] || circuitBreaker.snapshot(task.adapter.id)); }
      catch (error) {
        result.checkpointError = error.code;
        if (!checkpointErrors.some(entry => entry.sourceId === task.adapter.id && entry.code === error.code)) {
          checkpointErrors.push({ sourceId: task.adapter.id, code: error.code });
        }
      }
    }
    return result;
  }, {
    concurrency: Math.max(1, Math.floor(Number(options.concurrency ?? 4))),
    perDomain: Math.max(1, Math.floor(Number(options.perDomain ?? 1))),
    timeoutMs: poolTaskTimeoutMs,
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
  return { results, circuitState: { ...circuitBreaker.snapshot(), ...restoredCircuits }, schedules, checkpointErrors };
}
