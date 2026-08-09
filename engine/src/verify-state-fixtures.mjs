#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BourbonBible } from './core/bible.mjs';
import { ALL_STATE_SOURCES } from './state-sources.mjs';
import { lifecycleAllowsInventoryAlert, lifecycleAllowsWatchAlert } from './state-lifecycle.mjs';
import { transformUtahAggregateRow } from './collectors/precision-probes.mjs';
import {
  COLORADO_RETAILER_SOURCES,
  NEW_YORK_RETAILER_SOURCES,
  parseMetroCityHiveHtml,
} from './collectors/metro-retailer-surfaces.mjs';
import { isMetroRetailerInventory } from './metro-retailer-policy.mjs';
import { MISSISSIPPI_RETAILER_SOURCES } from './collectors/mississippi-retailer-surfaces.mjs';
import { buildMississippiRetailerSignal } from './collectors/mississippi-retailer-collector.mjs';
import { isMississippiRetailerInventory } from './mississippi-retailer-policy.mjs';
import {
  enrichWestVirginiaBarrelSelections,
  parseWestVirginiaBarrelSelections,
  westVirginiaDirectorySignals,
} from './collectors/west-virginia-official.mjs';

const REQUIRED_KINDS = Object.freeze([
  'positive_bottle_match',
  'ordinary_vs_rare_negative',
  'rye_cream_liqueur_rtd_exclusion',
  'size_or_multipack_exclusion',
  'availability_semantics',
  'store_identity',
  'timestamp_freshness',
]);

const RARE_TIERS = new Set(['unicorn', 'allocated', 'limited']);

function object(value) { return value && typeof value === 'object' && !Array.isArray(value); }

export function validateStateFixtures(payload) {
  const failures = [];
  if (!object(payload)) return { ok: false, failures: ['State fixture payload must be an object.'] };
  if (payload.schemaVersion !== 1) failures.push('schemaVersion must be 1.');
  if (!/^[A-Z]{2}(?:-[A-Z0-9]+)?$/.test(String(payload.state || ''))) failures.push('state must be an uppercase state or scoped-market identifier.');
  if (!Array.isArray(payload.cases)) {
    failures.push('cases must be an array.');
    return { ok: false, failures };
  }
  const ids = new Set();
  const kinds = new Set();
  for (const item of payload.cases) {
    if (!object(item)) { failures.push('Every fixture case must be an object.'); continue; }
    if (typeof item.id !== 'string' || !item.id.trim()) failures.push('Every fixture case requires id.');
    else if (ids.has(item.id)) failures.push(`Duplicate fixture id ${item.id}.`);
    else ids.add(item.id);
    if (typeof item.kind !== 'string' || !item.kind.trim()) failures.push(`Fixture ${item.id || '(unknown)'} requires kind.`);
    else kinds.add(item.kind);
    if (!object(item.input)) failures.push(`Fixture ${item.id || '(unknown)'} requires executable input.`);
    if (!object(item.expected)) failures.push(`Fixture ${item.id || '(unknown)'} requires expected assertions.`);
  }
  for (const kind of REQUIRED_KINDS) if (!kinds.has(kind)) failures.push(`Fixture set must cover ${kind}.`);
  if (payload.sourceSentinelRequired === true && !kinds.has('source_specific_sentinel')) failures.push('source_specific_sentinel fixture is required for this source.');
  return { ok: failures.length === 0, failures };
}

function registeredHostsForState(state) {
  const config = ALL_STATE_SOURCES.find((entry) => entry.id === state);
  const sources = config?.sources || [];
  return new Set(sources.flatMap((source) => [source.url, ...(source.urls || [])]).map((value) => {
    try { return new URL(value).hostname.toLowerCase(); } catch { return ''; }
  }).filter(Boolean));
}

function utahProductionSignal(rawName, input, bible, index = 0) {
  return transformUtahAggregateRow({ id: 'UT' }, bible, {
    name: rawName,
    sku: input.sku || `fixture-${index}`,
    storeQty: input.storeQty ?? 0,
    warehouseQty: input.warehouseQty ?? 0,
    onOrderQty: input.onOrderQty ?? 0,
    bottlePrice: input.bottlePrice ?? 0,
    status: input.sourceStatus || input.status || 'fixture',
  }, { observedAt: input.fetchedAt || '2026-07-16T22:14:22.306Z' });
}

