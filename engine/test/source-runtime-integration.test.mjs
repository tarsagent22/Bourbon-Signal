import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { collectState, isStaleRetainedNotDueReport } from '../src/collectors/generic-state.mjs';
import { appendSourceSloObservations } from '../src/sources/slo-report.mjs';
import { sourceRuntimeOptionsFromArtifacts } from '../src/sources/source-runtime-state.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';

function response(url, text) {
  return {
    ok: true,
    status: 200,
    statusText: 'OK',
    url,
    requestedUrl: url,
    contentType: 'text/html',
    bytes: Buffer.byteLength(text),
    elapsedMs: 1,
    text,
    error: null,
  };
}

const bible = {
  scanText(text) {
    return /fixture bourbon/i.test(text)
      ? [{ id: 'fixture-bottle', canonical: 'Fixture Bourbon', tier: 'tracked' }]
      : [];
  },
  match() { return null; },
};

test('generic simple-source lane uses standardized isolation and preserves successful siblings', async () => {
  const config = {
    id: 'ZZ',
    label: 'Fixture state',
    tier: 'test',
    strategy: 'fixture',
    cadence: 'test',
    value: 'fixture',
    sources: [
      { kind: 'html', label: 'healthy fixture', url: 'https://healthy.fixture.test/source' },
      { kind: 'html', label: 'throwing fixture', url: 'https://throwing.fixture.test/source' },
      { kind: 'html', label: 'second healthy fixture', url: 'https://sibling.fixture.test/source' },
    ],
    apiCandidates: [],
  };
  const fetcher = async (url) => {
    if (url.includes('throwing')) throw new Error('fixture collector threw');
    return response(url, '<h1>Fixture Bourbon</h1><p>Inventory in stock.</p>');
  };

  const report = await collectState(config, bible, {
    fetcher,
    sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100, retryDelayMs: 0 },
  });

  assert.equal(report.sourceResults.length, 3);
  assert.equal(report.sourceResults.every((result) => /^zz:configured:[a-f0-9]{16}$/.test(result.sourceId)), true);
  assert.equal(new Set(report.sourceResults.map((result) => result.sourceId)).size, 3);
  assert.equal(report.sourceResults[0].status, 'success');
  assert.equal(report.sourceResults[1].status, 'failed');
  assert.equal(report.sourceResults[2].status, 'success');
  assert.equal(report.signals.some((signal) => signal.sourceLabel === 'healthy fixture'), true);
  assert.equal(report.signals.some((signal) => signal.sourceLabel === 'second healthy fixture'), true);
  assert.equal(report.roadblocks.some((roadblock) => roadblock.source === 'throwing fixture'), true);
});

test('Costco-only strategy invokes its collector even without a synthetic configured source', async () => {
  const config = {
    id: 'ZZ',
    label: 'Fixture Costco state',
    tier: 'test',
    strategy: 'costco_warehouse_inventory_watch',
    cadence: 'test',
    value: 'fixture',
    sources: [],
    apiCandidates: [],
  };

  const report = await collectState(config, bible);

  assert.equal(report.sources.some((source) => source.signalType === 'costco_item_watchlist'), true);
  assert.equal(report.sources.some((source) => source.signalType === 'costco_observation_feed_missing'), true);
  assert.equal(report.roadblocks.some((roadblock) => roadblock.source === 'Costco warehouse observation feed' && roadblock.status === 'not_configured'), true);
  assert.equal(report.signals.length, 0);
  assert.equal(report.status, 'blocked', 'the Costco watchlist alone is configuration, not reachable observation evidence');
});

