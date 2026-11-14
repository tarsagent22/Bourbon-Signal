import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { BourbonBible } from './core/bible.mjs';
import { libraryDetectionQueries } from './library-query-plan.mjs';
import { isWithinCustomerFreshnessWindow } from './customer-drop-freshness.mjs';
import { WYOMING_GROCERY_STORES, WYOMING_GROCERY_HOST, isWyomingGroceryProductionInventory } from './wyoming-grocery-policy.mjs';

const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const key = row => JSON.stringify([row.storeId, row.productId, row.variantId, row.canonicalBottleId, row.observedAt]);

export function verifyWyomingFirstPublication(report, partition, bible, { nowMs = Date.now() } = {}) {
  const inventory = report?.metadata?.grocery;
  const rows = partition?.drops;
  const knownStores = WYOMING_GROCERY_STORES.map(store => store.storeId);
  const searchableTerms = new Set(libraryDetectionQueries(bible).map(term => term.toLowerCase()));
  const plannedTerms = (inventory?.indexedSearchPlan?.terms || []).map(term => term.toLowerCase());
  if (report?.state !== 'WY' || report.stale !== false || report.status !== 'useful'
    || report.metadata?.allDeliveryDisabled !== true || inventory?.complete !== true
    || JSON.stringify(inventory.verifiedPremises) !== JSON.stringify(knownStores)
    || !Array.isArray(inventory.receipts) || inventory.receipts.length !== knownStores.length * 3
    || new Set(plannedTerms).size !== knownStores.length || !plannedTerms.every(term => searchableTerms.has(term))) {
    throw new Error('Wyoming first publication requires a new complete closed-roster observation and indexed query plan');
  }
  const unconfirmed = new Set((inventory.unconfirmedQueries || []).map(row => `${row.storeId}|${row.term}`));
  const completedSearches = [];
  for (const store of WYOMING_GROCERY_STORES) {
    const receipts = inventory.receipts.filter(receipt => receipt.storeId === store.storeId);
    const locator = receipts.find(receipt => receipt.term === null);
    const broad = receipts.find(receipt => receipt.term === 'bourbon');
    const indexed = receipts.find(receipt => plannedTerms.includes(receipt.term));
    if (receipts.length !== 3 || locator?.url !== store.locator || !broad || !indexed || receipts.some(receipt => {
      const clock = Date.parse(receipt.observedAt);
      return receipt.status !== 200 || receipt.url !== receipt.finalUrl || !/^[a-f\d]{64}$/.test(receipt.sha256)
        || !Number.isFinite(clock) || clock < Date.parse(report.startedAt) || clock > Date.parse(report.finishedAt) || clock > nowMs;
    }) || [broad, indexed].some(receipt => {
      const url = URL.parse(receipt.url);
      return url?.origin !== `https://${WYOMING_GROCERY_HOST}` || url.pathname !== '/abs/pub/xapi/search/substitute'
        || url.searchParams.get('storeid') !== store.merchantId || url.searchParams.get('q') !== receipt.term
        || url.searchParams.get('channel') !== 'instore';
    })) throw new Error(`Wyoming first publication lost the retailer request proof for ${store.storeId}`);
    completedSearches.push({ storeId: store.storeId, term: indexed.term,
      confirmed: !unconfirmed.has(`${store.storeId}|${indexed.term}`), observedAt: indexed.observedAt });
  }
  const source = new Set((report.signals || []).filter(isWyomingGroceryProductionInventory).map(key));
  if (partition?.state !== 'WY' || !Array.isArray(rows) || partition.count !== rows.length
    || rows.some(row => !source.has(key(row)) || !isWyomingGroceryProductionInventory(row)
      || !isWithinCustomerFreshnessWindow(row, nowMs, { currentInventory: true }))) {
    throw new Error('Wyoming first publication changed the exact source rows or their original clocks');
  }
  const positiveStores = new Set(rows.map(row => row.storeId));
  const cities = new Set(rows.map(row => row.city));
  if (positiveStores.size < 3 || cities.size < 3 || !completedSearches.some(row => row.confirmed)) {
    throw new Error('Wyoming first publication requires current inventory in three cities and confirmed indexed query coverage');
  }
  return { state: 'WY', publishedRows: rows.length, positiveStores: positiveStores.size, cities: [...cities],
    allocatedRows: rows.filter(row => ['allocated','unicorn'].includes(row.tier)).length, allDeliveryChannelsDisabled: true,
    checkedStores: knownStores, indexedSearches: completedSearches, firstObservedAt: report.startedAt, lastObservedAt: report.finishedAt };
}

async function main() {
  if (!/^\d+$/.test(process.env.GITHUB_RUN_ID || '')) throw new Error('Wyoming first publication requires a workflow run identity');
  const [reportBytes, partitionBytes] = await Promise.all([readFile('out/states/WY.json'), readFile('out/site/states/WY/drops.json')]);
  const receipt = verifyWyomingFirstPublication(JSON.parse(reportBytes), JSON.parse(partitionBytes), await BourbonBible.load());
  await mkdir('out/first-publication', { recursive: true });
  await writeFile('out/first-publication/WY.json', JSON.stringify({ ...receipt, workflowRunId: process.env.GITHUB_RUN_ID,
    sourceReportSha256: sha(reportBytes), partitionSha256: sha(partitionBytes) }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify(receipt));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
