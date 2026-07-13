import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { CUSTOMER_ACTIVE_STATE_IDS, STATE_SOURCES } from '../src/state-sources.mjs';
import { compareStateQuality, buildStateQualityScorecard } from '../src/state-quality-scorecard.mjs';
import { LOCATION_PROFILES } from '../src/location-precision.mjs';

test('Texas is a customer-active state collected and exported with every active-state run', () => {
  assert.equal(CUSTOMER_ACTIVE_STATE_IDS.has('TX'), true);
  assert.equal(STATE_SOURCES.some((state) => state.id === 'TX'), true);
  assert.equal(LOCATION_PROFILES.TX.target, 'store_level');
});

test('a labeled preserved fallback does not block fresh states from publishing', () => {
  const previous = { states: [{ state: 'VA', score: 90, releaseEligible: true, input: { dropCount: 100, status: 'useful' } }] };
  const current = { states: [{ state: 'VA', score: 88, releaseEligible: true, input: { dropCount: 100, status: 'stale_useful_quality_fallback' } }] };
  const result = compareStateQuality(previous, current);
  assert.equal(result.ok, true);
  assert.match(result.warnings.join(' '), /preserved fallback/i);
});

test('state quality v2 uses a current-snapshot baseline', () => {
  assert.equal(buildStateQualityScorecard([]).schemaVersion, 2);
});

test('scheduled refresh persists collector history, the actual scheduler state, and runs twice hourly', async () => {
  const workflow = await readFile(new URL('../../.github/workflows/refresh-feed.yml', import.meta.url), 'utf8');
  assert.match(workflow, /cron:\s*["']7,37 \* \* \* \*['"]/);
  assert.match(workflow, /engine\/out\/optimization\/state-run-metrics\.json/);
  assert.match(workflow, /timeout-minutes:\s*28/);
  assert.doesNotMatch(workflow, /Refresh and gate the Texas candidate/);
  assert.match(workflow, /verify:production-engine[\s\S]*?--rollback/);
  assert.match(workflow, /engine\/out\/snapshots/);
  const exporter = await readFile(new URL('../src/export-site-contract.mjs', import.meta.url), 'utf8');
  assert.match(exporter, /buildStateQualityInputs\(\{ stateCoverage, drops: currentDrops,/);
  const verifier = await readFile(new URL('../src/verify-site-contract.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(verifier, /should not include TX|contains TX customer-facing|contains TX in states array/);
  const blobReader = await readFile(new URL('../../src/lib/vercel-blob-snapshot-storage.ts', import.meta.url), 'utf8');
  assert.match(blobReader, /_engine_pointer/);
  assert.match(blobReader, /cache:\s*["']no-store["']/);
  const siteContract = await readFile(new URL('../../src/lib/site-engine-contract.ts', import.meta.url), 'utf8');
  assert.match(siteContract, /const readActivePointer = async \(\) => blobStorage\.readPointer\(\)/);
  const productionGuard = await readFile(new URL('../../scripts/verify-production-engine-regression.mjs', import.meta.url), 'utf8');
  assert.match(productionGuard, /Live stateCount .*does not match local/);
  assert.match(productionGuard, /Live generatedAt .*does not match local/);
  assert.match(productionGuard, /PRODUCTION_VERIFY_ATTEMPTS/);
  assert.match(productionGuard, /cache-control.*no-cache/);
});