test('fresh exact Costco zero-stock evidence is monitored negative inventory, not parser deficiency', async () => {
  const directory = await mkdtemp(path.join(tmpdir(), 'bs-costco-zero-integration-'));
  const watchlistPath = path.join(directory, 'watchlist.json');
  const observationsPath = path.join(directory, 'observations.json');
  const previousWatchlist = process.env.COSTCO_WATCHLIST_FILE;
  const previousObservations = process.env.COSTCO_OBSERVATIONS_FILE;
  await writeFile(watchlistPath, JSON.stringify([{ itemNumber: '12345', canonicalName: 'Fixture Bourbon' }]), 'utf8');
  await writeFile(observationsPath, JSON.stringify({ observations: [{
    itemNumber: '12345',
    productName: 'Fixture Bourbon',
    state: 'MI',
    storeNumber: '1001',
    storeName: 'Costco Fixture Warehouse',
    sourceSystem: 'costco_sameday',
    status: 'out_of_stock',
    quantity: 0,
    observedAt: new Date().toISOString(),
  }] }), 'utf8');
  process.env.COSTCO_WATCHLIST_FILE = watchlistPath;
  process.env.COSTCO_OBSERVATIONS_FILE = observationsPath;

  try {
    const report = await collectState({
      id: 'MI',
      label: 'Fixture Costco state',
      tier: 'test',
      strategy: 'costco_warehouse_inventory_watch',
      cadence: 'test',
      value: 'fixture',
      sources: [],
      apiCandidates: [],
    }, bible);
    const observationSource = report.sources.find((source) => source.signalType === 'costco_warehouse_no_current_inventory');
    assert.equal(report.status, 'monitored_no_current_inventory');
    assert.equal(report.signals.filter((signal) => signal.eventType === 'costco_warehouse_inventory').length, 0);
    assert.equal(observationSource?.ok, true);
    assert.equal(observationSource?.zeroOutputExpected, true);
    assert.equal(observationSource?.signalProducingEligible, false);
  } finally {
    if (previousWatchlist == null) delete process.env.COSTCO_WATCHLIST_FILE;
    else process.env.COSTCO_WATCHLIST_FILE = previousWatchlist;
    if (previousObservations == null) delete process.env.COSTCO_OBSERVATIONS_FILE;
    else process.env.COSTCO_OBSERVATIONS_FILE = previousObservations;
    await rm(directory, { recursive: true, force: true });
  }
});

test('generic API candidates use the same source runtime boundary as configured sources', async () => {
  const apiUrl = 'data:application/json,%5B%7B%22name%22%3A%22Fixture%20Bourbon%22%7D%5D';
  const config = {
    id: 'ZZ',
    label: 'Fixture state',
    tier: 'test',
    strategy: 'fixture',
    cadence: 'test',
    value: 'fixture',
    sources: [],
    apiCandidates: [apiUrl],
  };
  const report = await collectState(config, bible, {
    fetcher: async (url) => response(url, '[{"name":"Fixture Bourbon"}]'),
    sourceRunnerOptions: { maxAttempts: 1, timeoutMs: 100, retryDelayMs: 0 },
  });

  assert.equal(report.sourceResults.length, 1);
  assert.match(report.sourceResults[0].sourceId, /^zz:api:[a-f0-9]{16}$/);
  assert.equal(report.sourceResults[0].status, 'success');
  assert.equal(report.sourceResults[0].sourceMetadata.stateId, 'ZZ');
});

test('retired OH, PA, and Florida generic probes are absent while Ohio retains one precision source', () => {
  const ohio = ALL_STATE_SOURCES.find((state) => state.id === 'OH');
  assert.deepEqual(ohio.sources, []);
  assert.deepEqual(ohio.apiCandidates, []);
  assert.deepEqual(ohio.precisionSource, {
    label: 'Ohio OHLQ precision collector',
    url: 'https://www.ohlq.com/liquor/whiskey?productsubtype=bourbon&producttype=american',
  });

  const pennsylvania = ALL_STATE_SOURCES.find((state) => state.id === 'PA');
  assert.deepEqual(pennsylvania.apiCandidates, []);

  const florida = ALL_STATE_SOURCES.find((state) => state.id === 'FL');
  assert.equal(florida.sources.some((source) => source.label === 'Florida Plaza Liquors bourbon catalog'), false);
});

