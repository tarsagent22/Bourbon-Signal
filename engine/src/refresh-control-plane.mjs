import { createHash, randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

export const REFRESH_CONTROL_PLANE_VERSION = 'bourbon-signal-refresh-control-v1';

function canonical(value) {
  if (Array.isArray(value)) return value.map((entry) => canonical(entry));
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  }
  return value;
}

function fingerprint(value) {
  return createHash('sha256').update(JSON.stringify(canonical(value))).digest('hex');
}

function isoAt(value) {
  const millis = typeof value === 'number' ? value : Date.parse(value || '');
  if (!Number.isFinite(millis)) throw new Error(`Invalid time value: ${value}`);
  return new Date(millis).toISOString();
}

function millisAt(value) {
  const millis = Date.parse(value || '');
  return Number.isFinite(millis) ? millis : null;
}

async function readJson(file, fallback = null) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}

async function atomicWriteJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  const temporary = `${file}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile(temporary, JSON.stringify(value, null, 2));
  await rename(temporary, file);
}

const CONTROL_MUTEX_STALE_MS = 2 * 60_000;
const CONTROL_MUTEX_ATTEMPTS = 200;
const CONTROL_MUTEX_WAIT_MS = 25;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withControlMutex(statePath, action) {
  const resolvedStatePath = path.resolve(statePath);
  const mutexPath = `${resolvedStatePath}.mutex`;
  await mkdir(path.dirname(resolvedStatePath), { recursive: true });
  let acquired = false;
  for (let attempt = 0; attempt < CONTROL_MUTEX_ATTEMPTS; attempt += 1) {
    try {
      await mkdir(mutexPath);
      acquired = true;
      break;
    } catch (error) {
      if (error?.code !== 'EEXIST') throw error;
      try {
        const metadata = await stat(mutexPath);
        if (Date.now() - metadata.mtimeMs > CONTROL_MUTEX_STALE_MS) {
          await rm(mutexPath, { recursive: true, force: true });
          continue;
        }
      } catch (statError) {
        if (statError?.code !== 'ENOENT') throw statError;
      }
      await sleep(CONTROL_MUTEX_WAIT_MS);
    }
  }
  if (!acquired) throw new Error(`Timed out acquiring refresh control-plane mutex: ${mutexPath}`);
  try {
    return await action(resolvedStatePath);
  } finally {
    await rm(mutexPath, { recursive: true, force: true });
  }
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

function sessionPlan(scope, stages) {
  const normalizedStages = [...new Set((stages || []).map((stage) => String(stage || '').trim()).filter(Boolean))];
  if (!normalizedStages.length) throw new Error('Refresh control plane requires at least one stage.');
  return {
    scope: canonical(scope || {}),
    stages: normalizedStages,
  };
}

function buildSessionPayload(existing, { scope, stages, now, pid, leaseMs }) {
  const plan = sessionPlan(scope, stages);
  const planFingerprint = fingerprint(plan);
  const existingPlanFingerprint = String(existing?.planFingerprint || '');
  const resumable = existing?.contractVersion === REFRESH_CONTROL_PLANE_VERSION
    && existingPlanFingerprint === planFingerprint
    && Array.isArray(existing.completedStages)
    && existing.status !== 'succeeded';
  const nowIso = isoAt(now);
  const nowMs = Date.parse(nowIso);
  const leaseId = randomUUID();
  return {
    contractVersion: REFRESH_CONTROL_PLANE_VERSION,
    runId: resumable && existing.runId ? existing.runId : randomUUID(),
    planFingerprint,
    scope: plan.scope,
    stages: plan.stages,
    startedAt: resumable && existing.startedAt ? existing.startedAt : nowIso,
    resumedAt: resumable ? nowIso : null,
    attempts: resumable ? Math.max(1, Number(existing.attempts || 0)) + 1 : 1,
    status: 'running',
    completedStages: resumable ? [...new Set(existing.completedStages)] : [],
    stageResults: resumable && existing.stageResults && typeof existing.stageResults === 'object' ? existing.stageResults : {},
    failedStage: resumable ? existing.failedStage || null : null,
    failedAt: resumable ? existing.failedAt || null : null,
    error: resumable ? existing.error || null : null,
    lease: {
      leaseId,
      pid,
      heartbeatAt: nowIso,
      expiresAt: new Date(nowMs + leaseMs).toISOString(),
      recoveredFromLeaseId: resumable ? existing?.lease?.leaseId || null : null,
    },
  };
}

function sessionMayResume(existing, { scope, stages, now, ownerAlive = pidAlive } = {}) {
  const plan = sessionPlan(scope, stages);
  if (existing?.contractVersion !== REFRESH_CONTROL_PLANE_VERSION) return { resumable: false, active: false, reason: 'no_valid_existing_session' };

  const expiresAtMs = millisAt(existing?.lease?.expiresAt);
  const nowMs = typeof now === 'number' ? now : Date.parse(now || '');
  const activeOwner = ownerAlive(Number(existing?.lease?.pid)) === true;
  const leaseFresh = Number.isFinite(expiresAtMs) && Number.isFinite(nowMs) && expiresAtMs > nowMs;
  if (!activeOwner && String(existing.planFingerprint || '') !== fingerprint(plan)) return { resumable: false, active: false, reason: 'plan_changed' };
  return {
    resumable: !activeOwner,
    active: activeOwner,
    reason: activeOwner
      ? (leaseFresh ? 'active_owner' : 'active_owner_lease_expired')
      : 'owner_dead',
  };
}

export async function acquireRefreshControlPlane({
  statePath,
  scope = {},
  stages = [],
  now = new Date().toISOString(),
  pid = process.pid,
  leaseMs = 20 * 60_000,
  ownerAlive = pidAlive,
} = {}) {
  if (!statePath) throw new Error('Refresh control plane statePath is required.');
  return withControlMutex(statePath, async (resolvedStatePath) => {
    const existing = await readJson(resolvedStatePath, null);
    const existingState = sessionMayResume(existing, { scope, stages, now, ownerAlive });
    if (existingState.active) {
      return { acquired: false, resumed: false, reason: existingState.reason, session: existing };
    }
    const session = buildSessionPayload(existingState.resumable ? existing : null, { scope, stages, now, pid, leaseMs });
    await atomicWriteJson(resolvedStatePath, session);
    return { acquired: true, resumed: existingState.resumable, reason: existingState.reason, session };
  });
}

async function readCurrentSession(statePath) {
  const current = await readJson(path.resolve(statePath), null);
  if (!current?.lease?.leaseId) throw new Error(`Refresh control plane session is missing: ${statePath}`);
  return current;
}

async function writeLeasedSession(statePath, leaseId, mutate) {
  return withControlMutex(statePath, async (resolvedStatePath) => {
    const current = await readCurrentSession(resolvedStatePath);
    if (current.lease.leaseId !== leaseId) {
      throw new Error(`Refresh control plane lease ${leaseId} was fenced by ${current.lease.leaseId}.`);
    }
    const next = mutate(structuredClone(current));
    await atomicWriteJson(resolvedStatePath, next);
    return next;
  });
}

export async function renewRefreshControlLease({
  statePath,
  leaseId,
  now = new Date().toISOString(),
  leaseMs = 20 * 60_000,
} = {}) {
  return writeLeasedSession(statePath, leaseId, (current) => {
    const nowIso = isoAt(now);
    current.lease.heartbeatAt = nowIso;
    current.lease.expiresAt = new Date(Date.parse(nowIso) + leaseMs).toISOString();
    return current;
  });
}

export async function checkpointRefreshStage({
  statePath,
  leaseId,
  stage,
  status,
  now = new Date().toISOString(),
  details = null,
} = {}) {
  if (!stage) throw new Error('Refresh control plane stage is required.');
  if (!['running', 'completed', 'failed', 'skipped'].includes(status)) {
    throw new Error(`Unsupported refresh control plane stage status: ${status}`);
  }
  return writeLeasedSession(statePath, leaseId, (current) => {
    const nowIso = isoAt(now);
    const record = {
      ...(current.stageResults?.[stage] || {}),
      stage,
      status,
      updatedAt: nowIso,
      ...(status === 'running' && !current.stageResults?.[stage]?.startedAt ? { startedAt: nowIso } : {}),
      ...(details ? { details } : {}),
    };
    if (status === 'completed' || status === 'skipped') {
      record.finishedAt = nowIso;
      current.completedStages = [...new Set([...(current.completedStages || []), stage])];
      if (current.failedStage === stage) {
        current.failedStage = null;
        current.failedAt = null;
        current.error = null;
      }
    }
    if (status === 'failed') {
      record.finishedAt = nowIso;
      current.failedStage = stage;
      current.failedAt = nowIso;
      current.error = details?.error || current.error || `Stage ${stage} failed.`;
    }
    current.stageResults = { ...(current.stageResults || {}), [stage]: record };
    current.lease.heartbeatAt = nowIso;
    return current;
  });
}

export async function finishRefreshControlPlane({
  statePath,
  leaseId,
  status = 'succeeded',
  now = new Date().toISOString(),
  details = null,
} = {}) {
  if (!['succeeded', 'failed'].includes(status)) throw new Error(`Unsupported refresh control plane status: ${status}`);
  return writeLeasedSession(statePath, leaseId, (current) => {
    const nowIso = isoAt(now);
    current.status = status;
    current.finishedAt = nowIso;
    current.lease.heartbeatAt = nowIso;
    current.lease.expiresAt = nowIso;
    if (details) current.summary = details;
    if (status === 'succeeded') {
      current.failedStage = null;
      current.failedAt = null;
      current.error = null;
    }
    return current;
  });
}

export function nextRefreshStage(session, stages = session?.stages || []) {
  const completed = new Set((session?.completedStages || []).map((stage) => String(stage)));
  for (const stage of stages) {
    const normalized = String(stage || '').trim();
    if (!normalized || completed.has(normalized)) continue;
    return normalized;
  }
  return null;
}

export async function readRefreshControlPlane(statePath) {
  return readJson(path.resolve(statePath), null);
}
