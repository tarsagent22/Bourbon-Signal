import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { verifyKansasFirstPublication } from '../src/verify-ks-first-publication.mjs';
import { buildKansasCanaryManifest } from '../src/prepare-ks-canary-manifest.mjs';
import { STATE_LIFECYCLE_CONFIG } from '../src/state-lifecycle.mjs';
import { readFile as readFixture } from 'node:fs/promises';
import { mkdtemp, rm } from 'node:fs/promises';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { BourbonBible } from '../src/core/bible.mjs';
import { ALL_STATE_SOURCES } from '../src/state-sources.mjs';
import { collectCentralCityHiveProductionSource } from '../src/collectors/central-cityhive-production.mjs';
import { canonicalizeSignal } from '../src/operational-report.mjs';
import { buildDrops, bibleLookup } from '../src/export-site-contract.mjs';
import { syntheticCentralPromotion, bibleFile } from './helpers/synthetic-central-production.mjs';

const bible = await BourbonBible.load(bibleFile);

test('Kansas first-publication contract stays fail closed until a fresh production cohort exists', async () => {
  const manifest = JSON.parse(await readFile(new URL('../data/state-integration/KS.json', import.meta.url), 'utf8'));
  assert.equal(manifest.lifecycle.publicStatus, 'research_only');
  assert.equal(manifest.customerPaths.status, 'not_admitted');
  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('KS'), false);
  assert.equal(STATE_LIFECYCLE_CONFIG.states.KS, undefined);
  assert.throws(() => verifyKansasFirstPublication({ status: 'not_promoted', stale: false }, { drops: [] }), /Kansas first publication/);
});

test('Kansas customer-path admission metadata is temporary and preview-only', async () => {
  const base = JSON.parse(await readFile(new URL('../data/state-integration/KS.json', import.meta.url), 'utf8'));
  const production = structuredClone(STATE_LIFECYCLE_CONFIG);
  const preview = { activeStates: ['KS'], states: { KS: { publicStatus: 'active' } } };
  const provenance = { status: 'verified_github_shadow_artifact', state: 'KS', workflowRunUrl: 'https://github.com/example/run/1' };
  const candidate = buildKansasCanaryManifest(base, production, preview, provenance, { files: { stateDrops: 'states/index.json' } });
  assert.equal(candidate.lifecycle.publicStatus, 'active');
  assert.equal(candidate.customerPaths.finder.status, 'verified');
  assert.equal(candidate.evidence.production.status, 'not_deployed');
  assert.equal(STATE_LIFECYCLE_CONFIG.activeStates.includes('KS'), false);
  assert.equal(STATE_LIFECYCLE_CONFIG.states.KS, undefined);
  assert.throws(() => buildKansasCanaryManifest(base, { ...production, states: { ...production.states, KS: { publicStatus: 'active' } } },
    preview, provenance, { files: { stateDrops: 'states/index.json' } }), /dormant production manifest/);
});

test('Kansas first-publication contract rejects incomplete or cached cohorts even with allocated rows', () => {
  const report = { status: 'useful', stale: false, metadata: { allDeliveryDisabled: true,
    cityhive: { complete: true, cacheReused: true, selectedStores: [], verifiedPremises: [] } } };
  assert.throws(() => verifyKansasFirstPublication(report, { drops: [] }), /fresh closed three-store/);
  report.metadata.cityhive.cacheReused = false;
  report.metadata.cityhive.complete = false;
  assert.throws(() => verifyKansasFirstPublication(report, { drops: [] }), /fresh closed three-store/);
});

test('Kansas first-publication verifier accepts only its reviewed silent three-city fixture projection', async t => {
  const directory = await mkdtemp(path.join(tmpdir(), 'ks-first-publish-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const nowMs = Date.parse('2026-11-14T14:00:00.000Z');
  const root = new URL('./fixtures/ks-cityhive/', import.meta.url);
  const manifest = JSON.parse(await readFixture(new URL('receipts.json', root), 'utf8'));
  const captures = new Map(await Promise.all(manifest.captures.map(async receipt => [
    receipt.fixture, await readFixture(new URL(receipt.fixture, root), 'utf8'),
  ])));
  const fixtures = new Map([
    ['kingsliquorolathe.com', 'kings-weller-special-reserve.json'],
    ['vernsliquor.com', 'verns-larceny-barrel-proof.json'],
    ['rjdiscountliquor.com', 'rj-elijah-and-larceny-barrel-proof.json'],
  ]);
  const admission = syntheticCentralPromotion('KS');
  const result = await collectCentralCityHiveProductionSource(ALL_STATE_SOURCES.find(state => state.id === 'KS'), bible, {
    ...admission, nowMs, cacheDir: path.join(directory, 'cache'), incidentDir: path.join(directory, 'incidents'),
    fetchText: async url => ({ ok: true, status: 200, url,
      text: `<script type="application/json">${captures.get(fixtures.get(new URL(url).hostname))}</script>` }),
  });
  const drops = buildDrops(result.signals.map(row => canonicalizeSignal(row, bible)), bibleLookup(bible.records), result.signals);
  const check = verifyKansasFirstPublication({ status: 'useful', stale: false,
    metadata: { cityhive: result.metadata, allDeliveryDisabled: true } }, { drops }, { nowMs });
  assert.equal(check.storeCount, 3);
  assert.equal(check.cities.length, 3);
  assert.equal(check.listingCount, 4);
  const unsafe = structuredClone(drops);
  unsafe[0].eligibleForDelivery = true;
  assert.throws(() => verifyKansasFirstPublication({ status: 'useful', stale: false,
    metadata: { cityhive: result.metadata, allDeliveryDisabled: true } }, { drops: unsafe }, { nowMs }), /fully disabled delivery/);
});
