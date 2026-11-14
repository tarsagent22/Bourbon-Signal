import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { isCentralCityHiveProductionOnSiteSignal } from './central-cityhive-policy.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_BUDGETS } from './central-cityhive-production-config.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_COHORTS, CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from './collectors/central-cityhive-premises.mjs';
import { BourbonBible } from './core/bible.mjs';
import { libraryIdentityKey } from './core/library-catalog.mjs';
import { librarySearchPool } from './library-query-plan.mjs';
import { centralCityHiveAllocatedQueryFilter } from './collectors/central-cityhive-market-policy.mjs';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';

const EXPECTED_STORES = CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source => source.state === 'MO').map(source => source.storeId);

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const allocationTiers = new Set(['allocated', 'unicorn']);
const identity = row => JSON.stringify([row?.storeId, row?.productId, row?.optionId || row?.variantId,
  row?.sourceProductBinding?.observedAt || row?.observedAt, row?.canonicalBottleId, row?.tier]);

export function verifyMoFirstPublication({ report, partition, reportBytes, partitionBytes, bible, nowMs = Date.now(), workflowRunId = process.env.GITHUB_RUN_ID }) {
  const failures = [];
  const cohort = report?.metadata?.cityhive;
  if (report?.state !== 'MO' || report.stale !== false || report.status !== 'useful') failures.push('MO report is not a fresh useful state report.');
  if (!/^[0-9]+$/.test(String(workflowRunId || ''))) failures.push('first-publication receipt requires its hosted refresh workflow run id.');
  if (report?.metadata?.allDeliveryDisabled !== true || cohort?.productionAlertDeliveryAllowed !== false) failures.push('MO alert and delivery channels must remain disabled.');
  if (cohort?.complete !== true || cohort.cacheReused === true) failures.push('MO report must contain a complete, live closed cohort.');
  if (JSON.stringify(cohort?.selectedStores) !== JSON.stringify(EXPECTED_STORES)
    || JSON.stringify(cohort?.verifiedPremises) !== JSON.stringify(EXPECTED_STORES)) failures.push('MO report must verify the exact reviewed ten-store roster.');
  const requests = Array.isArray(cohort?.requests) ? cohort.requests : [];
  const allocatedFilter = centralCityHiveAllocatedQueryFilter(bible, 'MO');
  const indexedTerms = new Set(librarySearchPool(bible || {records: []}).filter(allocatedFilter).map(libraryIdentityKey));
  const allocatedSearches = [];
  if (requests.length !== CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.MO.maxRequests
    || new Set(requests.map(request => request.url)).size !== requests.length
    || requests.some(request => request.ok !== true || request.status !== 200)) failures.push('MO report must contain all 20 unique successful bounded requests.');
  for (const source of CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source => source.state === 'MO')) {
    const scoped = requests.filter(request => request.sourceId === source.id);
    const terms = scoped.map(request => {
      const url = URL.parse(request.url);
      const term = url?.searchParams.get('ch-query');
      return url?.origin === source.baseUrl && url.pathname === '/shop/' && !url.hash && !url.username && !url.password
        && [...url.searchParams].length === 2 && url.searchParams.get('merchant-id') === source.merchantId
        && term?.trim() && term.length <= 120 ? libraryIdentityKey(term) : null;
    });
    const priority = libraryIdentityKey(source.prioritySearchTerm || 'barrel proof');
    if (terms.length !== 2 || terms.some(term => !term) || new Set(terms).size !== 2 || !terms.includes(priority)) {
      failures.push(`MO request profile is not exactly two reviewed merchant-scoped searches for ${source.storeId}.`);
      continue;
    }
    const term = terms.find(value => value !== priority);
    if (indexedTerms.has(term)) allocatedSearches.push({ storeId: source.storeId, term });
  }
  const reportClock = Date.parse(cohort?.sourceObservedAt || '');
  const reportStart = Date.parse(report?.startedAt || '');
  const reportFinish = Date.parse(report?.finishedAt || '');
  const sourceRows = Array.isArray(report?.signals) ? report.signals : [];
  const clocks = sourceRows.map(row => Date.parse(row?.sourceProductBinding?.observedAt || row?.observedAt || '')).filter(Number.isFinite);
  const oldestInCohortClock = clocks.length ? Math.min(...clocks) : NaN;
  if (!Number.isFinite(reportClock) || reportClock < reportStart || reportClock > reportFinish
    || !Number.isFinite(oldestInCohortClock) || oldestInCohortClock !== reportClock
    || sourceRows.some(row => (row?.sourceProductBinding?.observedAt || row?.observedAt) !== cohort?.sourceObservedAt)
    || report?.lastGoodAt !== cohort?.sourceObservedAt) failures.push('oldest in-cohort source clock must equal the original source observation time inside this report window.');
  const drops = Array.isArray(partition?.drops) ? partition.drops : [];
  if (partition?.state !== 'MO' || partition?.count !== drops.length) failures.push('MO public partition must be the exact state-tagged rows that will be hashed into the receipt.');
  const isCurrentPickup = row => row?.state === 'MO'
    && isCentralCityHiveProductionOnSiteSignal(row, { nowMs })
    && isWithinCustomerFreshnessWindow(row, nowMs, { currentInventory: true });
  const sourceIdentities = new Set(sourceRows.map(identity));
  if (sourceRows.some(row => !isCurrentPickup(row))) failures.push('MO source report contains unverified or expired pickup rows.');
  const current = drops.filter(row => isCurrentPickup(row) && sourceIdentities.has(identity(row)));
  if (current.length !== drops.length) failures.push('MO partition contains pickup rows absent from the current source report.');
  const stores = new Set(current.map(row => row.storeId));
  const cities = new Set(current.map(row => row.city));
  const allocatedRows = current.filter(row => allocationTiers.has(row.tier)).length;
  if (current.some(row => row.sourceProductBinding?.productionOnSiteOnly !== true
    || row.sourceProductBinding?.productionCohortSha256 !== CENTRAL_CITYHIVE_PRODUCTION_COHORTS.MO
    || row.sourceProductBinding?.shadowOnly === true)) failures.push('MO rows must carry production cohort bindings, not shadow-only evidence.');
  if (stores.size < 9 || cities.size < 6) failures.push('MO first publication requires at least nine current positive stores across six cities.');
  if (allocatedSearches.length !== EXPECTED_STORES.length) {
    failures.push('MO first publication requires successful indexed allocated searches at every reviewed store.');
  }
  if (failures.length) throw new Error(`MO first publication rejected: ${failures.join(' ')}`);
  const result = { state: 'MO', currentRows: current.length, positiveStores: stores.size, positiveCities: cities.size, hasAllocatedOrUnicorn: allocatedRows > 0, allocatedRows, allocatedSearchStores: allocatedSearches.length, allDeliveryDisabled: true };
  if (!reportBytes || !partitionBytes) return result;
  const receipt = { schemaVersion: 1, state: 'MO', verification: 'first_production_publication', workflowRunId: String(workflowRunId),
    verifiedAt: new Date(nowMs).toISOString(), sourceRuntimeId: 'mo:central-cityhive',
    cohortSha256: CENTRAL_CITYHIVE_PRODUCTION_COHORTS.MO,
    oldestInCohortSourceObservedAt: new Date(oldestInCohortClock).toISOString(),
    reportSha256: sha256(reportBytes), partitionSha256: sha256(partitionBytes),
    publishedRows: drops.length, currentRows: current.length, positiveStores: stores.size, positiveCities: cities.size,
    hasAllocatedOrUnicorn: allocatedRows > 0, allocatedRows, allocatedSearchStores: allocatedSearches.length, allocatedSearches, allDeliveryChannelsDisabled: true };
  receipt.receiptSha256 = sha256(Buffer.from(JSON.stringify(receipt)));
  return { ...result, receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const report = JSON.parse(await readFile('out/states/MO.json', 'utf8'));
  const reportBytes = await readFile('out/states/MO.json');
  const partitionBytes = await readFile('out/site/states/MO/drops.json');
  const partition = JSON.parse(partitionBytes.toString('utf8'));
  const bible = await BourbonBible.load();
  const result = verifyMoFirstPublication({ report, partition, reportBytes, partitionBytes, bible });
  const output = 'out/first-publication/MO.json';
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(result.receipt, null, 2)}\n`, { flag: 'wx' });
  console.log(JSON.stringify({ ok: true, state: 'MO', receipt: output, receiptSha256: result.receipt.receiptSha256 }));
}
