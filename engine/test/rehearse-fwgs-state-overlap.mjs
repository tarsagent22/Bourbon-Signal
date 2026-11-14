import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { runStatePoolWithBrowserBarriers } from '../src/optimization/browser-state-barrier.mjs';
import { fwgsPublicationFreshness } from '../src/fwgs-publication-freshness.mjs';
import { validateFwgsFullArtifact } from '../src/fwgs-artifact-policy.mjs';
import { ohlqArtifactFreshEnough } from '../src/ohlq-worker-artifact.mjs';
import { resolveAggregateStateReports } from '../src/state-report-aggregation.mjs';

const fixturePath = new URL('./fixtures/fwgs-state-overlap-rehearsal.json', import.meta.url);
const fixture = JSON.parse(await readFile(fixturePath, 'utf8'));
const nowMs = Date.parse(fixture.clock);
let sourceRequests = 0;
globalThis.fetch = async () => {
  sourceRequests += 1;
  throw new Error('Network is disabled in this offline artifact rehearsal.');
};

function deferred() {
  let resolve;
  const promise = new Promise(done => { resolve = done; });
  return { promise, resolve };
}

function assertFwgsArtifact(artifact) {
  const shape = validateFwgsFullArtifact(artifact, {
    minPositiveRows: 1,
    minLocations: 1,
    minProducts: 0,
    minSearchTerms: 0,
  });
  const freshness = fwgsPublicationFreshness(artifact, { nowMs });
  assert.equal(shape.ok, true, shape.failures.join('; '));
  assert.equal(freshness.ok, true, freshness.reason);
}

function assertOhlqArtifact(artifact) {
  assert.equal(Number(artifact?.summary?.okProductCount) > 0, true);
  assert.equal(Number(artifact?.summary?.inventoryRowCount) > 0, true);
  assert.equal(ohlqArtifactFreshEnough(artifact, 12 * 60 * 60_000, nowMs), true);
}

async function tick() {
  await new Promise(resolve => setImmediate(resolve));
}

function simulateStatePool(runs, concurrency, perDomain) {
  // Mirrors prioritizeScheduledStateRuns: longest recent successful attempts
  // get first claim on the fixed worker pool.
  const pending = runs.slice().sort((left, right) => right.durationMs - left.durationMs);
  const active = [];
  let now = 0;
  while (pending.length || active.length) {
    while (active.length < concurrency) {
      const nextIndex = pending.findIndex(run => {
        const domain = ['LA', 'AK'].includes(run.id) ? 'louisiana-alaska-grocery' : run.id;
        return active.filter(worker => worker.domain === domain).length < perDomain;
      });
      if (nextIndex < 0) break;
      const [run] = pending.splice(nextIndex, 1);
      const domain = ['LA', 'AK'].includes(run.id) ? 'louisiana-alaska-grocery' : run.id;
      active.push({ domain, finishesAt: now + run.durationMs });
    }
    if (!active.length) throw new Error('Offline scheduler replay reached an impossible no-worker state.');
    now = Math.min(...active.map(worker => worker.finishesAt));
    for (let index = active.length - 1; index >= 0; index -= 1) {
      if (active[index].finishesAt <= now) active.splice(index, 1);
    }
  }
  return now;
}

const staleFwgs = fixture.artifacts.fwgsStale;
assert.equal(validateFwgsFullArtifact(staleFwgs, { minPositiveRows: 1, minLocations: 1, minProducts: 0, minSearchTerms: 0 }).ok, true);
assert.equal(fwgsPublicationFreshness(staleFwgs, { nowMs }).ok, false, 'old source clock must fail PA admission');
assert.equal(ohlqArtifactFreshEnough(fixture.artifacts.ohlqStale, 12 * 60 * 60_000, nowMs), false, 'old OHLQ clock must fail OH admission');
const replayedStateMakespanMs = simulateStatePool(
  fixture.statePool.orderedRuns,
  fixture.statePool.concurrency,
  fixture.statePool.perDomain,
);
assert.equal(fixture.statePool.orderedRuns.length, fixture.statePool.dueStateCount);
assert.equal(Math.abs(replayedStateMakespanMs / 1000 - fixture.statePool.workerMakespanSeconds) < 1, true,
  'four-slot replay should reproduce the held state-pool makespan within its rounded second');