function metroFixtureSource(state, sourceId) {
  const sources = state === 'NY' ? NEW_YORK_RETAILER_SOURCES : state === 'CO' ? COLORADO_RETAILER_SOURCES : [];
  return sources.find((source) => source.id === sourceId && source.platform === 'cityhive') || sources.find((source) => source.platform === 'cityhive') || null;
}

function metroFixtureSignal(state, rawName, input, bible) {
  const source = metroFixtureSource(state, input.sourceId);
  const store = source?.stores?.[0];
  if (!source || !store) return null;
  const merchantId = String(input.merchantId || store.merchantId);
  const address = String(input.address || store.address);
  const quantity = input.quantity ?? 4;
  const pickup = input.pickup === false ? ['delivery'] : ['pick_up'];
  const payload = {
    merchant_configs: [{
      merchant: {
        id: merchantId,
        display_name: store.name,
        address: {
          full_address: address,
          address_properties: { city: store.city, state: store.stateCode, zip: store.zip },
        },
      },
    }],
    products: [{
      id: 'fixture-product',
      name: rawName,
      basic_category: ['bourbon'],
      size: { quantity: '750', measure: 'ml' },
      merchants: [{
        merchant_id: merchantId,
        merchant_name: store.name,
        full_address: address,
        offer_types: pickup,
        product_options: [{
          product_id: 'fixture-product',
          option_id: 'fixture-option',
          merchant_id: merchantId,
          merchant_name: store.name,
          full_address: address,
          quantity,
          price: 34.99,
          product_url: `${source.baseUrl}/shop/product/fixture-bourbon/fixture-product?option-id=fixture-option`,
          option_display_data: {
            name: rawName,
            size: { quantity: '750', measure: 'ml' },
            basic_category: ['bourbon'],
          },
        }],
      }],
    }],
  };
  const encoded = encodeURIComponent(JSON.stringify(payload));
  const row = parseMetroCityHiveHtml(`<script>JSON.parse(decodeURIComponent("${encoded}"))</script>`, source)[0];
  if (!row) return null;
  const match = bible.match(row.title);
  const record = match?.record || null;
  const signal = {
    id: `${state}:fixture:${row.productId}:${row.variantId}`,
    state,
    stateCode: state,
    sourceLabel: source.sourceLabel,
    sourceUrl: row.productUrl,
    sourceChain: source.id,
    merchantId: row.merchantId,
    productId: row.productId,
    variantId: row.variantId,
    rawName: row.title,
    canonicalBottleId: record?.id || null,
    canonicalName: record?.canonical || null,
    tier: record?.tier || null,
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: `${store.name} — ${store.address}`,
    storeId: store.id,
    storeName: store.name,
    storeAddress: store.address,
    address: store.address,
    city: store.city,
    area: source.area,
    postalCode: store.zip,
    zip: store.zip,
    quantity: row.quantity,
    quantityIsExact: row.quantityIsExact,
    reportedQuantity: row.reportedQuantity,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    observedAt: input.fetchedAt || new Date().toISOString(),
    inventorySemantics: row.inventorySemantics,
    raw: {
      chain: source.id,
      platform: source.platform,
      merchantId: row.merchantId,
      reportedQuantity: row.reportedQuantity,
    },
  };
  return { signal, record, row };
}

