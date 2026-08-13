import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {
  prepareScheduledStateVerification,
  runScheduledStateVerifier,
  stageScheduledVerificationFallbacks,
} from '../src/scheduled-state-verification.mjs';
import { mergePartialRefreshDrops, mergePartialRefreshLocations, mergePartialRefreshStores, mergeScheduledFallbackEvents } from '../src/partial-refresh-contract.mjs';

async function writeJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, JSON.stringify(value, null, 2));
}

async function fixture() {
  const root = await mkdtemp(path.join(os.tmpdir(), 'bs-state-verification-'));
  const siteDir = path.join(root, 'site');
  const previousSiteDir = path.join(root, 'last-published-site');
  const ledgerPath = path.join(root, 'ledger.json');
  const summaryPath = path.join(root, 'summary.json');
  const oldFl = { id: 'fl-old', state: 'FL', source: 'Official FL source', sourceUrl: 'https://example.gov/fl', observedAt: '2026-08-11T12:00:00.000Z', canAlertAsInventory: true };
  const oldNc = { id: 'nc-old', state: 'NC', source: 'Official NC source', sourceUrl: 'https://example.gov/nc', observedAt: '2026-08-11T13:00:00.000Z', canAlertAsInventory: false };
  await writeJson(path.join(siteDir, 'drops.json'), { drops: [oldFl, oldNc] });
  await writeJson(path.join(siteDir, 'locations.json'), { locations: [] });
  await writeJson(path.join(siteDir, 'stores.json'), { stores: [] });
  await writeJson(path.join(siteDir, 'events.json'), { events: [
    { id: 'fl-event-old', state: 'FL', actionability: 'high', canAlertAsWatch: true, eligibleForDelivery: true },
    { id: 'nc-event-old', state: 'NC', actionability: 'medium' },
  ] });
  await writeJson(path.join(siteDir, 'states', 'index.json'), { states: [
    { state: 'FL', count: 1, file: 'states/FL/drops.json' },
    { state: 'NC', count: 1, file: 'states/NC/drops.json' },
  ] });
  await writeJson(path.join(siteDir, 'states', 'FL', 'drops.json'), { state: 'FL', count: 1, drops: [oldFl] });
  await writeJson(path.join(siteDir, 'states', 'NC', 'drops.json'), { state: 'NC', count: 1, drops: [oldNc] });
  await writeJson(summaryPath, {
    attemptedStateIds: ['FL', 'NC'],
    freshStateIds: ['FL', 'NC'],
    fallbackStateIds: [],
    partialFallbackStateIds: [],
    degradedStateCount: 0,
    staleStateCount: 0,
    failedStateCount: 0,
    states: [
      { state: 'FL', status: 'useful', stale: false, finishedAt: '2026-08-12T20:00:00.000Z' },
      { state: 'NC', status: 'useful', stale: false, finishedAt: '2026-08-12T20:01:00.000Z' },
    ],
  });
  return { root, siteDir, previousSiteDir, ledgerPath, summaryPath };
}

