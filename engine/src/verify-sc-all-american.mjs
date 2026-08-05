import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { buildAlerts } from './export-site-contract.mjs';
import {
  hasSouthCarolinaAllAmericanRawSourceProof,
  isSouthCarolinaAllAmericanInventory,
  isSouthCarolinaAllAmericanLocation,
  isSouthCarolinaAllAmericanSignal,
  isSouthCarolinaAllAmericanStoreExport,
} from './south-carolina-retailer-policy.mjs';
import { verifyAllAmericanAlertProjection } from './verify-sc-all-american-alert-projection.mjs';

const ENGINE_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = path.resolve(ENGINE_ROOT, '..');
const ALL_AMERICAN_STORE_ID = 'all-american-liquor:all-american-liquor-mauldin';

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

function unique(rows, pick) {
  return new Set(rows.map(pick).filter(Boolean)).size;
}

const report = await readJson(path.join(ENGINE_ROOT, 'out/states/SC.json'));
const drops = values(await readJson(path.join(ENGINE_ROOT, 'out/site/drops.json')), 'drops');
const alerts = values(await readJson(path.join(ENGINE_ROOT, 'out/site/alerts.json')), 'alerts');
const stores = values(await readJson(path.join(ENGINE_ROOT, 'out/site/stores.json')), 'stores');
const alertCandidates = values(await readJson(path.join(ENGINE_ROOT, 'out/alert-candidates.json')), 'candidates');

if (report.state !== 'SC' || report.status !== 'useful') throw new Error(`SC report is not useful (${report.state || 'unknown'}:${report.status || 'unknown'})`);
const allAmericanReportRows = (report.signals || []).filter(isSouthCarolinaAllAmericanSignal);
const sourceRows = allAmericanReportRows.filter((row) => row.eventType === 'retailer_store_inventory_result');
const sourceLocationRows = allAmericanReportRows.filter((row) => row.eventType === 'retailer_store_location');
if (sourceRows.length + sourceLocationRows.length !== allAmericanReportRows.length) {
  throw new Error('All American report contains an unrecognized or malformed event type');
}
if (!sourceRows.length) throw new Error('Forced live SC report produced no All American inventory rows');
if (!sourceRows.every((row) => isSouthCarolinaAllAmericanInventory(row)
  && hasSouthCarolinaAllAmericanRawSourceProof(row))) {
  throw new Error('All American raw source rows failed exact identity, raw proof, freshness, or binary-stock policy');
}
if (sourceLocationRows.length !== 1 || !sourceLocationRows.every(isSouthCarolinaAllAmericanLocation)) {
  throw new Error('All American source location row is missing or malformed');
}

const stateDrops = drops.filter((row) => row.state === 'SC' && row.locationPrecision === 'store_level');
const freshDrops = stateDrops.filter((row) => row.stale !== true && row.sourceStale !== true);
const sourceDrops = drops.filter(isSouthCarolinaAllAmericanSignal);
if (!sourceDrops.length) throw new Error('All American rows did not reach the customer drop contract');
if (!sourceDrops.every((row) => row.state === 'SC'
  && row.locationPrecision === 'store_level'
  && row.stale !== true
  && row.sourceStale !== true
  && isSouthCarolinaAllAmericanInventory(row)
  && row.eligibleForOnSite === true)) {
  throw new Error('All American customer drops widened or lost reviewed policy');
}

const sourceAlerts = alerts.filter(isSouthCarolinaAllAmericanSignal);
if (!sourceAlerts.every((row) => isSouthCarolinaAllAmericanInventory(row)
  && row.eligibleForOnSite === true
  && row.eligibleForEmail === false
  && row.eligibleForSms === false
  && row.gates?.includes('verified_binary_in_store_availability')
  && !row.gates?.includes('verified_binary_orderability'))) {
  throw new Error('All American baseline alert projection is not on-site-only binary inventory');
}
const expectedAdditionalChangeRows = buildAlerts({ candidates: alertCandidates })
  .filter(isSouthCarolinaAllAmericanSignal);
const { currentInventoryAlerts, additionalChangeAlerts } = verifyAllAmericanAlertProjection({
  sourceDrops,
  sourceAlerts,
  sourceInventoryRows: sourceRows,
  expectedAdditionalChangeRows,
});

const sourceStores = stores.filter(isSouthCarolinaAllAmericanSignal);
if (sourceStores.length !== 1 || !sourceStores.every(isSouthCarolinaAllAmericanStoreExport)) {
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
    onSiteAlerts: currentInventoryAlerts.length,
    firstRunChangeAlerts: additionalChangeAlerts,
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
