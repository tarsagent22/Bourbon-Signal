import { readFile } from 'node:fs/promises';
import { isCentralCityHiveProductionOnSiteSignal } from './central-cityhive-policy.mjs';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';

const report = JSON.parse(await readFile('out/states/RI.json', 'utf8'));
const partition = JSON.parse(await readFile('out/site/states/RI/drops.json', 'utf8'));
const nowMs = Date.now();
const cohort = report.metadata?.cityhive;
const current = partition.drops.filter(row => row.state === 'RI'
  && isCentralCityHiveProductionOnSiteSignal(row, { nowMs })
  && isWithinCustomerFreshnessWindow(row, nowMs, { currentInventory: true }));
const stores = new Set(current.map(row => row.storeId));
const cities = new Set(current.map(row => row.city));
const hasAllocated = current.some(row => row.tier === 'allocated' || row.tier === 'unicorn');

if (report.stale !== false || report.status !== 'useful' || cohort?.complete !== true
  || cohort.cacheReused === true || report.metadata.allDeliveryDisabled !== true
  || cohort.verifiedPremises?.length !== 3 || ![...stores].every(store => cohort.verifiedPremises.includes(store))
  || stores.size < 3 || cities.size < 2 || !hasAllocated) {
  throw new Error('Rhode Island first publication requires a fresh closed pickup cohort, with allocated inventory and current listings at all three stores across at least two cities.');
}

console.log(`RI: ${current.length} verified listings across ${stores.size} stores in ${cities.size} cities. Alert delivery disabled.`);
