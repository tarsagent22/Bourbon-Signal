import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fixture from './fixtures/oregon-daily-production-replay.json' with { type: 'json' };
import { collectOregonDailyProduction, OREGON_DAILY_PRODUCTION_CONFIG, OREGON_DAILY_PRODUCTION_RUNTIME_ID, oregonDailyProductionAllowed, oregonDailyProductionSourceConfigHash, projectOregonDailyProduction } from '../src/collectors/oregon-daily-production.mjs';
import { OREGON_DAILY_PRODUCTION_COHORT_SHA256 } from '../src/oregon-daily-production-policy.mjs';
import { OREGON_DAILY_INVENTORY_URL } from '../src/or-daily-inventory.mjs';

const report = {
  schemaVersion: 'bourbon-signal-or-product-availability-v1', status: 'ready', sourceUrl: OREGON_DAILY_INVENTORY_URL,
  sourceSha256: fixture.provenance.sourceReportSha256, sourceBytes: 95_920_909,
  sourceReportDate: fixture.provenance.sourceReportDate, generatedAt: fixture.provenance.sourceReportGeneratedAt,
  bible: { mode: 'live', recordsSha256: createHash('sha256').update(JSON.stringify([{ id: fixture.product.canonicalBottleId }])).digest('hex') },
  products: [{ ...fixture.product, stores: fixture.stores }],
};
const bible = { records: [{ id: fixture.product.canonicalBottleId }], match: candidate => candidate === fixture.product.identityCandidate
  ? { record: { id: fixture.product.canonicalBottleId, canonical: fixture.product.canonicalName, tier: 'allocated' }, method: 'exact-library-identity' }
  : null };
const originalCanaryMs = Date.parse(fixture.provenance.canaryGeneratedAt);

test('retained OLCC report replay preserves exact allocation rows, source quantities, and original clocks', () => {
  const rows = projectOregonDailyProduction(report, bible, { nowMs: originalCanaryMs });
  assert.deepEqual(rows.map(row => [row.storeId, row.quantity]), [['1001', 3], ['1003', 12], ['1004', 2]]);
  assert.equal(rows[0].id, fixture.provenance.store1001ShadowSignalId);
  assert.ok(rows.every(row => row.tier === 'allocated' && row.quantityIsExact === true));
  assert.ok(rows.every(row => row.observedAt === '2026-11-12T08:00:00.000Z' && row.lastConfirmedAt === row.observedAt));
  assert.ok(rows.every(row => row.sourceReportSha256 === fixture.provenance.sourceReportSha256));
  assert.ok(rows.every(row => row.eligibleForOnSite && row.eligibleForDropFeed && !row.previewOnly));
  assert.ok(rows.every(row => !row.canAlertAsInventory && !row.canAlertAsWatch && !row.alertable
    && !row.eligibleForDelivery && !row.eligibleForEmail && !row.eligibleForSms));
});

test('OR production stays denied until active lifecycle, exact adapter manifest, and immutable evidence agree', () => {
  const manifest = { state: 'OR', lifecycle: { publicStatus: 'research_only', refinementLevel: 'store' }, collector: { sourceIds: ['precision:or'] } };
  const config = { activeStates: [], states: { OR: { publicStatus: 'research_only' } } };
  assert.equal(OREGON_DAILY_PRODUCTION_RUNTIME_ID, 'or:olcc-daily-inventory');
  assert.match(OREGON_DAILY_PRODUCTION_COHORT_SHA256, /^[a-f0-9]{64}$/);
  assert.equal(OREGON_DAILY_PRODUCTION_CONFIG.cohortSha256, OREGON_DAILY_PRODUCTION_COHORT_SHA256);
  assert.equal(oregonDailyProductionAllowed(config, manifest), false);
  assert.equal(oregonDailyProductionAllowed({ ...config, activeStates: ['OR'] }, manifest), false);
  const hashManifest = { state: 'OR', lifecycle: {}, collector: {}, storeIdentity: {}, sourceSemantics: {}, customerPaths: {} };
  assert.equal(oregonDailyProductionSourceConfigHash(hashManifest), createHash('sha256').update(JSON.stringify({
    lifecycle: {}, collector: {}, storeIdentity: {}, sourceSemantics: {}, customerPaths: {},
  })).digest('hex'));
  assert.notEqual(oregonDailyProductionSourceConfigHash(hashManifest), OREGON_DAILY_PRODUCTION_COHORT_SHA256);
});

