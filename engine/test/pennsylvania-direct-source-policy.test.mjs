import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { stableId } from '../src/core/text.mjs';
import { collectState } from '../src/collectors/generic-state.mjs';
import { PA_DIRECT_FWGS_ROUTE_POLICY, pennsylvaniaConfiguredSourceSkip, pennsylvaniaDirectFwgsRoadblock } from '../src/collectors/pennsylvania-direct-source-policy.mjs';
import { SourceCircuitBreaker } from '../src/sources/circuit-breaker.mjs';
import { sourceReportCountsTowardReachability } from '../src/sources/source-report-semantics.mjs';

const nowAt = '2026-10-22T19:00:00.000Z';
const routes = [
  { kind: 'html', label: 'FWGS bourbon search', url: 'https://www.finewineandgoodspirits.com/search?Ntt=bourbon', sourceId: 'pa:configured:cfea019a97b2f832', checkedAt: '2026-10-22T17:57:55.928Z', lastGoodAt: '2026-09-02T15:02:37.545Z' },
  { kind: 'html', label: 'FWGS FAQ', url: 'https://www.finewineandgoodspirits.com/faq', sourceId: 'pa:configured:f8034efd4ac1d519', checkedAt: '2026-10-22T17:57:56.262Z', lastGoodAt: '2026-09-02T15:02:38.162Z' },
];
const plcb = { kind: 'html', label: 'PLCB search portal', url: 'https://www.lcb.pa.gov/pages/search.aspx' };

function runtimeId(state, source) {
  return `${state.toLowerCase()}:configured:${stableId([source.url, source.label])}`;
}

test('the two configured FWGS 403 routes retain audited identity and history without recording a new HTTP attempt', () => {
  for (const route of routes) {
    assert.equal(runtimeId('PA', route), route.sourceId);
    const skipped = pennsylvaniaConfiguredSourceSkip({ id: 'PA' }, route, route.sourceId, { nowAt });
    assert.deepEqual(skipped.signals, []);
    assert.equal(skipped.sourceResult.sourceId, route.sourceId);
    assert.equal(skipped.sourceResult.status, 'disabled');
    assert.equal(skipped.sourceResult.attemptCount, 0);
    assert.deepEqual(skipped.sourceResult.attempts, []);
    assert.equal(skipped.sourceResult.checkedAt, route.checkedAt);
    assert.equal(skipped.sourceResult.lastGoodAt, route.lastGoodAt);
    assert.equal(skipped.sourceResult.startedAt, nowAt);
    assert.equal(skipped.sourceResult.finishedAt, nowAt);
    assert.equal(skipped.sourceResult.error.status, 403);
    assert.equal(skipped.sourceResult.error.transient, false);
    assert.equal(skipped.sourceResult.alertable, false);
    assert.equal(skipped.sourceResult.stale, true);
    assert.equal(skipped.sourceResult.metadata.historicalFailure.sourceId, route.sourceId);
    assert.equal(skipped.sourceResult.metadata.historicalFailure.finishedAt, route.checkedAt);
    assert.equal(skipped.sourceResult.metadata.historicalFailure.attemptCount, 1);
    assert.equal(skipped.sourceReport.sourceRuntimeId, route.sourceId);
    assert.equal(skipped.sourceReport.historicalHttpStatus, 403);
    assert.equal(sourceReportCountsTowardReachability(skipped.sourceReport), false);
    assert.equal(skipped.roadblocks.length, 1);
    assert.equal(skipped.roadblocks[0].attemptCount, 0);
    assert.equal(skipped.roadblocks[0].historicalHttpStatus, 403);
  }
});

test('retired direct routes remain disabled without renewing observation clocks or depending on a browser artifact', () => {
  for (const route of routes) {
    const first = pennsylvaniaConfiguredSourceSkip({ id: 'PA' }, route, route.sourceId, { nowAt });
    const later = pennsylvaniaConfiguredSourceSkip({ id: 'PA' }, route, route.sourceId, { nowAt: '2026-10-29T19:00:00.000Z' });
    assert.equal(later.sourceResult.status, 'disabled');
    assert.equal(later.sourceResult.checkedAt, first.sourceResult.checkedAt);
    assert.equal(later.sourceResult.lastGoodAt, first.sourceResult.lastGoodAt);
    assert.deepEqual(later.sourceResult.metadata.historicalFailure, first.sourceResult.metadata.historicalFailure);
    assert.deepEqual(later.signals, []);
  }
  assert.equal(PA_DIRECT_FWGS_ROUTE_POLICY.directRequestsAllowed, false);
  assert.equal(PA_DIRECT_FWGS_ROUTE_POLICY.replacementLane, 'validated_fwgs_browser_pickup_artifact');
});

test('the precision-lane roadblock explicitly describes a zero-request policy decision and the original 403 evidence', () => {
  const roadblock = pennsylvaniaDirectFwgsRoadblock();
  assert.equal(roadblock.sourceRuntimeId, 'precision:pa');
  assert.equal(roadblock.status, 'source_policy_disabled');
  assert.equal(roadblock.attemptCount, 0);
  assert.deepEqual(roadblock.denialEvidence.map(row => row.url), routes.map(row => row.url));
  assert.ok(roadblock.denialEvidence.every(row => row.httpStatus === 403 && row.status === 'permanent_error'));
  assert.equal(roadblock.policyId, PA_DIRECT_FWGS_ROUTE_POLICY.id);
  assert.equal(pennsylvaniaDirectFwgsRoadblock({ sourceRuntimeId: 'fixture', source: 'Fixture route', url: 'https://fixture.invalid' }).sourceRuntimeId, 'fixture');
});

