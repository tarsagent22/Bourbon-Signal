import assert from 'node:assert/strict';
import test from 'node:test';
import { OREGON_DAILY_PRODUCTION_COHORT_SHA256, OREGON_DAILY_PRODUCTION_RUNTIME_ID, OREGON_DAILY_INVENTORY_URL } from '../src/oregon-daily-production-policy.mjs';
import { OREGON_FIRST_PUBLICATION_MINIMUMS, verifyOregonFirstPublication } from '../src/verify-oregon-first-publication.mjs';

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
  return { stateReport: { state: 'OR', stale: false, status: 'useful', metadata: { oregonDailyInventory: {
    complete: true, productionAlertDeliveryAllowed: false, sourceUrl: OREGON_DAILY_INVENTORY_URL,
    sourceReportDate: '11/14/2026', sourceReportSha256: currentSha, sourceObservedAt: '2026-11-14T15:32:00.000Z',
  } } }, statePartition: { drops }, alerts: { alerts: [] }, previousSourceReportSha256: oldSha };
}

test('first-publication verifier accepts only the fresh distinct report and 200+ store/city cohort with allocation', () => {
  const result = verifyOregonFirstPublication({ ...candidate(), nowMs });
  assert.equal(result.ok, true, result.failures.join('; '));
  assert.deepEqual([result.rows, result.stores, result.cities, result.allocatedRows], [1000, 1000, 1000, 1000]);
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
