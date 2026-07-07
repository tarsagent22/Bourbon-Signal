#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const failures = [];
const warnings = [];

function readJson(relPath, fallback = null) {
  try { return JSON.parse(readFileSync(path.join(ROOT, relPath), 'utf8')); }
  catch { return fallback; }
}
function asString(value) { return typeof value === 'string' ? value.trim() : ''; }
function fail(message) { failures.push(message); }
function warn(message) { warnings.push(message); }
function normalizeKey(value) {
  return asString(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function compact(parts, sep = ', ') {
  return parts.map(asString).filter(Boolean).filter((part, index, rows) => rows.findIndex((other) => other.toLowerCase() === part.toLowerCase()) === index).join(sep);
}

const alertsPayload = readJson('engine/out/site/alerts.json', { alerts: [] });
const storesPayload = readJson('engine/out/site/stores.json', { stores: [] });
const locationsPayload = readJson('engine/out/site/locations.json', { locations: [] });
const alerts = Array.isArray(alertsPayload.alerts) ? alertsPayload.alerts : [];
const stores = Array.isArray(storesPayload.stores) ? storesPayload.stores : [];
const locations = Array.isArray(locationsPayload.locations) ? locationsPayload.locations : [];
const locationRows = [...stores, ...locations]
  .map((row) => ({
    state: asString(row.state).toUpperCase(),
    name: asString(row.name),
    address: asString(row.address),
    id: asString(row.id),
    sourceStoreId: asString(row.sourceStoreId),
  }))
  .filter((row) => row.state && row.name && row.address);

function locationPrecision(candidate) { return asString(candidate.locationPrecision).toLowerCase(); }
function eventType(candidate) { return asString(candidate.eventType || candidate.type).toLowerCase(); }
function actionability(candidate) { return asString(candidate.actionabilityClass).toLowerCase(); }
function isStoreLevel(candidate) {
  const precision = locationPrecision(candidate);
  const event = eventType(candidate);
  const action = actionability(candidate);
  return precision === 'store_level' || action === 'store_inventory' || /store_inventory|store_allocation|store_delivery|in_stock/.test(event);
}
function isBoardLevel(candidate) {
  const precision = locationPrecision(candidate);
  return /board|warehouse|county/.test(precision) || /board_or_county|warehouse/.test(actionability(candidate));
}
function directAddress(candidate) {
  return asString(candidate.storeAddress || candidate.address || candidate.locationAddress);
}
function lookupAddress(candidate) {
  const state = asString(candidate.state).toUpperCase();
  const names = [candidate.storeName, candidate.locationName, candidate.displayLocation, candidate.boardName].map(normalizeKey).filter(Boolean);
  const ids = [candidate.storeId, candidate.store_id, candidate.locationId].map(normalizeKey).filter(Boolean);
  if (!state || (!names.length && !ids.length)) return '';
  const row = locationRows.find((item) => {
    if (item.state !== state) return false;
    const rowName = normalizeKey(item.name);
    const rowIds = [item.id, item.sourceStoreId].map(normalizeKey).filter(Boolean);
    return names.some((name) => rowName === name || rowName.includes(name) || name.includes(rowName)) || ids.some((id) => rowIds.includes(id));
  });
  return row?.address || '';
}
function candidateAddress(candidate) {
  return directAddress(candidate) || lookupAddress(candidate) || compact([
    candidate.streetAddress || candidate.storeStreet || candidate.address1,
    candidate.storeCity || candidate.city,
    candidate.storeCounty || candidate.county,
    asString(candidate.state).toUpperCase(),
  ]);
}
function subjectLocation(candidate) {
  return asString(candidate.storeName || candidate.locationName || candidate.boardName || candidate.displayLocation || candidate.state || 'your area');
}
function smsPreview(candidate) {
  const bottleName = asString(candidate.bottle || candidate.bottleName || candidate.rawName) || 'Bottle signal';
  const state = asString(candidate.state).toUpperCase();
  const store = subjectLocation(candidate);
  const address = candidateAddress(candidate);
  const label = isStoreLevel(candidate)
    ? (address && !store.toLowerCase().includes(address.toLowerCase()) ? `${store} — ${address}` : address ? store : `${store} — address unavailable; check source before driving`)
    : `${store} — ${locationPrecision(candidate).includes('warehouse') ? 'board/warehouse signal, not a specific store address' : 'board/county signal; check the linked source for receiving stores'}`;
  const qty = Number(candidate.quantity || candidate.warehouseQty || 0);
  const quantity = qty > 0 ? `${qty} bottle${qty === 1 ? '' : 's'} reported` : asString(candidate.availabilityLabel || candidate.availabilityStatus) || 'reported';
  const stateSuffix = state && !new RegExp(`\\b${state.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i').test(label) ? `, ${state}` : '';
  const caveat = isStoreLevel(candidate) ? 'Verify before driving.' : 'Board-level signal; check source before driving.';
  return `Bourbon Signal alert: ${bottleName} at ${label}${stateSuffix}. ${quantity}. ${caveat} Reply STOP to unsubscribe.`.slice(0, 320);
}

const eligible = alerts.filter((candidate) => candidate.eligibleForDelivery === true);
if (!eligible.length) fail('No eligible alert candidates found; cannot verify delivery copy contract.');

let storeLevelCount = 0;
let boardLevelCount = 0;
let resolvedAddressCount = 0;
for (const candidate of eligible) {
  const state = asString(candidate.state).toUpperCase() || '??';
  const bottle = asString(candidate.bottle || candidate.bottleName || candidate.rawName) || 'unknown bottle';
  const sms = smsPreview(candidate);
  if (!/Reply STOP to unsubscribe\.?$/i.test(sms)) fail(`${state} ${bottle}: SMS preview missing STOP unsubscribe copy.`);
  if (/\bjust hit\b/i.test(sms)) fail(`${state} ${bottle}: SMS overpromises with "just hit".`);
  if (/locationPrecision|actionabilityClass|eligibleFor/i.test(sms)) fail(`${state} ${bottle}: SMS leaks internal field names.`);
  if (isStoreLevel(candidate)) {
    storeLevelCount += 1;
    const address = candidateAddress(candidate);
    if (address) resolvedAddressCount += 1;
    if (!address && !/address unavailable; check source before driving/i.test(sms)) fail(`${state} ${bottle}: store-level alert lacks address and missing-address caveat.`);
    if (address && !sms.includes(address)) fail(`${state} ${bottle}: store-level SMS does not include resolved address: ${address}`);
  }
  if (isBoardLevel(candidate)) {
    boardLevelCount += 1;
    if (!/board|warehouse|county|source/i.test(sms)) fail(`${state} ${bottle}: board/county alert lacks board/source caveat.`);
    if (directAddress(candidate)) fail(`${state} ${bottle}: board-level candidate unexpectedly carries storeAddress; verify precision semantics.`);
  }
  if (/shipment|allocation/.test(eventType(candidate)) && /in stock/i.test(sms) && !/inventory/.test(eventType(candidate))) {
    fail(`${state} ${bottle}: shipment/allocation SMS implies in-stock inventory.`);
  }
  if (sms.length > 320) fail(`${state} ${bottle}: SMS preview exceeds 320 chars after truncation guard.`);
}

if (storeLevelCount && resolvedAddressCount / storeLevelCount < 0.8) {
  warn(`Only ${resolvedAddressCount}/${storeLevelCount} store-level alert candidates resolved to addresses.`);
}

const result = {
  ok: failures.length === 0,
  checkedAt: new Date().toISOString(),
  candidateCount: alerts.length,
  eligibleCount: eligible.length,
  storeLevelCount,
  boardLevelCount,
  resolvedAddressCount,
  warnings,
  failures,
  sampleSms: eligible.slice(0, 5).map((candidate) => smsPreview(candidate)),
};

if (process.argv.includes('--json')) console.log(JSON.stringify(result, null, 2));
else {
  console.log(`Alert copy contract: ${result.ok ? 'passed' : 'failed'} (${eligible.length} eligible, ${resolvedAddressCount}/${storeLevelCount} store-level addresses resolved)`);
  for (const warning of warnings) console.warn(`warning: ${warning}`);
  for (const failure of failures) console.error(`failure: ${failure}`);
}
if (failures.length) process.exit(1);