const stalePaCalls = [];
const stalePaRows = await runStatePoolWithBrowserBarriers(
  [{ id: 'PA' }],
  async task => { stalePaCalls.push(task.id); return task.id; },
  { concurrency: 1, barriers: new Map([['PA', Promise.resolve().then(() => assertFwgsArtifact(staleFwgs))]]) },
);
assert.deepEqual(stalePaCalls, [], 'PA must not run when the artifact is valid in shape but stale by source clock');
assert.equal(stalePaRows[0].status, 'rejected');

const fwgs = deferred();
const ohlq = deferred();
const started = [];
const retainedOhio = {
  ...structuredClone(fixture.retainedOhioReport),
  signals: Array.from({ length: fixture.retainedOhioReport.signalCount }, (_, index) => ({ id: `fixture-oh-${index + 1}` })),
};
const priorOhioReport = structuredClone(retainedOhio);
const pool = runStatePoolWithBrowserBarriers(
  ['PA', 'CA', 'OH', 'TX', 'NY'].map(id => ({ id })),
  async task => {
    started.push(task.id);
    return task.id;
  },
  {
    concurrency: fixture.statePool.concurrency,
    barriers: new Map([
      ['PA', fwgs.promise.then(() => assertFwgsArtifact(fixture.artifacts.fwgsFresh))],
      ['OH', ohlq.promise.then(() => assertOhlqArtifact(fixture.artifacts.ohlqFresh))],
    ]),
  },
);

await tick();
assert.equal(started.includes('PA'), false, 'PA must remain parked until FWGS completes and validates');
assert.equal(started.includes('OH'), false, 'OH must remain parked until its OHLQ artifact is final and valid');
assert.equal(started.includes('CA'), true);

ohlq.resolve();
await tick();
assert.equal(started.includes('OH'), true, 'OH may start after its own final artifact passes');
assert.equal(started.includes('PA'), false, 'OH readiness must not release PA early');

fwgs.resolve();
const rows = await pool;
assert.equal(started.includes('PA'), true, 'PA starts only after fresh FWGS artifact validation');
assert.deepEqual(rows.map(row => row.status), Array(5).fill('fulfilled'));

// Failed OH readiness leaves its existing report content intact for stale fallback.
const staleOhGate = Promise.resolve().then(() => {
  if (!ohlqArtifactFreshEnough(fixture.artifacts.ohlqStale, 12 * 60 * 60_000, nowMs)) {
    throw new Error('OHLQ artifact is stale');
  }
});
const staleOhioStarted = [];
const staleOhRows = await runStatePoolWithBrowserBarriers(
  [{ id: 'OH' }, { id: 'CA' }],
  async task => { staleOhioStarted.push(task.id); return task.id; },
  { concurrency: 2, barriers: new Map([['OH', staleOhGate]]) },
);
assert.equal(staleOhioStarted.includes('OH'), false);
assert.equal(staleOhRows[0].status, 'rejected');
const staleOhCollected = new Map([['OH', staleOhRows[0].status === 'fulfilled' ? staleOhRows[0].value : null]]);
const aggregate = await resolveAggregateStateReports({
  configs: [{ id: 'OH' }],
  collected: staleOhCollected,
  statesOut: 'offline-fixture',
  readReport: async () => retainedOhio,
});
assert.equal(aggregate[0].attempted, true);
assert.equal(aggregate[0].wasRun, false);
assert.equal(aggregate[0].report.signals.length, fixture.retainedOhioReport.signalCount);
assert.deepEqual(retainedOhio, priorOhioReport, 'stale gate must preserve the prior report payload for fallback aggregation');

const result = {
  mode: 'offline-artifact-only',
  sourceRequests,
  productionWrites: 0,
  publicationCalls: 0,
  heldRun: {
    id: fixture.runId,
    timingSeconds: fixture.timingSeconds,
    dueStateCount: fixture.statePool.dueStateCount,
    replayedFourSlotMakespanSeconds: Number((replayedStateMakespanMs / 1000).toFixed(3)),
    evidence: fixture.evidence,
    estimatedSavedSeconds: fixture.expectedOverlap.savedSeconds,
    projectedRefreshSeconds: fixture.expectedOverlap.projectedRefreshSeconds,
  },
  checks: {
    staleFwgsRefused: true,
    staleOhlqRefused: true,
    staleOhioFallbackRetained: aggregate[0].report.signals.length === fixture.retainedOhioReport.signalCount,
    paWaitedForFreshFwgs: true,
    ohWaitedForItsOwnFreshArtifact: true,
    staleOhioReportPreserved: retainedOhio.signalCount === priorOhioReport.signalCount,
  },
  observedStartOrder: started,
};

process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
