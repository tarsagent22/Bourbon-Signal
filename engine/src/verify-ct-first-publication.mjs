import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';
import { centralCityHiveProductionCohortKey, CENTRAL_CITYHIVE_PRODUCTION_BUDGETS } from './central-cityhive-production-config.mjs';
import { CENTRAL_CITYHIVE_PRODUCTION_SOURCES } from './collectors/central-cityhive-premises.mjs';
import { isCentralCityHiveProductionOnSiteSignal } from './central-cityhive-policy.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const sources = CENTRAL_CITYHIVE_PRODUCTION_SOURCES.filter(source => source.state === 'CT');
const cohort = centralCityHiveProductionCohortKey('CT');
const premiseIds = sources.map(source => source.storeId);
const identity = row => JSON.stringify([row.storeId, row.productId, row.optionId || row.variantId,
  row.observedAt, row.canonicalBottleId]);

function matchesMerchantProfile(rows, source) {
  const requests = rows.filter(row => row.sourceId === source.id);
  const priorityTerms = source.prioritySearchTerms || [source.prioritySearchTerm];
  if (requests.length !== priorityTerms.length + 1) return false;
  const terms = requests.map(row => {
    const url = URL.parse(row.url);
    if (row.status !== 200 || row.ok !== true || url?.origin !== source.baseUrl || url.pathname !== '/shop/'
      || url.username || url.password || url.hash || [...url.searchParams].length !== 2
      || url.searchParams.get('merchant-id') !== source.merchantId) return null;
    return url.searchParams.get('ch-query');
  });
  return terms.every(term => term?.trim() && term.length <= 120)
    && new Set(terms).size === terms.length && priorityTerms.every(term => terms.includes(term));
}

export function verifyConnecticutFirstPublication({ report, partition, locations, reportBytes, partitionBytes,
  nowMs = Date.now(), workflowRunId = process.env.GITHUB_RUN_ID } = {}) {
  const failures = [], metadata = report?.metadata?.cityhive;
  if (report?.state !== 'CT' || report.status !== 'useful' || report.stale !== false || metadata?.complete !== true
    || metadata.cacheReused === true || metadata.exhaustiveCatalogVerified !== false || metadata.cohortKey !== cohort
    || report?.metadata?.allDeliveryDisabled !== true || metadata?.productionAlertDeliveryAllowed !== false) {
    failures.push('Connecticut requires a fresh complete production pickup report and disabled delivery.');
  }
  const verified = metadata?.verifiedPremises || [];
  const requests = metadata?.requests || [];
  if (JSON.stringify(metadata?.selectedStores) !== JSON.stringify(premiseIds) || verified.length !== premiseIds.length
    || premiseIds.some(id => !verified.includes(id)) || requests.length !== CENTRAL_CITYHIVE_PRODUCTION_BUDGETS.CT.maxRequests
    || !sources.every(source => matchesMerchantProfile(requests, source))) {
    failures.push('Connecticut requires all seven reviewed merchants and exactly fifteen merchant-scoped successful requests.');
  }
  const clock = Date.parse(metadata?.sourceObservedAt || '');
  if (!Number.isFinite(clock) || clock < Date.parse(report?.startedAt || '') || clock > Date.parse(report?.finishedAt || '')
    || metadata?.sourceObservedAt !== report?.lastGoodAt || !/^[0-9]+$/.test(String(workflowRunId || ''))) {
    failures.push('Connecticut receipt requires the original source clock from the hosted production run.');
  }
  const signals = report?.signals || [], drops = partition?.drops || [];
  const identities = new Set(signals.map(identity));
  const accepts = row => row.state === 'CT' && isCentralCityHiveProductionOnSiteSignal(row, { nowMs });
  if (!signals.length || signals.some(row => !accepts(row) || row.observedAt !== metadata?.sourceObservedAt)
    || partition?.state !== 'CT' || partition.count !== drops.length || !drops.length
    || drops.some(row => !accepts(row) || !identities.has(identity(row)))) {
    failures.push('Connecticut requires current source-bound pickup rows in the candidate public partition.');
  }
  if (!sources.every(source => locations?.locations?.some(location => location.state === 'CT'
    && location.id === source.storeId && location.address === source.address && location.city === source.city))) {
    failures.push('Connecticut Finder is missing a reviewed merchant address.');
  }
  if (failures.length) return { ok: false, failures };
  const receipt = { state: 'CT', workflowRunId, cohortSha256: cohort, observedAt: metadata.sourceObservedAt,
    publishedRows: drops.length, publishedStores: new Set(drops.map(row => row.storeId)).size,
    verifiedPremises: verified, allDeliveryChannelsDisabled: true,
    reportSha256: hash(reportBytes || JSON.stringify(report)), partitionSha256: hash(partitionBytes || JSON.stringify(partition)) };
  return { ok: true, failures, receipt };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [reportBytes, partitionBytes, locationBytes] = await Promise.all(
    ['out/states/CT.json', 'out/site/states/CT/drops.json', 'out/site/locations.json'].map(file => readFile(file)),
  );
  const result = verifyConnecticutFirstPublication({ report: JSON.parse(reportBytes), partition: JSON.parse(partitionBytes),
    locations: JSON.parse(locationBytes), reportBytes, partitionBytes });
  if (!result.ok) throw Error(result.failures.join('\n'));
  await mkdir('out/first-publication', { recursive: true });
  await writeFile('out/first-publication/CT.json', JSON.stringify(result.receipt, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(result.receipt));
}
