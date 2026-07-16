#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const REQUIRED_KINDS = Object.freeze([
  'positive_bottle_match',
  'ordinary_vs_rare_negative',
  'rye_cream_liqueur_rtd_exclusion',
  'size_or_multipack_exclusion',
  'availability_semantics',
  'store_identity',
  'timestamp_freshness',
]);

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
    if (!object(item.expected)) failures.push(`Fixture ${item.id || '(unknown)'} requires expected assertions.`);
  }
  for (const kind of REQUIRED_KINDS) if (!kinds.has(kind)) failures.push(`Fixture set must cover ${kind}.`);
  if (payload.sourceSentinelRequired === true && !kinds.has('source_specific_sentinel')) failures.push('source_specific_sentinel fixture is required for this source.');
  return { ok: failures.length === 0, failures };
}

function argValue(flag) {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : null;
}

async function main() {
  const state = String(argValue('--state') || '').toUpperCase();
  const file = argValue('--file') || (state ? path.join('data', 'state-fixtures', `${state}.json`) : null);
  if (!file) throw new Error('Usage: verify-state-fixtures --state=<STATE> [--file=<path>]');
  const payload = JSON.parse(await readFile(path.resolve(file), 'utf8'));
  const result = validateStateFixtures(payload);
  if (state && payload.state !== state) result.failures.push(`Fixture state ${payload.state} does not match requested ${state}.`);
  if (!result.ok || result.failures.length) throw new Error(result.failures.join(' '));
  console.log(`State fixture contract passed for ${payload.state}.`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) main().catch((error) => { console.error(error.message); process.exit(1); });

export { REQUIRED_KINDS };
