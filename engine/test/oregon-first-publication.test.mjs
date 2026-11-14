import assert from 'node:assert/strict';
import test from 'node:test';
import { createHash } from 'node:crypto';
import { OREGON_DAILY_PRODUCTION_COHORT_SHA256, OREGON_DAILY_PRODUCTION_RUNTIME_ID, OREGON_DAILY_INVENTORY_URL } from '../src/oregon-daily-production-policy.mjs';
import { OREGON_FIRST_PUBLICATION_MINIMUMS, oregonPreviousSourceReportSha256, verifyOregonFirstPublication } from '../src/verify-oregon-first-publication.mjs';

const nowMs = Date.parse('2026-11-14T16:00:00.000Z');
const oldSha = '7f3358819f99f036fb3b7594a25f0c0ec331588d680aa16773d71f4084bd6775';
const currentSha = 'd'.repeat(64);
const observedAt = '2026-11-14T08:00:00.000Z';

function makeRows(count = OREGON_FIRST_PUBLICATION_MINIMUMS.rows) {
  return Array.from({ length: count }, (_, index) => {
    const storeId = String(1000 + index);
    const sourceProductBinding = { source: 'olcc-daily-report', cohortSha256: OREGON_DAILY_PRODUCTION_COHORT_SHA256,
      canonicalBottleId: 'eagle-rare-10', reportSha256: currentSha, reportGeneratedAt: '2026-11-14T15:32:00.000Z',
      sourceQuantity: 2, observedAt };
    return { state: 'OR', sourceRuntimeId: OREGON_DAILY_PRODUCTION_RUNTIME_ID, sourceUrl: OREGON_DAILY_INVENTORY_URL,
      sourceAvailabilityVerified: true, sourceStale: false, stale: false, locationPrecision: 'store_level', storeId,
      storeAddress: `${index + 1} Main St, City ${index}, OR 97000`, city: `City ${index}`, canonicalBottleId: 'eagle-rare-10',
      canonicalName: 'Eagle Rare 10 Year', tier: index === 0 ? 'allocated' : 'allocated', rawName: 'EAGLE RARE S/B BOURBON',
      quantity: 2, quantityIsExact: true, observedAt, lastConfirmedAt: observedAt, sourceProductBinding,
      canAlertAsInventory: false, canAlertAsWatch: false, alertable: false, eligibleForOnSite: true, eligibleForDropFeed: true,
      eligibleForWatch: false, eligibleForDelivery: false, deliveryEligible: false, eligibleForEmail: false, eligibleForSms: false,
      previewOnly: false };
  });
}

function candidate() {
  const drops = makeRows();
  const stateReport = { state: 'OR', stale: false, status: 'useful', startedAt: '2026-11-14T14:00:00.000Z',
    finishedAt: '2026-11-14T16:00:00.000Z', lastGoodAt: '2026-11-14T15:32:00.000Z', signals: drops,
    metadata: { oregonDailyInventory: {
    complete: true, productionAlertDeliveryAllowed: false, sourceUrl: OREGON_DAILY_INVENTORY_URL,
    sourceReportDate: '11/14/2026', sourceReportSha256: currentSha, sourceObservedAt: '2026-11-14T15:32:00.000Z', sourceBytes: 95_990_899,
  } } };
  return { stateReport, statePartition: { state: 'OR', count: drops.length, drops }, alerts: { alerts: [] }, previousSourceReportSha256: oldSha,
    workflowRunId: '43614008559', reportBytes: Buffer.from('normalized report'), partitionBytes: Buffer.from('public partition') };
}

test('first-publication verifier accepts only the fresh distinct report and 200+ store/city cohort with allocation', () => {
  const result = verifyOregonFirstPublication({ ...candidate(), nowMs });
  assert.equal(result.ok, true, result.failures.join('; '));
  assert.deepEqual([result.rows, result.stores, result.cities, result.allocatedRows], [1000, 1000, 1000, 1000]);
  assert.equal(result.receipt.verification, 'first_production_publication');
  assert.equal(result.receipt.workflowRunId, '43614008559');
  assert.equal(result.receipt.sourceReportDate, '11/14/2026');
  assert.equal(result.receipt.sourceReportSha256, currentSha);
  assert.equal(result.receipt.sourceReportFileSha256, createHash('sha256').update('normalized report').digest('hex'));
  assert.equal(result.receipt.partitionSha256, createHash('sha256').update('public partition').digest('hex'));
  assert.deepEqual(result.receipt.rawNormalizedStats.currentProductionRows, { rows: 1000, stores: 1000, cities: 1000, allocatedRows: 1000, unicornRows: 0 });
  assert.equal(result.receipt.productionAlertFlags.eligibleForDelivery, false);
  assert.match(result.receipt.receiptSha256, /^[a-f0-9]{64}$/);
});

test('first-publication baseline remains the prior report when today’s shadow already used the current report', () => {
  assert.equal(oregonPreviousSourceReportSha256({evidence:{shadow:{sourceReportSha256:currentSha,previousSourceReportSha256:oldSha},
    firstPublication:{previousSourceReportSha256:oldSha}}}),oldSha);
});

test('first-publication verifier rejects repeated, stale-date, and alert-enabled reports', () => {
  const repeated = candidate();
  repeated.stateReport.metadata.oregonDailyInventory.sourceReportSha256 = oldSha;
  for (const row of repeated.statePartition.drops) row.sourceProductBinding.reportSha256 = oldSha;
  assert.ok(verifyOregonFirstPublication({ ...repeated, nowMs }).failures.some(reason => reason.includes('previously reviewed')));

  const oldDate = candidate();
  oldDate.stateReport.metadata.oregonDailyInventory.sourceReportDate = '11/13/2026';
  assert.ok(verifyOregonFirstPublication({ ...oldDate, nowMs }).failures.some(reason => reason.includes('current Pacific-date')));

  const alerts = candidate();
  alerts.statePartition.drops[0].eligibleForEmail = true;
  assert.ok(verifyOregonFirstPublication({ ...alerts, nowMs }).failures.some(reason => reason.includes('alert- or delivery-enabled')));
});

test('first-publication verifier fails closed when current coverage falls below held baseline', () => {
  const small = candidate();
  small.statePartition.drops = makeRows(OREGON_FIRST_PUBLICATION_MINIMUMS.rows - 1);
  const result = verifyOregonFirstPublication({ ...small, nowMs });
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(reason => reason.includes('below the held-cohort minimums')));
});

test('first-publication verifier rejects missing normalized source rows and any Oregon alert record', () => {
  const missing = candidate();
  missing.stateReport.signals = [];
  assert.ok(verifyOregonFirstPublication({ ...missing, nowMs }).failures.some(reason => reason.includes('normalized source signals')));

  const alert = candidate();
  alert.alerts.alerts = [{ state: 'OR', eligibleForDelivery: false }];
  assert.ok(verifyOregonFirstPublication({ ...alert, nowMs }).failures.some(reason => reason.includes('alert record')));
});
