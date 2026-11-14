import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BourbonBible } from './core/bible.mjs';
import { libraryIdentityKey } from './core/library-catalog.mjs';
import { librarySearchPool } from './library-query-plan.mjs';
import { centralCityHiveAllocatedQueryFilter } from './collectors/central-cityhive-market-policy.mjs';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';
import { NORTH_DAKOTA_CITYHIVE_RUNTIME, NORTH_DAKOTA_GROCERY_RUNTIME,
  isNorthDakotaAlbertsonsProductionInventory, isNorthDakotaCityHiveProductionInventory }
  from './collectors/north-dakota-retail-production.mjs';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const rowIdentity = row => JSON.stringify([row.storeId, row.productId, row.variantId, row.canonicalBottleId, row.price, row.observedAt]);
const productionInventory = (row, nowMs) => isNorthDakotaCityHiveProductionInventory(row, { nowMs })
  || isNorthDakotaAlbertsonsProductionInventory(row, { nowMs });

export function verifyNorthDakotaFirstPublication(report, partition, bible, { nowMs = Date.now() } = {}) {
  const observations = report?.metadata?.sourceObservations;
  const rock = observations?.[NORTH_DAKOTA_CITYHIVE_RUNTIME];
  const williston = observations?.[NORTH_DAKOTA_GROCERY_RUNTIME];
  if (report?.state !== 'ND' || report.status !== 'useful' || report.stale !== false
    || report.metadata?.complete !== true || report.metadata?.allDeliveryDisabled !== true
    || report.metadata?.requestCount !== 5 || Object.keys(observations ?? {}).length !== 2
    || rock?.complete !== true || rock.receipts?.length !== 2
    || williston?.complete !== true || williston.receipts?.length !== 3
    || rock.requests?.length !== 2 || williston.plan?.terms?.length !== 1) {
    throw new Error('North Dakota first publication requires both complete production retailer observations');
  }
  const start = Date.parse(report.startedAt), finish = Date.parse(report.finishedAt);
  if (!(start <= finish && finish <= nowMs)) throw new Error('North Dakota production run has invalid timestamps');
  for (const receipt of [...rock.receipts, ...williston.receipts]) {
    const clock = Date.parse(receipt.observedAt);
    if (receipt.status !== 200 || !receipt.url || !receipt.finalUrl || !/^[a-f0-9]{64}$/.test(receipt.sha256 ?? '')
      || !Number.isSafeInteger(receipt.bytes) || receipt.bytes < 1 || !(start <= clock && clock <= finish)) {
      throw new Error('North Dakota retail request receipt did not preserve its first-party observation clock or hash');
    }
  }
  const terms = [new URL(rock.requests[1].url).searchParams.get('ch-query'), williston.receipts[2].term];
  const indexed = new Set(librarySearchPool(bible).filter(centralCityHiveAllocatedQueryFilter(bible, 'ND')).map(libraryIdentityKey));
  if (!terms.every(term => term && indexed.has(libraryIdentityKey(term)))
    || libraryIdentityKey(terms[1]) !== libraryIdentityKey(williston.plan.terms[0])) {
    throw new Error('North Dakota first publication requires one indexed query against each exact retailer');
  }
  const rows = partition?.drops;
  const verifiedSourceRows = new Set((report.signals ?? []).filter(row => productionInventory(row, nowMs)).map(rowIdentity));
  if (partition?.state !== 'ND' || !Array.isArray(rows) || partition.count !== rows.length
    || rows.some(row => !verifiedSourceRows.has(rowIdentity(row)) || !productionInventory(row, nowMs)
      || !isWithinCustomerFreshnessWindow(row, nowMs, { currentInventory: true }))) {
    throw new Error('North Dakota customer rows changed exact store, product, price or source time');
  }
  const cities = new Set(rows.map(row => row.city));
  const storeIds = new Set(rows.map(row => row.storeId));
  if (cities.size !== 2 || !cities.has('Grand Forks') || !cities.has('Williston') || storeIds.size !== 2
    || new Set(rows.map(row => row.sourceRuntimeId)).size !== 2) {
    throw new Error('North Dakota first publication requires a current exact retailer result in both cities');
  }
  return { state: 'ND', publishedRows: rows.length, publishedStores: storeIds.size,
    checkedStoreIds: [...storeIds], cities: [...cities], allDeliveryChannelsDisabled: true,
    indexedSearches: [{ sourceRuntimeId: NORTH_DAKOTA_CITYHIVE_RUNTIME, term: terms[0], observedAt: rock.receipts[1].observedAt },
      { sourceRuntimeId: NORTH_DAKOTA_GROCERY_RUNTIME, term: terms[1], observedAt: williston.receipts[2].observedAt,
        confirmed: !williston.unconfirmedQueries?.includes(terms[1]) }], firstObservedAt: report.startedAt, lastObservedAt: report.finishedAt };
}

async function main() {
  if (!/^\d+$/.test(process.env.GITHUB_RUN_ID || '')) throw new Error('North Dakota publication requires a workflow identity');
  const [reportBytes, partitionBytes] = await Promise.all([readFile('out/states/ND.json'), readFile('out/site/states/ND/drops.json')]);
  const receipt = verifyNorthDakotaFirstPublication(JSON.parse(reportBytes), JSON.parse(partitionBytes), await BourbonBible.load());
  await mkdir('out/first-publication', { recursive: true });
  await writeFile('out/first-publication/ND.json', JSON.stringify({ ...receipt, workflowRunId: process.env.GITHUB_RUN_ID,
    sourceReportSha256: digest(reportBytes), partitionSha256: digest(partitionBytes) }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