test('precision-only registration scaffolding is not reported as a successful runtime probe', async () => {
  const config = {
    id: 'ZZ',
    label: 'Fixture precision-only state',
    tier: 'test',
    strategy: 'fixture',
    cadence: 'test',
    value: 'fixture',
    sources: [{ kind: 'html', label: 'precision-only fixture', url: 'https://precision.fixture.test/source', precisionOnly: true }],
    apiCandidates: [],
  };

  const report = await collectState(config, bible);
  assert.deepEqual(report.sources, []);
  assert.deepEqual(report.sourceResults, []);
  assert.equal(report.status, 'blocked');
});

test('production source runtime makes an immediate second result not_due without skipping untimed sources', async () => {
  const config = {
    id: 'ZZ',
    label: 'Fixture state',
    tier: 'test',
    strategy: 'fixture',
    cadence: 'test',
    value: 'fixture',
    sources: [
      { kind: 'html', label: 'reliably timed fixture', url: 'https://timed.fixture.test/source' },
      { kind: 'html', label: 'standard result fixture', url: 'https://standard.fixture.test/source' },
      { kind: 'html', label: 'untimed fixture', url: 'https://untimed.fixture.test/source' },
    ],
    apiCandidates: [],
  };
  let calls = 0;
  const fetcher = async (url) => {
    calls += 1;
    return response(url, '<h1>Fixture Bourbon</h1><p>Inventory in stock.</p>');
  };
  const first = await collectState(config, bible, {
    fetcher,
    sourceRunnerOptions: {
      now: () => '2026-07-15T12:00:00.000Z',
      baseCadenceMs: 60_000,
      minCadenceMs: 60_000,
      maxCadenceMs: 60_000,
      maxAttempts: 1,
    },
  });
  const previous = {
    ...first,
    sourceResults: first.sourceResults.map((result, index) => index < 2 ? result : { ...result, checkedAt: null, finishedAt: null }),
  };
  const history = appendSourceSloObservations(null, [first.sourceResults[0]], { now: '2026-07-15T12:00:00.000Z' });
  const productionOptions = sourceRuntimeOptionsFromArtifacts({ previousReport: previous, sourceHistory: history });
  const second = await collectState(config, bible, {
    fetcher,
    ...productionOptions,
    sourceRunnerOptions: {
      ...productionOptions.sourceRunnerOptions,
      now: () => '2026-07-15T12:00:30.000Z',
      baseCadenceMs: 60_000,
      minCadenceMs: 60_000,
      maxCadenceMs: 60_000,
      maxAttempts: 1,
    },
  });

  assert.equal(second.sourceResults[0].status, 'not_due');
  assert.equal(second.sourceResults[0].attemptCount, 0);
  assert.equal(second.sourceResults[1].status, 'not_due', 'a standardized previous result supplies reliable fallback timing');
  assert.equal(second.sourceResults[2].status, 'success');
  assert.equal(calls, 4, 'reliably timed sources are retained while the untimed source is probed again');
});

test('stale retained-not-due inference fails closed on any fresh or delivery-eligible row', () => {
  const notDue = [{ status: 'not_due' }];
  const safe = {
    stale: true,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
    sourceAvailabilityVerified: false,
    eligibleForEmail: false,
    eligibleForSms: false,
  };
  assert.equal(isStaleRetainedNotDueReport(notDue, [safe]), true);
  assert.equal(isStaleRetainedNotDueReport([{ status: 'success' }], [safe]), false);
  assert.equal(isStaleRetainedNotDueReport(notDue, []), false);
  for (const [field, value] of [
    ['stale', false],
    ['canAlertAsInventory', true],
    ['canAlertAsWatch', true],
    ['alertable', true],
    ['sourceAvailabilityVerified', true],
    ['eligibleForEmail', true],
    ['eligibleForSms', true],
  ]) {
    assert.equal(isStaleRetainedNotDueReport(notDue, [{ ...safe, [field]: value }]), false, `${field} must block stale fallback inference`);
  }
});

