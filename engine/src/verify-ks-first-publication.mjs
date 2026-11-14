import { readFile } from 'node:fs/promises';
import { isCentralCityHiveProductionOnSiteSignal } from './central-cityhive-policy.mjs';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from './collectors/central-cityhive-premises.mjs';

export function verifyKansasFirstPublication(report, partition, { nowMs = Date.now() } = {}) {
  const sources = CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source => source.state === 'KS');
  const cohort = report?.metadata?.cityhive;
  const current = (partition?.drops || []).filter(row => row.state === 'KS'
    && isCentralCityHiveProductionOnSiteSignal(row, { nowMs })
    && isWithinCustomerFreshnessWindow(row, nowMs, { currentInventory: true }));
  const stores = new Set(current.map(row => row.storeId));
  const cities = new Set(current.map(row => row.city));
  const hasAllocated = current.some(row => ['allocated', 'unicorn'].includes(row.tier));
  const expected = sources.map(source => source.storeId);
  const completeExpectedCohort = JSON.stringify(cohort?.selectedStores) === JSON.stringify(expected)
    && JSON.stringify(cohort?.verifiedPremises) === JSON.stringify(expected);
  const allSilent = current.every(row => row.canAlertAsInventory === false && row.canAlertAsWatch === false
    && row.alertable !== true && row.eligibleForDelivery === false && row.deliveryEligible !== true
    && row.eligibleForEmail === false && row.eligibleForSms === false);

  if (report?.stale !== false || report?.status !== 'useful' || cohort?.complete !== true
    || cohort.cacheReused === true || report?.metadata?.allDeliveryDisabled !== true
    || !completeExpectedCohort || stores.size !== expected.length || cities.size < 3
    || !expected.every(store => stores.has(store)) || !hasAllocated || !allSilent) {
    throw new Error('Kansas first publication requires a fresh closed three-store pickup cohort, allocated inventory in all three cities, and fully disabled delivery.');
  }
  return { listingCount: current.length, storeCount: stores.size, cities: [...cities].sort() };
}

if (process.argv[1]?.endsWith('verify-ks-first-publication.mjs')) {
  const report = JSON.parse(await readFile('out/states/KS.json', 'utf8'));
  const partition = JSON.parse(await readFile('out/site/states/KS/drops.json', 'utf8'));
  const result = verifyKansasFirstPublication(report, partition);
  console.log(`KS: ${result.listingCount} verified listings across ${result.storeCount} stores in ${result.cities.length} cities. Alert delivery disabled.`);
}