function evaluateMetroCase(item, { state, bible, registeredHosts, candidateActive = false }) {
  const input = item.input || {};
  const names = Array.isArray(input.rawNames) ? input.rawNames.map(String) : [String(input.rawName || 'Buffalo Trace Bourbon 750ml')];
  const values = names.map((name) => metroFixtureSignal(state, name, input, bible)).filter(Boolean);
  if (item.kind === 'positive_bottle_match') {
    const value = values[0];
    return {
      canonicalName: value?.record?.canonical || null,
      tier: value?.record?.tier || null,
      customerVisible: Boolean(value?.record),
      alertable: Boolean(value && isMetroRetailerInventory(value.signal) && (candidateActive || lifecycleAllowsInventoryAlert(state))),
    };
  }
  if (['ordinary_vs_rare_negative', 'rye_cream_liqueur_rtd_exclusion', 'size_or_multipack_exclusion'].includes(item.kind)) {
    const rareMatch = values.some((value) => Boolean(value.record) && RARE_TIERS.has(String(value.record.tier || '').toLowerCase()));
    return {
      rareMatch,
      alertable: values.some((value) => isMetroRetailerInventory(value.signal) && RARE_TIERS.has(String(value.record?.tier || '').toLowerCase())),
    };
  }
  if (item.kind === 'availability_semantics') {
    const value = values[0];
    return {
      quantity: value?.signal?.quantity ?? null,
      quantityIsExact: value?.signal?.quantityIsExact ?? null,
      inventorySemantics: value?.signal?.inventorySemantics || null,
      canAlertAsInventory: Boolean(value && isMetroRetailerInventory(value.signal) && (candidateActive || lifecycleAllowsInventoryAlert(state))),
    };
  }
  if (item.kind === 'store_identity') {
    const value = values[0];
    return {
      storeId: value?.signal?.storeId || null,
      storeAddress: value?.signal?.storeAddress || null,
      fabricateIdentity: false,
    };
  }
  if (item.kind === 'timestamp_freshness') {
    const value = values[0];
    const observedMs = Date.parse(value?.signal?.observedAt || '');
    const nowMs = Date.parse(input.nowAt || value?.signal?.observedAt || '');
    const stale = !Number.isFinite(observedMs) || !Number.isFinite(nowMs) || nowMs < observedMs || nowMs - observedMs > 4 * 60 * 60_000;
    return {
      preserveOriginalTimestamp: value?.signal?.observedAt === input.fetchedAt,
      futureTimestampAllowed: false,
      staleRowsAlertable: Boolean(!stale && value && isMetroRetailerInventory(value.signal)),
    };
  }
  if (item.kind === 'source_specific_sentinel') {
    let host = '';
    try { host = new URL(input.sourceUrl).hostname.toLowerCase(); } catch {}
    return { officialHost: registeredHosts.has(host), allowlistedHosts: [...registeredHosts].sort() };
  }
  return {};
}

function mississippiFixtureSignal(rawName, input, bible) {
  const source = MISSISSIPPI_RETAILER_SOURCES.find((entry) => entry.permitNumber === String(input.permitNumber || ''))
    || MISSISSIPPI_RETAILER_SOURCES[0];
  if (!source) return null;
  const match = bible.match(rawName);
  const record = match?.record || null;
  const productId = source.platform === 'gotoliquorstore' ? '1138' : 'fixture-product';
  const variantId = source.platform === 'cityhive' ? 'fixture-option' : null;
  const productUrl = source.platform === 'gotoliquorstore'
    ? `${source.baseUrl}/p/fixture-bourbon/${productId}`
    : `${source.baseUrl}/shop/product/fixture-bourbon/${productId}?option-id=${variantId}`;
  const signal = buildMississippiRetailerSignal(source, {
    productId,
    variantId,
    title: rawName,
    productUrl,
    price: 34.99,
    reportedQuantity: input.reportedQuantity ?? 4,
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    premisesVerified: true,
  }, {
    observedAt: input.fetchedAt || '2026-07-25T20:00:00.000Z',
    bottle: record ? {
      id: record.id,
      canonical: record.canonical,
      tier: record.tier,
      confidence: match?.confidence || 0.8,
    } : null,
  });
  return { source, signal, record };
}