test('OR promotion gate accepts only matching semantic source hash and pinned OLCC cohort', () => {
  const manifest = { state: 'OR', lifecycle: { publicStatus: 'active', refinementLevel: 'store' },
    collector: { sourceIds: [OREGON_DAILY_PRODUCTION_RUNTIME_ID], cohortSha256: OREGON_DAILY_PRODUCTION_COHORT_SHA256 },
    storeIdentity: { addressRequired: true }, sourceSemantics: { inventoryAlertable: false, watchAlertable: false },
    customerPaths: {}, evidence: {} };
  const previewUrl = 'https://oregon-research-preview.vercel.app/coverage';
  const immutableEvidence = { schemaVersion: 1, state: 'OR', generatedAt: new Date().toISOString(),
    sourceConfigHash: oregonDailyProductionSourceConfigHash(manifest), previewUrl,
    shadowRuns: [1,2,3].map(i => ({ status: 'success', runId: `shadow-${i}`, artifactHash: String(i).repeat(64) })),
    canaryRuns: [1,2].map(i => ({ status: 'success', runId: `canary-${i}`, artifactHash: String(i + 3).repeat(64) })),
    provenance: { status: 'success', repository: 'tarsagent22/Bourbon-Signal', workflowRunId: '12345', artifactId: '67890',
      commitSha: 'a'.repeat(40), artifactDigest: 'b'.repeat(64), bundleDigest: 'c'.repeat(64),
      workflowRunUrl: 'https://github.com/tarsagent22/Bourbon-Signal/actions/runs/12345', artifactName: 'provenance-OR-test' } };
  manifest.evidence.immutablePromotionEvidence = immutableEvidence;
  const promotionEvidence = { shadowRuns: 3, canaryRuns: 2, verifiedAt: new Date().toISOString(),
    verticalSliceManifest: 'engine/data/state-integration/OR.json', fixtureContract: 'engine/data/state-fixtures/OR.json',
    canaryPreviewUrl: previewUrl, immutableEvidence };
  const config = { activeStates: ['OR'], states: { OR: { publicStatus: 'active', promotionStage: 'active',
    inventoryAlertable: false, watchAlertable: false, promotionEvidence } } };
  assert.equal(oregonDailyProductionAllowed(config, manifest), true);
  assert.equal(oregonDailyProductionAllowed(config, { ...manifest,
    collector: { ...manifest.collector, cohortSha256: 'f'.repeat(64) } }), false);
  const altered = structuredClone(manifest); altered.sourceSemantics.watchAlertable = true;
  assert.equal(oregonDailyProductionAllowed(config, altered), false);
});

test('dormant production wrapper does not probe OLCC while lifecycle and source manifest are unapproved', async () => {
  let requestCount = 0;
  const result = await collectOregonDailyProduction({ activeStates: [], states: { OR: { publicStatus: 'research_only' } } },
    { state: 'OR', collector: { sourceIds: ['precision:or'] } }, bible,
    { fetchImpl: async () => { requestCount += 1; throw new Error('unexpected source request'); } });
  assert.equal(requestCount, 0);
  assert.deepEqual(result.signals, []);
  assert.equal(result.metadata.blockedByPromotion, true);
});

test('replay excludes stale, future, inexact, and identity-drifted source rows', () => {
  const stale = { ...report, generatedAt: '2026-11-10T00:00:00.000Z' };
  const future = { ...report, generatedAt: '2026-11-14T07:10:00.000Z' };
  const badQty = { ...report, products: [{ ...report.products[0], stores: [{ ...fixture.stores[0], quantity: 1.5 }] }] };
  const identityDrift = { ...report, products: [{ ...report.products[0], canonicalBottleId: 'wrong-id' }] };
  assert.equal(projectOregonDailyProduction(stale, bible, { nowMs: originalCanaryMs }).length, 0);
  assert.equal(projectOregonDailyProduction(future, bible, { nowMs: originalCanaryMs }).length, 0);
  assert.equal(projectOregonDailyProduction(badQty, bible, { nowMs: originalCanaryMs }).length, 0);
  assert.equal(projectOregonDailyProduction(identityDrift, bible, { nowMs: originalCanaryMs }).length, 0);
});
