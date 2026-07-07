#!/usr/bin/env node
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const ROOT = process.cwd();
const SITE_OUT = path.resolve(ROOT, 'out', 'site');
const OUT_FILE = path.join(SITE_OUT, 'store-identity.json');
const failures = [];
const warnings = [];

async function readJson(file, fallback) {
  try { return JSON.parse(await readFile(file, 'utf8')); } catch { return fallback; }
}
function asString(value) { return typeof value === 'string' ? value.trim() : ''; }
function norm(value) { return asString(value).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim(); }
function keyFor(state, name, address, sourceStoreId, id) {
  const strong = norm(sourceStoreId || id);
  if (state && strong) return `${state}|id|${strong}`;
  return `${state}|nameaddr|${norm(name)}|${norm(address)}`;
}
function mergeIdentity(target, row) {
  target.aliases = Array.from(new Set([...target.aliases, ...row.aliases].filter(Boolean))).sort();
  target.sourceIds = Array.from(new Set([...target.sourceIds, ...row.sourceIds].filter(Boolean))).sort();
  target.sources = Array.from(new Set([...target.sources, ...row.sources].filter(Boolean))).sort();
  target.addresses = Array.from(new Set([...target.addresses, ...row.addresses].filter(Boolean))).sort();
  target.cities = Array.from(new Set([...target.cities, ...row.cities].filter(Boolean))).sort();
  target.counties = Array.from(new Set([...target.counties, ...row.counties].filter(Boolean))).sort();
  target.zips = Array.from(new Set([...target.zips, ...row.zips].filter(Boolean))).sort();
  target.signalCount += row.signalCount;
  target.lastSignalAt = [target.lastSignalAt, row.lastSignalAt].filter(Boolean).sort().at(-1) || null;
  if (target.lat == null && row.lat != null) target.lat = row.lat;
  if (target.lng == null && row.lng != null) target.lng = row.lng;
}
function toIdentity(row, origin) {
  const state = asString(row.state).toUpperCase();
  const name = asString(row.name || row.storeName || row.locationName);
  const address = asString(row.address || row.storeAddress);
  const id = asString(row.id || row.storeId);
  const sourceStoreId = asString(row.sourceStoreId || row.storeId || row.store_id);
  const identity = {
    identityKey: keyFor(state, name, address, sourceStoreId, id),
    state,
    primaryName: name,
    primaryAddress: address || null,
    aliases: [name].filter(Boolean),
    addresses: [address].filter(Boolean),
    sourceIds: [sourceStoreId, id].filter(Boolean),
    sources: [asString(row.source || origin)].filter(Boolean),
    cities: [asString(row.city || row.storeCity)].filter(Boolean),
    counties: [asString(row.county || row.storeCounty)].filter(Boolean),
    zips: [asString(row.zip)].filter(Boolean),
    lat: typeof row.lat === 'number' ? row.lat : null,
    lng: typeof row.lng === 'number' ? row.lng : null,
    precision: asString(row.precision || row.locationPrecision || 'store_level'),
    inventoryCapability: asString(row.inventoryCapability),
    signalCount: Number(row.signalCount || 0),
    lastSignalAt: asString(row.lastSignalAt || row.lastConfirmedAt || row.observedAt) || null,
  };
  return state && name ? identity : null;
}

async function main() {
  await mkdir(SITE_OUT, { recursive: true });
  const [storesPayload, locationsPayload, dropsPayload, alertsPayload] = await Promise.all([
    readJson(path.join(SITE_OUT, 'stores.json'), { stores: [] }),
    readJson(path.join(SITE_OUT, 'locations.json'), { locations: [] }),
    readJson(path.join(SITE_OUT, 'drops.json'), { drops: [] }),
    readJson(path.join(SITE_OUT, 'alerts.json'), { alerts: [] }),
  ]);
  const identities = new Map();
  const add = (row, origin) => {
    const identity = toIdentity(row, origin);
    if (!identity) return;
    const existing = identities.get(identity.identityKey);
    if (existing) mergeIdentity(existing, identity);
    else identities.set(identity.identityKey, identity);
  };
  for (const row of storesPayload.stores || []) add(row, 'stores_export');
  for (const row of locationsPayload.locations || []) {
    if (String(row.type || row.locationType || '').toLowerCase().includes('store') || row.precision === 'store_level') add(row, 'locations_export');
  }
  for (const row of dropsPayload.drops || []) {
    if (String(row.locationPrecision || '').toLowerCase() === 'store_level' || row.storeName || row.storeAddress || row.storeId) {
      add({ ...row, name: row.storeName || row.locationName, address: row.storeAddress, id: row.storeId, city: row.city, county: row.county, lastSignalAt: row.lastConfirmedAt || row.observedAt, signalCount: 1 }, 'drop_export');
    }
  }
  for (const row of alertsPayload.alerts || []) {
    if (String(row.locationPrecision || '').toLowerCase() === 'store_level' || row.storeName || row.storeAddress) {
      add({ ...row, name: row.storeName || row.locationName, address: row.storeAddress, lastSignalAt: row.lastConfirmedAt || row.observedAt, signalCount: 1 }, 'alert_export');
    }
  }
  const rows = [...identities.values()].map((row) => ({
    ...row,
    primaryAddress: row.primaryAddress || row.addresses[0] || null,
    primaryCity: row.cities[0] || null,
    primaryCounty: row.counties[0] || null,
    primaryZip: row.zips[0] || null,
    addressResolved: Boolean(row.primaryAddress || row.addresses[0]),
    confidence: row.addresses.length ? 'high' : row.sourceIds.length ? 'medium' : 'low',
  })).sort((a, b) => `${a.state}|${a.primaryName}`.localeCompare(`${b.state}|${b.primaryName}`));

  const storeLevelAlertRows = (alertsPayload.alerts || []).filter((row) => row.eligibleForDelivery && String(row.locationPrecision || '').toLowerCase() === 'store_level');
  const unresolvedAlertRows = storeLevelAlertRows.filter((row) => {
    if (asString(row.storeAddress)) return false;
    const state = asString(row.state).toUpperCase();
    const name = norm(row.storeName || row.locationName);
    return !rows.some((store) => store.state === state && store.primaryAddress && (norm(store.primaryName) === name || norm(store.primaryName).includes(name) || name.includes(norm(store.primaryName))));
  });
  if (unresolvedAlertRows.length) warnings.push(`${unresolvedAlertRows.length} store-level alert candidate(s) still lack resolvable addresses.`);

  const payload = {
    contractVersion: 'bourbon-signal-site-v0.1',
    generatedAt: new Date().toISOString(),
    count: rows.length,
    addressResolvedCount: rows.filter((row) => row.addressResolved).length,
    stateCounts: rows.reduce((acc, row) => { acc[row.state] = (acc[row.state] || 0) + 1; return acc; }, {}),
    warnings,
    identities: rows,
  };
  await writeFile(OUT_FILE, JSON.stringify(payload, null, 2));
  console.log(`Store identity graph: ${rows.length} stores, ${payload.addressResolvedCount} with addresses${warnings.length ? ` (${warnings.join('; ')})` : ''}`);
  if (failures.length) process.exit(1);
}

main().catch((error) => { console.error(error); process.exit(1); });
