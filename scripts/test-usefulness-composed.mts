import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { createSourceAdapter } from '../engine/src/sources/source-adapter.mjs';
import { runSourceAdapters } from '../engine/src/sources/source-runner.mjs';
import { buildDrops, buildCurrentInventoryAlertsFromDrops } from '../engine/src/export-site-contract.mjs';
import queueModule from '../src/lib/alert-queue/postgres-repository.ts';
import gateModule from '../src/lib/alert-queue/delivery-gate.ts';
const { PostgresAlertQueueRepository } = queueModule;
const { reserveAlertDeliveryBatch } = gateModule;
import delivery from '../src/lib/alert-delivery.ts';
import dedupe from '../src/lib/alert-dedupe.ts';
const { normalizeAreaPrefs, normalizeBottleAlertPreferences, candidateMatchesArea, candidateMatchesBottlePrefs, candidatePassesFreshEmailGuardrails, groupCandidatesByLocation } = delivery;
const { stableUnderlyingAlertKey } = dedupe;

// A composition proof of existing consumers, not an independent-source production
// publisher. All source/provider data is explicitly synthetic; SQL and disk are real.
test('durable source restart -> canonical export/matching -> real SQL reservation -> provider stub, once only', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'bs-usefulness-composed-'));
  const db = new PGlite();
  t.after(async () => { await db.close(); await rm(dir, { recursive: true, force: true }); });
  await db.exec(await readFile(new URL('../src/lib/alert-queue/schema.sql', import.meta.url), 'utf8'));
  const now = new Date().toISOString();
  const record = { id: 'bottle-eagle-rare-10', canonical: 'Eagle Rare 10 Year', aliases: [], tier: 'allocated' };
  const bible = { byId: new Map([[record.id, record]]), byName: new Map() };
  const observedAt = new Date(Date.now() - 60_000).toISOString();
  const raw = { id: 'fixture-raw', state: 'VA', eventType: 'retailer_store_inventory_result', canonicalBottleId: record.id,
    canonicalName: record.canonical, rawName: record.canonical, tier: record.tier, sourceRuntimeId: 'fixture-source',
    sourceLabel: 'Synthetic retailer', sourceUrl: 'https://fixture.invalid/inventory', storeId: 'fixture-store',
    locationName: 'Synthetic VA Store', storeAddress: 'Synthetic address', city: 'Richmond', locationPrecision: 'store_level',
    observedAt, canAlertAsInventory: true, sourceAvailabilityVerified: true, quantityIsExact: true, quantity: 1, availabilityStatus: 'in_stock' };
  let fetches = 0;
  const source = createSourceAdapter({ id: raw.sourceRuntimeId, url: raw.sourceUrl, metadata: { stateId: 'VA' }, execute: async () => { fetches++; return { signals: [raw] }; } });
  const blocked = createSourceAdapter({ id: 'unrelated-blocked', url: 'https://blocked.invalid', execute: async () => { throw new Error('synthetic blocked source'); } });
  await runSourceAdapters([source, blocked], {}, { checkpointDirectory: dir, now: () => now, maxAttempts: 1 });
  const replay = await runSourceAdapters([source], {}, { checkpointDirectory: dir, now: () => new Date(Date.parse(now) + 1000).toISOString() });
  assert.equal(fetches, 1);
  assert.equal(replay.results[0].status, 'not_due');
  const rows = replay.results[0].value.signals;
  const drops = buildDrops(rows, bible, rows, [], rows);
  const opportunities = buildCurrentInventoryAlertsFromDrops(drops);
  assert.equal(opportunities.length, 1);
  assert.equal(opportunities[0].signalAt, observedAt);
  const area = normalizeAreaPrefs({ states: ['VA'] });
  const prefs = normalizeBottleAlertPreferences({ bottleNames: [record.canonical] });
  const matching = opportunities.filter((c: any) => candidateMatchesArea(c, area) && candidateMatchesBottlePrefs(c, 'specific_bottles', prefs));
  const selected = groupCandidatesByLocation(matching, prefs).slice(0, 1);
  assert.equal(selected.length, 1);
  assert.equal(candidateMatchesArea(opportunities[0], normalizeAreaPrefs({ states: ['NC'] })), false);
  assert.equal(candidatePassesFreshEmailGuardrails(opportunities[0], new Date(Date.parse(now) + 3 * 3_600_000).toISOString()), false, 'expiry is checked before delivery');
  const sql = { query: async (text: string, params: unknown[] = []) => db.query<Record<string, unknown>>(text, params) };
  const repository = new PostgresAlertQueueRepository(sql);
  await repository.registerSnapshot({ snapshotId: 'synthetic-composition', appCommit: 'fixture', engineCommit: 'fixture', collectionRunId: 'fixture', generatedAt: now, manifest: { synthetic: true } });
  const child = selected[0].__groupCandidates[0];
  const input = { snapshotId: 'synthetic-composition', userId: 'synthetic-member', channel: 'email' as const, locationKey: 'fixture-store', alertWindow: 'stable-v2', createdAt: now,
    children: [{ stableMatchKey: stableUnderlyingAlertKey(child), payload: { signalAt: child.signalAt, synthetic: true } }] };
  const reservation = await reserveAlertDeliveryBatch(repository, input, { mode: 'active', workerId: 'synthetic-worker', now });
  assert.equal(reservation.claimed.length, 1);
  let providerCalls = 0;
  const providerStub = async () => { providerCalls++; return { id: 'synthetic-provider-accepted' }; };
  const accepted = await providerStub();
  await repository.markBatchDelivered(reservation.claimed.map(c => c.id), accepted.id, now);
  const restartedRepository = new PostgresAlertQueueRepository(sql);
  const duplicate = await reserveAlertDeliveryBatch(restartedRepository, input, { mode: 'active', workerId: 'restarted-worker', now });
  assert.equal(duplicate.claimed.length, 0);
  assert.equal(providerCalls, 1);
  const persisted = await restartedRepository.get(reservation.claimed[0].id);
  assert.equal(persisted?.providerMessageId, accepted.id);
  assert.equal(persisted?.payload?.signalAt, observedAt);
  assert.equal((await db.query('select * from alert_deliveries')).rows.length, 1);
});
