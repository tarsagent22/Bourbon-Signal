import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';

import { buildShadowEvidence, classifyShadowReadiness, isValidShadowReport, runCandidatePrerequisite, runExpansionShadow, selectShadowCandidates, terminateSubprocessTree, validateShadowRunRequest } from '../src/run-expansion-shadow.mjs';

test('shadow collection only selects explicitly eligible non-active candidates and never emits publishable rows', () => {
  const lifecycle = {
    activeStates: ['AA'],
    states: {
      AA: { publicStatus: 'active', shadowEligible: true },
      ZZ: { publicStatus: 'research_only', shadowEligible: true },
      YY: { publicStatus: 'research_only', shadowEligible: false },
    },
  };
  assert.deepEqual(selectShadowCandidates(lifecycle, { limit: 5 }), ['ZZ']);
  const evidence = buildShadowEvidence('ZZ', {
    status: 'useful', signals: [{ storeId: 'zz-1', storeAddress: '1 Main', locationPrecision: 'store_level', observedAt: '2026-07-16T00:00:00.000Z', canAlertAsInventory: true }],
    sources: [{ ok: true }], roadblocks: [], startedAt: '2026-07-16T00:00:00.000Z', finishedAt: '2026-07-16T00:00:01.000Z',
  }, { now: '2026-07-16T01:00:00.000Z' });
  assert.equal(evidence.publication.allowed, false);
  assert.equal(evidence.alerts.disabled, true);
  assert.equal(evidence.metrics.exactStoreRatio, 1);
  assert.equal(evidence.readiness.inventory.status, 'ready');
  assert.equal(evidence.complete, true);
});

test('shadow inventory trust requires a fresh nonfuture signal with concrete store identity', () => {
  const now = '2026-09-08T23:00:00.000Z';
  const base = {
    state: 'ZZ', strategy: 'inventory_locator', status: 'useful',
    sources: [{ ok: true }], roadblocks: [],
  };
  const signal = {
    eventType: 'store_inventory_result', canAlertAsInventory: true, locationPrecision: 'store_level',
    storeId: 'zz-1', storeAddress: '1 Main', observedAt: '2026-09-08T22:00:00.000Z',
  };

  assert.equal(classifyShadowReadiness({ ...base, signals: [signal] }, { now }).inventory.status, 'ready');
  for (const untrusted of [
    { ...signal, observedAt: '2020-01-01T00:00:00.000Z' },
    { ...signal, observedAt: '2026-09-08T23:00:00.001Z' },
    { ...signal, stale: true },
    { ...signal, storeId: undefined },
    { ...signal, storeAddress: undefined },
  ]) {
    assert.equal(classifyShadowReadiness({ ...base, signals: [untrusted] }, { now }).inventory.ready, false);
  }
});

test('partial discovery cannot be labeled complete even when a sibling inventory row is trusted', () => {
  const report = {
    state: 'ZZ', strategy: 'inventory_locator', status: 'useful',
    signals: [{ canAlertAsInventory: true, locationPrecision: 'store_level', storeId: 'zz-1', storeAddress: '1 Main', observedAt: '2026-09-08T22:00:00.000Z' }],
    sources: [{ id: 'working', ok: true }, { id: 'failed', ok: false }],
    roadblocks: [{ source: 'failed', status: 500, error: 'detail failed' }],
    startedAt: '2026-09-08T22:00:00.000Z', finishedAt: '2026-09-08T22:00:01.000Z', sourceResults: [],
  };
  const evidence = buildShadowEvidence('ZZ', report, { now: '2026-09-08T23:00:00.000Z' });
  assert.equal(evidence.readiness.inventory.ready, true);
  assert.equal(evidence.readiness.discovery.status, 'partial');
  assert.equal(evidence.complete, false);
  assert.match(evidence.outcome, /discovery/iu);
});

