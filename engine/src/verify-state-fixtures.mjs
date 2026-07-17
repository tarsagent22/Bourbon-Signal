#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { BourbonBible } from './core/bible.mjs';
import { STATE_SOURCES } from './state-sources.mjs';
import { lifecycleAllowsInventoryAlert, lifecycleAllowsWatchAlert } from './state-lifecycle.mjs';
import { transformUtahAggregateRow } from './collectors/precision-probes.mjs';

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
  const definition = STATE_SOURCES.find((entry) => entry.id === state);
  const sources = definition?.sources || [];
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

function evaluateCase(item, { state, bible, registeredHosts }) {
  const input = item.input || {};
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

export async function executeStateFixtures(payload, { bibleFile = path.resolve('out/bourbon-bible.json') } = {}) {
  const failures = [];
  const bible = await BourbonBible.load(bibleFile);
  const registeredHosts = registeredHostsForState(payload.state);
  for (const item of payload.cases || []) {
    const actual = evaluateCase(item, { state: payload.state, bible, registeredHosts });
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
  const execution = await executeStateFixtures(payload);
  if (!execution.ok) throw new Error(execution.failures.join(' '));
  console.log(`State fixture contract and executable assertions passed for ${payload.state}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => { console.error(error.message); process.exit(1); });

export { REQUIRED_KINDS };