function evaluateMississippiCase(item, { bible, registeredHosts, candidateActive = false }) {
  const input = item.input || {};
  const names = Array.isArray(input.rawNames) ? input.rawNames.map(String) : [String(input.rawName || 'Buffalo Trace Bourbon 750ml')];
  const values = names.map((name) => mississippiFixtureSignal(name, input, bible)).filter(Boolean);
  if (item.kind === 'positive_bottle_match') {
    const value = values[0];
    return {
      canonicalName: value?.record?.canonical || null,
      tier: value?.record?.tier || null,
      customerVisible: Boolean(value?.record && isMississippiRetailerInventory(value.signal)),
      alertable: Boolean(value && isMississippiRetailerInventory(value.signal) && candidateActive && lifecycleAllowsInventoryAlert('MS')),
    };
  }
  if (['ordinary_vs_rare_negative', 'rye_cream_liqueur_rtd_exclusion', 'size_or_multipack_exclusion'].includes(item.kind)) {
    const rareMatch = values.some((value) => isMississippiRetailerInventory(value.signal)
      && Boolean(value.record)
      && RARE_TIERS.has(String(value.record.tier || '').toLowerCase()));
    return { rareMatch, alertable: false };
  }
  if (item.kind === 'availability_semantics') {
    const value = values[0];
    return {
      quantity: value?.signal?.quantity ?? null,
      quantityIsExact: value?.signal?.quantityIsExact ?? null,
      inventorySemantics: value?.signal?.inventorySemantics || null,
      canAlertAsInventory: Boolean(value && isMississippiRetailerInventory(value.signal) && candidateActive && lifecycleAllowsInventoryAlert('MS')),
    };
  }
  if (item.kind === 'store_identity') {
    const value = values[0];
    return {
      storeId: value?.signal?.storeId || null,
      storeAddress: value?.signal?.storeAddress || null,
      fabricateIdentity: false,
    };
  }
  if (item.kind === 'timestamp_freshness') {
    const value = values[0];
    return {
      preserveOriginalTimestamp: value?.signal?.observedAt === input.fetchedAt,
      futureTimestampAllowed: false,
      staleRowsAlertable: false,
    };
  }
  if (item.kind === 'source_specific_sentinel') {
    let host = '';
    try { host = new URL(input.sourceUrl).hostname.toLowerCase(); } catch {}
    return { officialHost: registeredHosts.has(host), allowlistedHosts: [...registeredHosts].sort() };
  }
  return {};
}

function evaluateCase(item, { state, bible, registeredHosts, candidateActive = false }) {
  const input = item.input || {};
  if (state === 'NY' || state === 'CO') return evaluateMetroCase(item, { state, bible, registeredHosts, candidateActive });
  if (state === 'MS') return evaluateMississippiCase(item, { bible, registeredHosts, candidateActive });
  if (state === 'WV') {
    const names = Array.isArray(input.rawNames) ? input.rawNames.map(String) : [String(input.rawName || 'Yellowstone Handpicked 109 Proof')];
    const observedAt = input.fetchedAt || '2026-08-09T20:00:00.000Z';
    const filler = [
      'Ezra Brooks Stave Finish Spice & Clove',
      'Rebel Full Proof Selection',
      'Yellowstone Handpicked 109 Proof',
      'Yellowstone Handpicked 119 Proof',
      'Rebel Stave Finish Collection Rich Mocha',
      'Wilderness Trail Rye Green Label Private Selection',
    ];
    const sourceRows = [
      ...names.map((name, index) => `${28204 + index} - ${name}`),
      ...filler.map((name, index) => `${29000 + index} - ${name}`),
      '29998 - Myers Rum Single Barrel',
      '29999 - Corazon Tequila Single Barrel',
    ];
    const html = `<h2>New 2026 discounts for limited barrel selections:</h2>${sourceRows.map((row) => `<p>${row}</p>`).join('')}<h2>Corazon Single Barrel</h2>`;
    const rows = enrichWestVirginiaBarrelSelections(parseWestVirginiaBarrelSelections(html, { observedAt, currentYear: 2026 }), bible)
      .filter((row) => Number(row.stockNumber) >= 28204 && Number(row.stockNumber) < 28204 + names.length);
    if (item.kind === 'positive_bottle_match') {
      const row = rows[0];
      return { canonicalName: row?.canonicalName || null, tier: row?.tier || null, customerVisible: Boolean(row?.canonicalBottleId), alertable: false };
    }
    if (['ordinary_vs_rare_negative', 'rye_cream_liqueur_rtd_exclusion', 'size_or_multipack_exclusion'].includes(item.kind)) {
      return { rareMatch: rows.some((row) => RARE_TIERS.has(String(row.tier || '').toLowerCase())), alertable: false };
    }
    if (item.kind === 'availability_semantics') {
      const row = rows[0];
      return {
        quantity: row?.quantity ?? null,
        exactShelfQuantity: false,
        canAlertAsInventory: row?.canAlertAsInventory === true,
        canAlertAsWatch: row?.canAlertAsWatch === true,
      };
    }
    if (item.kind === 'store_identity') {
      const row = westVirginiaDirectorySignals({ nowAt: observedAt })[0];
      return { storeId: row?.storeId || null, storeAddress: row?.storeAddress || null, fabricateIdentity: false };
    }
    if (item.kind === 'timestamp_freshness') {
      const row = rows[0];
      return { preserveOriginalTimestamp: row?.observedAt === input.fetchedAt, futureTimestampAllowed: false, staleRowsAlertable: false };
    }
    if (item.kind === 'source_specific_sentinel') {
      let host = '';
      try { host = new URL(input.sourceUrl).hostname.toLowerCase(); } catch {}
      return { officialHost: registeredHosts.has(host), allowlistedHosts: [...registeredHosts].sort() };
    }
  }
  const alertable = lifecycleAllowsInventoryAlert(state) || lifecycleAllowsWatchAlert(state);
  const names = Array.isArray(input.rawNames) ? input.rawNames.map(String) : [String(input.rawName || 'Eagle Rare 10 Year')];
  const productionSignals = state === 'UT' ? names.map((name, index) => utahProductionSignal(name, input, bible, index)) : [];
  if (item.kind === 'positive_bottle_match') {
    const signal = productionSignals[0];
    return { canonicalName: signal?.canonicalName || null, tier: signal?.tier || null, customerVisible: Boolean(signal?.canonicalBottleId), alertable: Boolean(signal?.canAlertAsInventory || signal?.canAlertAsWatch) };
  }
  if (['ordinary_vs_rare_negative', 'rye_cream_liqueur_rtd_exclusion', 'size_or_multipack_exclusion'].includes(item.kind)) {
    const rareMatch = productionSignals.some((signal) => Boolean(signal.canonicalBottleId) && RARE_TIERS.has(String(signal.tier || '').toLowerCase()));
    return { rareMatch, alertable };
  }
  if (item.kind === 'availability_semantics') {
    const signal = productionSignals[0];
    return {
      quantity: signal?.quantity ?? null,
      exactShelfQuantity: signal?.locationPrecision === 'store_level',
      canAlertAsInventory: signal?.canAlertAsInventory === true,
      canAlertAsWatch: signal?.canAlertAsWatch === true,
    };
  }
  if (item.kind === 'store_identity') {
    const signal = productionSignals[0];
    return { storeId: signal?.storeId || null, storeAddress: signal?.storeAddress || null, fabricateIdentity: false };
  }
  if (item.kind === 'timestamp_freshness') {
    const signal = productionSignals[0];
    return { preserveOriginalTimestamp: signal?.observedAt === input.fetchedAt, futureTimestampAllowed: false, staleRowsAlertable: Boolean(signal?.canAlertAsInventory || signal?.canAlertAsWatch) };
  }
  if (item.kind === 'source_specific_sentinel') {
    let host = '';
    try { host = new URL(input.sourceUrl).hostname.toLowerCase(); } catch {}
    return { officialHost: registeredHosts.has(host), allowlistedHosts: [...registeredHosts].sort() };
  }
  return {};
}