test('not-due reuse preserves an all-stale non-alertable state partition as explicit stale context', async () => {
  const config = {
    id: 'ZZ',
    label: 'Fixture state',
    tier: 'test',
    strategy: 'fixture',
    cadence: 'test',
    value: 'fixture',
    sources: [{ kind: 'html', label: 'retained fixture', url: 'https://retained.fixture.test/source' }],
    apiCandidates: [],
  };
  const fetcher = async (url) => response(url, '<h1>Fixture Bourbon</h1><p>Inventory in stock.</p>');
  const first = await collectState(config, bible, {
    fetcher,
    sourceRunnerOptions: {
      now: () => '2026-07-15T12:00:00.000Z',
      baseCadenceMs: 60_000,
      minCadenceMs: 60_000,
      maxCadenceMs: 60_000,
      maxAttempts: 1,
    },
  });
  const staleSignals = first.signals.map((signal) => ({
    ...signal,
    stale: true,
    canAlertAsInventory: false,
    canAlertAsWatch: false,
    alertable: false,
  }));
  const previous = {
    ...first,
    signals: staleSignals,
  };
  const productionOptions = sourceRuntimeOptionsFromArtifacts({ previousReport: previous });

  const second = await collectState(config, bible, {
    fetcher,
    ...productionOptions,
    sourceRunnerOptions: {
      ...productionOptions.sourceRunnerOptions,
      now: () => '2026-07-15T12:00:30.000Z',
      baseCadenceMs: 60_000,
      minCadenceMs: 60_000,
      maxCadenceMs: 60_000,
      maxAttempts: 1,
    },
  });

  assert.equal(second.sourceResults[0].status, 'not_due');
  assert.equal(second.stale, true);
  assert.equal(second.status, 'stale_useful_retained_not_due');
  assert.match(second.staleReason, /retained not-due evidence was already stale and non-alertable/i);
  assert.equal(second.staleFallbackAt, second.finishedAt);
  assert.equal(second.signals.every((signal) => signal.stale === true && signal.canAlertAsInventory === false && signal.canAlertAsWatch === false && signal.alertable === false), true);
});

test('representative multi-source California lane and run-level SLO use shared runtime without replacing orchestration', async () => {
  const precision = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(precision, /runSourceAdapters\(californiaAdapters/);
  assert.match(precision, /createSourceAdapter\(\{[\s\S]*?id:\s*`ca:/);
  assert.doesNotMatch(precision, /async function retryCaliforniaFetch/);

  const stateRunner = await readFile(new URL('../src/run-state.mjs', import.meta.url), 'utf8');
  assert.match(stateRunner, /collectState\(config, bible,/);
  assert.match(stateRunner, /sourceRuntimeOptionsFromArtifacts/);
  assert.match(stateRunner, /source-run-history\.json/);
  const engineRunner = await readFile(new URL('../src/run.mjs', import.meta.url), 'utf8');
  assert.match(engineRunner, /runBoundedPool\(runnable/);
  assert.match(engineRunner, /attemptStartedAt:\s*poolResult\?\.startedAt/);
  assert.match(engineRunner, /attemptFinishedAt:\s*poolResult\?\.finishedAt/);
  assert.match(engineRunner, /source-slo-7d\.json/);
  assert.match(engineRunner, /appendSourceSloObservations/);
  assert.match(engineRunner, /buildSevenDaySourceSloReport/);
});

test('legacy precision dispatch uses the shared runtime envelope rather than a parallel retry path', async () => {
  const precision = await readFile(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  assert.match(precision, /runLegacyPrecisionSource\(/);
  assert.match(precision, /legacyPrecisionSourceId\(config\.id\)/);
  assert.doesNotMatch(precision, /async function retryPrecision/);
});