test('Oregon browser prerequisite honors the global browser skip switch', async () => {
  let spawned = false;
  const result = await runCandidatePrerequisite('OR', process.cwd(), {
    env: { BOURBON_SIGNAL_SKIP_BROWSER_COLLECTORS: '1' },
    spawnImpl: () => { spawned = true; throw new Error('must not spawn'); },
  });
  assert.equal(spawned, false);
  assert.deepEqual([result.ok, result.status], [true, 'skipped']);
});

test('Oregon browser prerequisite times out, terminates its process tree, and returns diagnostics', async () => {
  const child = new EventEmitter();
  child.pid = 4242;
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  const terminations = [];
  const result = await runCandidatePrerequisite('OR', process.cwd(), {
    env: {},
    timeoutMs: 5,
    spawnImpl: () => child,
    terminateTree: async (...args) => { terminations.push(args); return { method: 'fixture-tree-kill' }; },
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 'timeout');
  assert.match(result.error, /timed out/iu);
  assert.deepEqual(result.termination, { method: 'fixture-tree-kill' });
  assert.equal(terminations.length, 1);
});

test('process-tree termination is explicit on Windows and POSIX', async () => {
  const windowsCalls = [];
  await terminateSubprocessTree({ pid: 81 }, {
    platform: 'win32',
    execFileImpl: async (...args) => { windowsCalls.push(args); },
  });
  assert.deepEqual(windowsCalls[0].slice(0, 2), ['taskkill', ['/pid', '81', '/t', '/f']]);

  const posixCalls = [];
  await terminateSubprocessTree({ pid: 82 }, {
    platform: 'linux',
    processKillImpl: (...args) => { posixCalls.push(args); },
  });
  assert.deepEqual(posixCalls, [[-82, 'SIGKILL']]);
});

test('document discovery cannot silently complete an inventory expansion with a missing prerequisite', () => {
  const report = {
    state: 'MI',
    strategy: 'costco_warehouse_inventory_watch',
    status: 'useful',
    signals: [{ eventType: 'price_book_document_signal', fetchedAt: '2026-09-08T23:00:00.000Z' }],
    sources: [{ label: 'MLCC price book', ok: true, signalType: 'price_book_document_signal' }],
    roadblocks: [{ source: 'Costco warehouse observation feed', status: 'not_configured', error: 'No Costco warehouse observations are configured for MI.', nextRoute: 'Refresh the observation feed.' }],
    startedAt: '2026-09-08T23:00:00.000Z',
    finishedAt: '2026-09-08T23:00:01.000Z',
  };
  const readiness = classifyShadowReadiness(report);
  assert.equal(readiness.discovery.status, 'succeeded');
  assert.equal(readiness.inventory.status, 'blocked_prerequisite');
  assert.match(readiness.inventory.reason, /Costco warehouse observation feed/i);
  const evidence = buildShadowEvidence('MI', report);
  assert.equal(evidence.complete, false);
  assert.equal(evidence.outcome, 'incomplete_inventory_prerequisite');
});

test('a deeper-parser discovery remains incomplete until it yields trusted current inventory', () => {
  const readiness = classifyShadowReadiness({
    state: 'NH', strategy: 'catalog_and_limited_release_category', status: 'reachable_needs_deeper_parser',
    signals: [{ eventType: 'inventory_surface_signal', locationPrecision: 'store_aggregate' }],
    sources: [{ label: 'NHLC search', ok: true }], roadblocks: [],
  });
  assert.equal(readiness.discovery.status, 'succeeded');
  assert.equal(readiness.inventory.status, 'needs_deeper_parser');
  assert.equal(readiness.inventory.ready, false);
});

test('shadow collection persists an explicit report and marks failed inner collectors unsuccessful', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'bs-expansion-shadow-'));
  try {
    const lifecycle = { activeStates: [], states: { ZZ: { publicStatus: 'research_only', shadowEligible: true } } };
    const summary = await runExpansionShadow({
      lifecycle,
      states: ['ZZ'],
      limit: 1,
      outDir,
      runCollector: async () => ({ ok: false, stdout: '', stderr: 'fixture failure', error: 'collector exited 1' }),
    });
    assert.equal(summary.results[0].executionOk, false);
    assert.equal(summary.results[0].collectorStatus, 'failed_shadow_collection');
    const report = JSON.parse(await readFile(path.join(summary.results[0].directory, 'report.json'), 'utf8'));
    const evidence = JSON.parse(await readFile(path.join(summary.results[0].directory, 'evidence.json'), 'utf8'));
    assert.equal(report.status, 'failed_shadow_collection');
    assert.equal(evidence.execution.ok, false);
    assert.equal(evidence.publication.productionSnapshotTouched, false);
    assert.equal(evidence.alerts.deliveryAttempted, false);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('shadow request validation rejects missing lifecycle, zero work, and ineligible explicit states', () => {
  const lifecycle = { activeStates: [], states: { ZZ: { publicStatus: 'research_only', shadowEligible: true } } };
  assert.throws(() => validateShadowRunRequest(null, { candidates: ['ZZ'] }), /valid state lifecycle/iu);
  assert.throws(() => validateShadowRunRequest(lifecycle, { candidates: [] }), /selected no eligible candidates/iu);
  assert.throws(() => validateShadowRunRequest(lifecycle, { requestedStates: ['YY'], candidates: ['ZZ'] }), /not eligible or was not selected/iu);
  assert.equal(validateShadowRunRequest(lifecycle, { requestedStates: ['ZZ'], candidates: ['ZZ'] }), true);
});

test('a successful child without a schema-valid report remains a failed shadow collection', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'bs-expansion-shadow-missing-report-'));
  try {
    const lifecycle = { activeStates: [], states: { ZZ: { publicStatus: 'research_only', shadowEligible: true } } };
    const summary = await runExpansionShadow({
      lifecycle,
      states: ['ZZ'],
      limit: 1,
      outDir,
      runCollector: async (_state, outputFile) => {
        await writeFile(outputFile, '{}');
        return { ok: true, stdout: '', stderr: '', error: null };
      },
    });
    assert.equal(summary.results[0].executionOk, true);
    assert.equal(summary.results[0].collectorStatus, 'failed_shadow_collection');
    assert.equal(isValidShadowReport('ZZ', {}), false);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});