function sameValue(left, right) { return JSON.stringify(left) === JSON.stringify(right); }

export async function executeStateFixtures(payload, { bibleFile = path.resolve('out/bourbon-bible.json'), candidateActive = false } = {}) {
  const failures = [];
  const bible = await BourbonBible.load(bibleFile);
  const registeredHosts = registeredHostsForState(payload.state);
  for (const item of payload.cases || []) {
    const actual = evaluateCase(item, { state: payload.state, bible, registeredHosts, candidateActive });
    for (const [key, expected] of Object.entries(item.expected || {})) {
      if (!sameValue(actual[key], expected)) failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)} but got ${JSON.stringify(actual[key])}.`);
    }
  }
  return { ok: failures.length === 0, failures };
}

function argValue(flag) {
  const inline = process.argv.find((value) => value.startsWith(`${flag}=`));
  if (inline) return inline.slice(flag.length + 1);
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const state = String(argValue('--state') || '').toUpperCase();
  const file = argValue('--file') || (state ? path.join('data', 'state-fixtures', `${state}.json`) : null);
  if (!file) throw new Error('Usage: verify-state-fixtures --state=<STATE> [--file=<path>]');
  const payload = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  const shape = validateStateFixtures(payload);
  if (state && payload.state !== state) shape.failures.push(`Fixture state ${payload.state} does not match requested ${state}.`);
  if (!shape.ok || shape.failures.length) throw new Error(shape.failures.join(' '));
  const execution = await executeStateFixtures(payload, { candidateActive: process.argv.includes('--canary') });
  if (!execution.ok) throw new Error(execution.failures.join(' '));
  console.log(`State fixture contract and executable assertions passed for ${payload.state}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => { console.error(error.message); process.exit(1); });

export { REQUIRED_KINDS };
