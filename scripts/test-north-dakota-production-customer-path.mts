import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { canonicalizeSignal } from '../engine/src/operational-report.mjs';
import { bibleLookup, buildDrops, buildStores } from '../engine/src/export-site-contract.mjs';
import { buildStateDropPartitions, verifyStateDropPartitions } from '../engine/src/site-state-partitions.mjs';
import { verifyStateIntegration } from '../engine/src/verify-state-integration.mjs';
import { verifyNorthDakotaFirstPublication } from '../engine/src/verify-nd-first-publication.mjs';
import * as siteContractModule from '../src/lib/site-engine-contract.ts';
import * as classificationModule from '../src/lib/drop-classification.ts';
import * as publicEvidenceModule from '../src/lib/public-drop-evidence.ts';

function interop<T>(value: T): T { return (value as { default?: T }).default || value; }
const { normalizeDropForSite } = interop(siteContractModule);
const { classifyPublicDrop, getDropClassificationIndex } = interop(classificationModule);
const { derivePublicDropEvidence, isPublicDropFeedEligible } = interop(publicEvidenceModule);
const fixture = JSON.parse(readFileSync('engine/test/fixtures/north-dakota-production-signals.json', 'utf8'));
const config = JSON.parse(readFileSync('src/config/state-lifecycle.json', 'utf8'));
const manifest = JSON.parse(readFileSync('engine/data/state-integration/ND.json', 'utf8'));
const stateFixture = JSON.parse(readFileSync('engine/data/state-fixtures/ND.json', 'utf8'));
const classification = JSON.parse(readFileSync('src/data/drop-feed-classification.generated.json', 'utf8'));
const bible = new BourbonBible(fixture.bibleRecords);
const now = Date.parse(fixture.generatedAt) + 5_000;
const originalNow = Date.now;
Date.now = () => now;

try {
  const operational = fixture.signals.map((signal: Record<string, unknown>) => canonicalizeSignal(signal, bible));
  assert.equal(operational.length, 3);
  for (const row of operational) {
    assert.equal(row.canAlertAsInventory, false);
    assert.equal(row.canAlertAsWatch, false);
    assert.equal(row.eligibleForOnSite, true);
    assert.equal(row.eligibleForDropFeed, true);
    assert.equal(row.eligibleForWatch, false);
    assert.equal(row.eligibleForDelivery, false);
    assert.equal(row.deliveryEligible, false);
    assert.equal(row.eligibleForEmail, false);
    assert.equal(row.eligibleForSms, false);
    assert.ok(row.inventorySemantics);
  }

  const lookup = bibleLookup(bible.records);
  const drops = buildDrops(operational, lookup, operational).map(normalizeDropForSite);
  assert.equal(drops.length, 3, 'production builder must keep all exact on-site rows');
  assert.ok(drops.every((drop: Record<string, unknown>) => drop.quantity === 0 && drop.quantityIsExact === false));
  assert.ok(drops.every((drop: Record<string, unknown>) => drop.canAlertAsInventory === false && drop.deliveryEligible === false));

  const stores = buildStores(operational).filter((store: Record<string, unknown>) => store.state === 'ND');
  assert.equal(stores.length, 2);
  assert.deepEqual(stores.map((store: Record<string, unknown>) => store.address).sort(), [
    '1730 13th Ave N, Grand Forks, ND 58203, USA',
    '20 26th St E, Williston, ND 58801',
  ].sort());
  assert.deepEqual(stores.map((store: Record<string, unknown>) => store.signalCount).sort(), [1, 2]);
  assert.ok(stores.every((store: Record<string, unknown>) => store.sourceAvailabilityVerified === true));

  const generatedAt = new Date(now).toISOString();
  const partitions = buildStateDropPartitions(drops, {
    contractVersion: 'bourbon-signal-site-v0.1', generatedAt, activeStates: ['ND'],
  });
  assert.equal(verifyStateDropPartitions(drops, partitions).ok, true);
  const stateDrops = partitions.payloads.get('ND');
  assert.equal(stateDrops?.count, 3);
  const publicationReceipt = verifyNorthDakotaFirstPublication(
    { ...fixture.publicationReport, signals: fixture.signals }, stateDrops, bible, { nowMs: now },
  );
  assert.equal(publicationReceipt.publishedRows, 3);
  assert.equal(publicationReceipt.publishedStores, 2);
  assert.equal(publicationReceipt.allDeliveryChannelsDisabled, true);
  assert.deepEqual(new Set(publicationReceipt.indexedSearches.map((item: Record<string, unknown>) => item.sourceRuntimeId)),
    new Set(['nd:rock-cityhive', 'nd:albertsons-xapi']));

  const locations = stores.map((store: Record<string, unknown>) => ({ ...store, locationType: 'store', type: 'store' }));
  const siteVerification = verifyStateIntegration({
    state: 'ND', config, manifest, fixtures: stateFixture,
    site: {
      stateIndex: partitions.index,
      stateDrops: { ND: stateDrops },
      drops: { drops },
      alerts: { alerts: [] },
      stats: { stateCoverage: { states: [{ state: 'ND', status: 'active', signalCount: drops.length }] } },
      locations: { locations },
    },
    promotionEvidenceRequired: true,
  });
  assert.deepEqual(siteVerification.failures, [], siteVerification.failures.join('\n'));

  const index = getDropClassificationIndex(classification.records);
  const classified = drops.map((drop: Record<string, unknown>) => classifyPublicDrop(drop, index));
  assert.ok(classified.every((drop: Record<string, unknown>) => isPublicDropFeedEligible(drop, { asOf: new Date(now) })));
  const current = derivePublicDropEvidence(classified, new Date(now)).get('ND');
  assert.equal(current?.currentInventoryStores.length, 2);
  assert.deepEqual(current?.currentInventoryStores.map((store: Record<string, unknown>) => store.address).sort(),
    stores.map((store: Record<string, unknown>) => store.address).sort());
  assert.equal(current?.alertableInventoryStores.length, 0);
} finally {
  Date.now = originalNow;
}

console.log(`North Dakota production customer path passed from source report ${fixture.sourceRunId}.`);