test('a failed required browser prerequisite cannot be laundered by a retained-looking state report', async () => {
  const outDir = await mkdtemp(path.join(tmpdir(), 'bs-expansion-shadow-prerequisite-'));
  try {
    const lifecycle = { activeStates: [], states: { OR: { publicStatus: 'research_only', shadowEligible: true } } };
    const summary = await runExpansionShadow({
      lifecycle,
      states: ['OR'],
      limit: 1,
      outDir,
      prepareCandidate: async () => ({ ok: false, status: 'failed', stdout: '', stderr: 'browser unavailable', error: 'Oregon browser prerequisite exited 1' }),
      runCollector: async (_state, outputFile) => {
        await writeFile(outputFile, JSON.stringify({
          state: 'OR', strategy: 'inventory_locator', status: 'useful',
          startedAt: '2026-09-08T23:00:00.000Z', finishedAt: '2026-09-08T23:00:01.000Z',
          signals: [{ eventType: 'store_inventory_result', canAlertAsInventory: true, locationPrecision: 'store_level', storeId: '1', storeAddress: '1 Main', observedAt: '2026-09-08T23:00:00.000Z' }],
          sources: [{ ok: true }], sourceResults: [], roadblocks: [],
        }));
        return { ok: true, stdout: '', stderr: '', error: null };
      },
    });
    assert.equal(summary.complete, false);
    assert.equal(summary.results[0].outcome, 'incomplete_prerequisite_execution');
    assert.equal(summary.results[0].readiness.inventory.status, 'prerequisite_execution_failed');
    assert.match(summary.results[0].prerequisite.error, /exited 1/iu);
  } finally {
    await rm(outDir, { recursive: true, force: true });
  }
});