test('a scheduled verifier failure is recorded without failing the wrapper, then stages only that state for stale fallback', async (t) => {
  const files = await fixture();
  t.after(() => rm(files.root, { recursive: true, force: true }));
  const runId = 'test-run';
  await prepareScheduledStateVerification({ ...files, runId, cacheKey: 'inventory-published-site-Windows-31647868582', now: '2026-08-12T20:02:00.000Z' });

  const failed = await runScheduledStateVerifier({
    stateIds: ['FL'],
    command: 'npm',
    args: ['run', 'verify:fl:15-20'],
    ledgerPath: files.ledgerPath,
    runId,
    run: async () => ({ ok: false, exitCode: 7 }),
  });
  assert.equal(failed.ok, false);
  const healthy = await runScheduledStateVerifier({
    stateIds: ['NC'],
    command: 'npm',
    args: ['run', 'verify:nc'],
    ledgerPath: files.ledgerPath,
    runId,
    run: async () => ({ ok: true, exitCode: 0 }),
  });
  assert.equal(healthy.ok, true);

  const staged = await stageScheduledVerificationFallbacks({ ...files, runId, now: '2026-08-12T20:03:00.000Z' });
  assert.deepEqual(staged, { failedStateIds: ['FL'], changed: true });
  const summary = JSON.parse(await readFile(files.summaryPath, 'utf8'));
  assert.deepEqual(summary.fallbackStateIds, ['FL']);
  assert.deepEqual(summary.freshStateIds, ['NC']);
  assert.deepEqual(summary.scheduledVerificationFailureStateIds, ['FL']);
  assert.equal(summary.degradedStateCount, 1);
  assert.equal(summary.staleStateCount, 1);
  assert.equal(summary.failedStateCount, 1);
  assert.equal(summary.states.find((state) => state.state === 'FL').status, 'failed_state_verification_stale_fallback');
  assert.equal(summary.states.find((state) => state.state === 'FL').stale, true);
  assert.equal(summary.states.find((state) => state.state === 'NC').status, 'useful');

  const merged = mergePartialRefreshDrops({
    previousDrops: [
      { id: 'fl-old', state: 'FL', canAlertAsInventory: true, canAlertAsWatch: true, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true },
      { id: 'nc-old', state: 'NC' },
    ],
    currentDrops: [
      { id: 'fl-candidate', state: 'FL', canAlertAsInventory: true },
      { id: 'nc-current', state: 'NC' },
    ],
    attemptedStateIds: ['FL', 'NC'],
    fallbackStateIds: summary.fallbackStateIds,
  });
  assert.deepEqual(merged.map((drop) => drop.id), ['nc-current', 'fl-old']);
  const retained = merged.find((drop) => drop.state === 'FL');
  assert.equal(retained.stale, true);
  assert.equal(retained.sourceStale, true);
  assert.equal(retained.canAlertAsInventory, false);
  assert.equal(retained.canAlertAsWatch, false);
  assert.equal(retained.eligibleForDelivery, false);
  assert.equal(retained.eligibleForEmail, false);
  assert.equal(retained.eligibleForSms, false);

  const retainedLocations = mergePartialRefreshLocations({
    previousLocations: [{ id: 'fl-location-old', state: 'FL' }, { id: 'nc-location-old', state: 'NC' }],
    currentLocations: [{ id: 'fl-location-candidate', state: 'FL' }, { id: 'nc-location-current', state: 'NC' }],
    attemptedStateIds: ['FL', 'NC'],
    fallbackStateIds: summary.fallbackStateIds,
  });
  assert.deepEqual(retainedLocations.map((row) => row.id), ['nc-location-current', 'fl-location-old']);
  const retainedStores = mergePartialRefreshStores({
    previousStores: [{ id: 'fl-store-old', state: 'FL' }, { id: 'nc-store-old', state: 'NC' }],
    currentStores: [{ id: 'fl-store-candidate', state: 'FL' }, { id: 'nc-store-current', state: 'NC' }],
    attemptedStateIds: ['FL', 'NC'],
    fallbackStateIds: summary.fallbackStateIds,
  });
  assert.deepEqual(retainedStores.map((row) => row.id), ['nc-store-current', 'fl-store-old']);

  const retainedEvents = mergeScheduledFallbackEvents({
    previousEvents: [
      { id: 'fl-event-old', state: 'FL', actionability: 'high', canAlertAsWatch: true, eligibleForDelivery: true, eligibleForEmail: true, eligibleForSms: true },
      { id: 'nc-event-old', state: 'NC' },
    ],
    currentEvents: [
      { id: 'fl-event-candidate', state: 'FL', actionability: 'high', canAlertAsWatch: true },
      { id: 'nc-event-current', state: 'NC', actionability: 'medium' },
    ],
    fallbackStateIds: summary.fallbackStateIds,
  });
  assert.deepEqual(retainedEvents.map((row) => row.id), ['nc-event-current', 'fl-event-old']);
  const retainedEvent = retainedEvents.find((row) => row.state === 'FL');
  assert.equal(retainedEvent.stale, true);
  assert.equal(retainedEvent.canAlertAsWatch, false);
  assert.equal(retainedEvent.eligibleForDelivery, false);
  assert.equal(retainedEvent.eligibleForEmail, false);
  assert.equal(retainedEvent.eligibleForSms, false);
  assert.equal(retainedEvent.actionability, 'context_only');
  assert.equal(retainedEvent.eventStatus, 'stale_fallback');
});

test('scheduled fallback preparation rejects an unproven checked-in baseline', async (t) => {
  const files = await fixture();
  t.after(() => rm(files.root, { recursive: true, force: true }));
  await assert.rejects(
    prepareScheduledStateVerification({ ...files, runId: 'no-cache-proof', cacheKey: '' }),
    /restored last-published cache key/i,
  );
});

test('fallback staging fails closed when the failed state has no coherent last-published partition', async (t) => {
  const files = await fixture();
  t.after(() => rm(files.root, { recursive: true, force: true }));
  const runId = 'missing-partition-run';
  await prepareScheduledStateVerification({ ...files, runId, cacheKey: 'inventory-published-site-Windows-baseline' });
  await runScheduledStateVerifier({
    stateIds: ['GA'],
    command: 'npm',
    args: ['run', 'verify:ga'],
    ledgerPath: files.ledgerPath,
    runId,
    run: async () => ({ ok: false, exitCode: 1 }),
  });
  await assert.rejects(
    stageScheduledVerificationFallbacks({ ...files, runId }),
    /GA: last-published state partition is missing/,
  );
});
