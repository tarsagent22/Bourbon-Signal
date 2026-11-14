import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import fixture from './fixtures/oregon-daily-production-replay.json' with { type: 'json' };
import { OREGON_DAILY_INVENTORY_URL } from '../src/or-daily-inventory.mjs';
import { verifyDistinctOregonReport } from '../src/verify-oregon-distinct-report.mjs';

const record = { id: fixture.product.canonicalBottleId, canonical: fixture.product.canonicalName, tier: 'allocated' };
const bible = { records: [record], match: candidate => candidate === fixture.product.identityCandidate
  ? { record, method: 'exact-library-identity' } : null };
const recordsSha256 = createHash('sha256').update(JSON.stringify(bible.records)).digest('hex');
const baseline = {
  schemaVersion: 'bourbon-signal-or-product-availability-v1', status: 'ready', sourceUrl: OREGON_DAILY_INVENTORY_URL,
  sourceSha256: fixture.provenance.sourceReportSha256, sourceBytes: 95_920_909,
  sourceReportDate: fixture.provenance.sourceReportDate, generatedAt: fixture.provenance.sourceReportGeneratedAt,
  bible: { mode: 'live' }, products: [{ ...fixture.product, stores: fixture.stores }],
};
const asOf = Date.parse('2026-11-14T10:00:00.000Z');

test('saved Oregon revision comparison identifies a repeated OLCC body without network access', () => {
  const result = verifyDistinctOregonReport({ previousReport: baseline, candidateReport: baseline, bible, nowMs: asOf });
  assert.equal(result.status, 'not_ready');
  assert.equal(result.distinct, false);
  assert.ok(result.reasons.includes('OLCC CSV body digest is unchanged.'));
  assert.equal(result.scope, 'offline_saved_artifact_comparison_no_network_or_lifecycle_changes');
});

test('distinct saved revision requires current Bible identity and fresh exact store rows', () => {
  const candidate = structuredClone(baseline);
  candidate.sourceSha256 = 'd'.repeat(64);
  candidate.sourceReportDate = '11/14/2026';
  candidate.generatedAt = '2026-11-14T08:00:00.000Z';
  candidate.bible = { mode: 'live', recordsSha256 };
  candidate.products[0].stores = candidate.products[0].stores.map(store => ({
    ...store, inventoryDate: '11/14', inventoryObservedAt: '2026-11-14T08:00:00.000Z',
  }));
  const result = verifyDistinctOregonReport({ previousReport: baseline, candidateReport: candidate, bible, nowMs: asOf });
  assert.equal(result.status, 'distinct_report_ready_for_offline_canary_review');
  assert.deepEqual([result.positiveRows, result.distinctBottles, result.distinctStores, result.distinctCities], [3, 1, 3, 3]);
  assert.equal(result.alertableRows, 0);
  assert.equal(result.deliveryEligibleRows, 0);
});

test('candidate OLCC body with no current live Bible digest cannot pass distinct revision check', () => {
  const candidate = { ...baseline, sourceSha256: 'e'.repeat(64), generatedAt: '2026-11-14T08:00:00.000Z' };
  const result = verifyDistinctOregonReport({ previousReport: baseline, candidateReport: candidate, bible, nowMs: asOf });
  assert.equal(result.status, 'not_ready');
  assert.ok(result.reasons.includes('Candidate report lacks the current live app Bible records digest.'));
});