test('other states, different hosts/routes/query strings and the successful browser lane are unaffected', () => {
  const source = routes[0];
  for (const state of ['OH', 'AZ', 'NY', 'ZZ', 'pa']) assert.equal(pennsylvaniaConfiguredSourceSkip({ id: state }, source, 'fixture'), null);
  for (const url of [
    'https://www.finewineandgoodspirits.com/search?Ntt=weller',
    'https://www.finewineandgoodspirits.com/search?Ntt=bourbon&format=json',
    'https://www.finewineandgoodspirits.com/search',
    'https://www.finewineandgoodspirits.com/faq/',
    'https://www.finewineandgoodspirits.com/product/123',
    'https://www.finewineandgoodspirits.com/ccstorex/custom/v1/b2b/get-inventory',
    'https://finewineandgoodspirits.com/faq',
    'https://www.finewineandgoodspirits.com.evil.invalid/faq',
    plcb.url,
  ]) assert.equal(pennsylvaniaConfiguredSourceSkip({ id: 'PA' }, { ...source, url }, 'fixture'), null, url);
  for (const override of [{ kind: 'json' }, { sourceRuntimeKind: 'api' }, { sourceRuntimeKind: 'browser' }, { precisionOnly: true }]) {
    assert.equal(pennsylvaniaConfiguredSourceSkip({ id: 'PA' }, { ...source, ...override }, 'fixture'), null);
  }
  assert.equal(pennsylvaniaConfiguredSourceSkip({ id: 'PA' }, plcb, 'fixture'), null, 'the captured PLCB failure was transient, not a 403 denial');
  assert.equal(pennsylvaniaConfiguredSourceSkip(null, null, 'fixture'), null);
});

test('generic PA collection issues no denied-route requests but retains both audited source results and unrelated configured siblings', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(nowAt) });
  const directory = await mkdtemp(path.join(tmpdir(), 'pa-direct-source-policy-'));
  const previousDirectory = process.cwd();
  process.chdir(directory);
  try {
    const sibling = { kind: 'html', label: 'Unrelated PA source', url: 'https://fixture.invalid/source' };
    const requests = [];
    const breaker = new SourceCircuitBreaker({
      initialState: { 'precision:pa': { state: 'open', consecutiveFailures: 3, openedAtMs: Date.parse(nowAt) } },
      cooldownMs: 24 * 60 * 60_000,
    });
    const report = await collectState({ id: 'PA', label: 'Pennsylvania fixture', strategy: 'fixture', sources: [...routes, plcb, sibling], apiCandidates: [] }, { scanText: () => [], match: () => null }, {
      sourceCircuitBreaker: breaker,
      sourceRunnerOptions: { schedule: false, maxAttempts: 1, timeoutMs: 100 },
      fetcher: async url => {
        requests.push(url);
        assert.ok(!routes.some(route => route.url === url));
        return { ok: true, status: 200, url, contentType: 'text/html', text: '<p>Public product catalog</p>', bytes: 29, elapsedMs: 1 };
      },
    });
    assert.deepEqual(new Set(requests), new Set([plcb.url, sibling.url]));
    for (const route of routes) {
      const result = report.sourceResults.find(result => result.sourceId === route.sourceId);
      assert.equal(result.status, 'disabled');
      assert.equal(result.attemptCount, 0);
      assert.equal(result.checkedAt, route.checkedAt);
      assert.equal(result.lastGoodAt, route.lastGoodAt);
      assert.equal(report.roadblocks.find(row => row.sourceRuntimeId === route.sourceId).historicalHttpStatus, 403);
    }
    assert.equal(report.sourceResults.find(result => result.sourceId === runtimeId('PA', plcb)).status, 'success');
    assert.equal(report.sourceResults.find(result => result.sourceId === runtimeId('PA', sibling)).status, 'success');
  } finally {
    process.chdir(previousDirectory);
    assert.equal(path.dirname(directory), path.resolve(tmpdir()));
    assert.ok(path.basename(directory).startsWith('pa-direct-source-policy-'));
    await rm(directory, { recursive: true, force: true });
  }
});

test('generic collection in another state still requests the same URLs normally', async (t) => {
  const requests = [];
  const report = await collectState({ id: 'ZZ', label: 'Other-state fixture', strategy: 'fixture', sources: routes, apiCandidates: [] }, { scanText: () => [], match: () => null }, {
    sourceRunnerOptions: { schedule: false, maxAttempts: 1, timeoutMs: 100 },
    fetcher: async url => { requests.push(url); return { ok: true, status: 200, url, contentType: 'text/html', text: '<p>Public product catalog</p>', bytes: 29, elapsedMs: 1 }; },
  });
  assert.deepEqual(new Set(requests), new Set(routes.map(route => route.url)));
  assert.ok(report.sourceResults.every(result => result.status === 'success' && result.attemptCount === 1));
});
