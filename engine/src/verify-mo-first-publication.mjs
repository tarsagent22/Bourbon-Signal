import { readFile } from 'node:fs/promises';
import { isCentralCityHiveProductionOnSiteSignal } from './central-cityhive-policy.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_BUDGETS } from './central-cityhive-production-config.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_COHORTS, CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from './collectors/central-cityhive-premises.mjs';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';

const EXPECTED_STORES = CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source => source.state === 'MO').map(source => source.storeId);

export function verifyMoFirstPublication({ report, partition, nowMs = Date.now() }) {
  const failures = [];
  const cohort = report?.metadata?.cityhive;
  if (report?.state !== 'MO' || report.stale !== false || report.status !== 'useful') failures.push('MO report is not a fresh useful state report.');
  if (report?.metadata?.allDeliveryDisabled !== true || cohort?.productionAlertDeliveryAllowed !== false) failures.push('MO alert and delivery channels must remain disabled.');
  if (cohort?.complete !== true || cohort.cacheReused === true) failures.push('MO report must contain a complete, live closed cohort.');
  if (JSON.stringify(cohort?.selectedStores) !== JSON.stringify(EXPECTED_STORES)
    || JSON.stringify(cohort?.verifiedPremises) !== JSON.stringify(EXPECTED_STORES)) failures.push('MO report must verify the exact reviewed ten-store roster.');
  const requests = cohort?.requests;
  if (!Array.isArray(requests) || requests.length !== CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.MO.maxRequests
    || new Set(requests.map(request => request.url)).size !== requests.length
    || requests.some(request => request.ok !== true || request.status !== 200)) failures.push('MO report must contain all 20 unique successful bounded requests.');
  for (const source of CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source => source.state === 'MO')) {
    const scoped = (requests || []).filter(request => request.sourceId === source.id);
    if (scoped.length !== 2 || scoped.some(request => {
      try {
        const url = new URL(request.url);
        return url.origin !== source.baseUrl || url.pathname !== '/shop/' || url.searchParams.get('merchant-id') !== source.merchantId;
      } catch { return true; }
    })) failures.push(`MO request profile is not exactly two merchant-scoped searches for ${source.storeId}.`);
  }
  const drops = Array.isArray(partition?.drops) ? partition.drops : [];
  const current = drops.filter(row => row?.state === 'MO'
    && isCentralCityHiveProductionOnSiteSignal(row, { nowMs })
    && isWithinCustomerFreshnessWindow(row, nowMs, { currentInventory: true }));
  const stores = new Set(current.map(row => row.storeId));
  const cities = new Set(current.map(row => row.city));
  const allocated = current.some(row => row.tier === 'allocated' || row.tier === 'unicorn');
  if (current.some(row => row.sourceProductBinding?.productionOnSiteOnly !== true
    || row.sourceProductBinding?.productionCohortSha256 !== CENTRAL_CITYHIVE_PRODUCTION_COHORTS.MO
    || row.sourceProductBinding?.shadowOnly === true)) failures.push('MO rows must carry production cohort bindings, not shadow-only evidence.');
  if (stores.size < 9 || cities.size < 6 || !allocated) failures.push('MO first publication requires at least nine current positive stores across six cities, including allocated or unicorn inventory.');
  if (failures.length) throw new Error(`MO first publication rejected: ${failures.join(' ')}`);
  return { state: 'MO', currentRows: current.length, positiveStores: stores.size, positiveCities: cities.size, hasAllocatedOrUnicorn: allocated, allDeliveryDisabled: true };
}

if (process.argv[1]?.endsWith('verify-mo-first-publication.mjs')) {
  const report = JSON.parse(await readFile('out/states/MO.json', 'utf8'));
  const partition = JSON.parse(await readFile('out/site/states/MO/drops.json', 'utf8'));
  const result = verifyMoFirstPublication({ report, partition });
  console.log(`MO: ${result.currentRows} verified listings across ${result.positiveStores} stores in ${result.positiveCities} cities. Alert delivery disabled.`);
}
