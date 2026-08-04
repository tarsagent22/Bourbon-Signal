import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { isSouthCarolinaAllAmericanInventory } from './south-carolina-retailer-policy.mjs';

const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(ENGINE_ROOT, '..');
const ALL_AMERICAN_SOURCE = 'All American Liquor Mauldin WooCommerce in-store availability';
const ALL_AMERICAN_STORE_ID = 'all-american-liquor:all-american-liquor-mauldin';
const expectedAddress = '121 W Butler Rd, Mauldin, SC 29662';

function argValue(name) {
  return process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(name.length + 3) || null;
}

async function readJson(file) {
  return JSON.parse(await readFile(file, 'utf8'));
}

function values(payload, key) {
  const rows = payload?.[key];
  if (!Array.isArray(rows)) throw new Error(`${key} payload is missing an array`);
  return rows;
}

function sourceMatches(row) {
  return String(row?.sourceLabel || row?.source || '') === ALL_AMERICAN_SOURCE;
}

function unique(rows, pick) {
  return new Set(rows.map(pick).filter(Boolean)).size;
}

const report = await readJson(path.join(ENGINE_ROOT, 'out/states/SC.json'));
const drops = values(await readJson(path.join(ENGINE_ROOT, 'out/site/drops.json')), 'drops');
const alerts = values(await readJson(path.join(ENGINE_ROOT, 'out/site/alerts.json')), 'alerts');
const stores = values(await readJson(path.join(ENGINE_ROOT, 'out/site/stores.json')), 'stores');

if (report.state !== 'SC' || report.status !== 'useful') throw new Error(`SC report is not useful (${report.state || 'unknown'}:${report.status || 'unknown'})`);
const sourceRows = (report.signals || []).filter((row) => row.eventType === 'retailer_store_inventory_result' && sourceMatches(row));
if (!sourceRows.length) throw new Error('Forced live SC report produced no All American inventory rows');
if (!sourceRows.every((row) => isSouthCarolinaAllAmericanInventory(row))) throw new Error('All American raw source rows failed exact identity, freshness, or binary-stock policy');

const stateDrops = drops.filter((row) => row.state === 'SC' && row.locationPrecision === 'store_level');
const freshDrops = stateDrops.filter((row) => row.stale !== true && row.sourceStale !== true);
const sourceDrops = freshDrops.filter(sourceMatches);
if (!sourceDrops.length) throw new Error('All American rows did not reach the customer drop contract');
if (!sourceDrops.every((row) => isSouthCarolinaAllAmericanInventory(row) && row.eligibleForOnSite === true)) throw new Error('All American customer drops widened or lost reviewed policy');

const sourceAlerts = alerts.filter((row) => row.state === 'SC' && sourceMatches(row));
if (sourceAlerts.length !== sourceDrops.length) throw new Error(`All American on-site alert projection mismatch (${sourceAlerts.length} alerts for ${sourceDrops.length} drops)`);
if (!sourceAlerts.every((row) => isSouthCarolinaAllAmericanInventory(row)
  && row.eligibleForOnSite === true
  && row.eligibleForEmail === false
  && row.eligibleForSms === false
  && row.gates?.includes('verified_binary_in_store_availability')
  && !row.gates?.includes('verified_binary_orderability'))) {
  throw new Error('All American baseline alert projection is not on-site-only binary inventory');
}

const sourceStores = stores.filter((row) => row.state === 'SC' && sourceMatches(row));
if (sourceStores.length !== 1
  || sourceStores[0].id !== ALL_AMERICAN_STORE_ID
  || sourceStores[0].address !== expectedAddress
  || sourceStores[0].hasSignals !== true) {
  throw new Error('All American exact store export is missing or ambiguous');
}

const alertableStaleRows = stateDrops.filter((row) => row.canAlertAsInventory === true && (row.stale === true || row.sourceStale === true)).length;
if (alertableStaleRows !== 0) throw new Error(`SC export contains ${alertableStaleRows} alertable stale rows`);

const scStores = stores.filter((row) => row.state === 'SC');
const liveRows = freshDrops.filter((row) => row.sourceAvailabilityVerified === true || Number(row.quantity || row.storeQty || 0) > 0);
const alertGradeRows = liveRows.filter((row) => row.canAlertAsInventory === true);
const metrics = {
  capturedAt: new Date().toISOString(),
  state: 'SC',
  knownStores: unique(scStores, (row) => row.id),
  liveStores: unique(liveRows, (row) => row.storeId),
  alertGradeStores: unique(alertGradeRows, (row) => row.storeId),
  representedAreas: unique(liveRows, (row) => row.city || row.area || row.locationName),
  freshExactStoreDrops: freshDrops.length,
  alertableStaleRows,
  allAmerican: {
    sourceRows: sourceRows.length,
    customerDrops: sourceDrops.length,
    onSiteAlerts: sourceAlerts.length,
    storeId: ALL_AMERICAN_STORE_ID,
  },
};

const metricsArg = argValue('metrics');
if (metricsArg) {
  const output = path.resolve(REPO_ROOT, metricsArg);
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(metrics, null, 2)}\n`);
}
console.log(JSON.stringify(metrics, null, 2));
