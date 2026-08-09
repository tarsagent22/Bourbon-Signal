import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  enrichWestVirginiaBarrelSelections,
  parseWestVirginiaBarrelSelections,
  westVirginiaDirectorySignals,
} from '../src/collectors/west-virginia-official.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { bibleLookup, buildDrops } from '../src/export-site-contract.mjs';
import { derivePublicDropEvidence } from '../../src/lib/public-drop-evidence.ts';

const fixtureHtml = `
  <main>
    <h2>New 2026 discounts for limited barrel selections:</h2>
    <ul>
      <li>28204 - Ezra Brooks Stave Finish Spice &amp; Clove: A great choice for an Old-Fashioned.</li>
      <li>28206 - Rebel Full Proof Selection: Try it in a Hot Buttered Rebel to warm up!</li>
      <li>23911 - Yellowstone Handpicked 109 proof: Makes a great Smoky Whiskey Mule.</li>
      <li>26665 - Yellowstone Handpicked 119 proof: Perfect for a Yellowstone Gold Rush Cocktail.</li>
      <li>28208 - Rebel Stave Finish Collection Rich Mocha: Add to your coffee or enjoy over ice.</li>
    </ul>
    <h2>Available barrel selections (not discounted)</h2>
    <ul>
      <li>28276 - Wilderness Trail Rye Green Label Private Selection - $61.25</li>
      <li>28285 - Myers's Rum Single Barrel - $35.67</li>
      <li>28286 - Corazon Tequila Single Barrel selections</li>
    </ul>
    <h2>2025 historical selections</h2>
    <p>28111 - Maker's Mark Private Selection - $49.99</p>
  </main>
`;

test('WV official parser keeps only current whiskey selections and never implies shelf stock', () => {
  const rows = parseWestVirginiaBarrelSelections(fixtureHtml, {
    observedAt: '2026-08-09T20:00:00.000Z',
    currentYear: 2026,
  });

  assert.equal(rows.length, 6);
  assert.deepEqual(rows.map((row) => row.stockNumber), ['28204', '28206', '23911', '26665', '28208', '28276']);
  assert.equal(rows.some((row) => /cocktail|old-fashioned|warm up/i.test(row.productName)), false);
  assert.equal(rows.some((row) => /rum|tequila|2025|maker/i.test(row.productName)), false);
  for (const row of rows) {
    assert.equal(row.state, 'WV');
    assert.equal(row.locationPrecision, 'statewide_catalog');
    assert.equal(row.sourceAvailabilityVerified, false);
    assert.equal(row.canAlertAsInventory, false);
    assert.equal(row.canAlertAsWatch, false);
    assert.equal(row.quantity, null);
    assert.match(row.readableSummary, /retailers may be able to order/i);
    assert.match(row.readableSummary, /does not confirm shelf stock/i);
  }
});

test('WV official parser rejects truncated or collapsed current-year responses', () => {
  assert.equal(parseWestVirginiaBarrelSelections('<h2>New 2026 discounts for limited barrel selections:</h2><p>28204 - Ezra Brooks Stave Finish Spice &amp; Clove</p>', { currentYear: 2026 }).length, 0);
  assert.equal(parseWestVirginiaBarrelSelections('<h2>New 2026 discounts for limited barrel selections:</h2><p>28204 - Ezra Brooks Stave Finish Spice &amp; Clove</p><h2>Corazon Single Barrel</h2>', { currentYear: 2026 }).length, 0);
});

test('WV directory publishes every active official premise as searchable, directory-only, and non-alertable', async () => {
  const universe = JSON.parse(await readFile(new URL('../data/store-universe/WV.json', import.meta.url), 'utf8'));
  const rows = westVirginiaDirectorySignals({ nowAt: '2026-08-09T21:00:00.000Z' });
  const expiredSnapshotRows = westVirginiaDirectorySignals({ nowAt: '2026-08-11T21:00:00.000Z' });

  assert.equal(universe.storeCount, 180);
  assert.equal(rows.length, universe.storeCount);
  assert.equal(new Set(rows.map((row) => row.storeId)).size, rows.length);
  assert.ok(new Set(rows.map((row) => row.storeCity)).size >= 100);
  for (const row of rows) {
    assert.match(row.storeAddress, /\S/);
    assert.match(row.storeCity, /\S/);
    assert.equal(row.locationPrecision, 'store_level');
    assert.equal(row.inventoryCapability, 'directory_only');
    assert.equal(row.sourceAvailabilityVerified, false);
    assert.equal(row.canAlertAsInventory, false);
    assert.equal(row.canAlertAsWatch, false);
    assert.equal(row.observedAt, universe.source.capturedAt);
    assert.equal(row.stale, false);
    assert.equal(row.raw.directoryOnly, true);
    assert.equal(row.raw.storeDigest, universe.source.storeDigest);
  }
  assert.ok(expiredSnapshotRows.every((row) => row.observedAt === universe.source.capturedAt && row.stale === true));
});

test('WV official selection rows reach the customer feed only as non-alertable ordering intelligence', async () => {
  const bibleData = JSON.parse(await readFile(new URL('../out/bourbon-bible.json', import.meta.url), 'utf8'));
  const bible = new BourbonBible(bibleData.records);
  const lookup = bibleLookup(bibleData.records);
  const rows = enrichWestVirginiaBarrelSelections(parseWestVirginiaBarrelSelections(fixtureHtml, {
    observedAt: '2026-08-09T20:00:00.000Z',
    currentYear: 2026,
  }), bible);
  const normalizedRows = rows.map((row) => ({
    ...row,
    sourceRuntimeId: 'wv:configured:wv-abca-barrel-selections',
    raw: undefined,
  }));
  const drops = buildDrops(normalizedRows, lookup, normalizedRows);

  assert.equal(rows.filter((row) => row.canonicalBottleId).length, 6);
  assert.equal(drops.length, 6);
  const evidence = derivePublicDropEvidence(drops, '2026-08-09T21:00:00.000Z').get('WV');
  assert.equal(evidence?.freshPublicSignalCount, 6);
  assert.equal(evidence?.freshPublicUpdateSignalCount, 6);
  assert.equal(evidence?.currentInventoryStores.length, 0);
  assert.equal(evidence?.alertableInventoryStores.length, 0);
  for (const drop of drops) {
    assert.equal(drop.canAlertAsInventory, false);
    assert.equal(drop.canAlertAsWatch, false);
    assert.equal(drop.eligibleForOnSite, true);
    assert.equal(drop.eligibleForDelivery, false);
    assert.equal(drop.eligibleForEmail, false);
    assert.equal(drop.eligibleForSms, false);
    assert.match(drop.inventorySemantics, /not live shelf inventory/i);
    assert.match(drop.inventoryCaveat, /not live shelf inventory/i);
  }
});

test('WV lifecycle remains shadow-only until provenance activates statewide official updates, with every alert channel disabled', async () => {
  const lifecycle = JSON.parse(await readFile(new URL('../../src/config/state-lifecycle.json', import.meta.url), 'utf8'));
  const entry = lifecycle.states.WV;

  if (entry.publicStatus === 'active') {
    assert.ok(lifecycle.activeStates.includes('WV'));
    assert.ok(entry.promotionEvidence?.immutableEvidence);
  } else {
    assert.equal(entry.publicStatus, 'research_only');
    assert.equal(lifecycle.activeStates.includes('WV'), false);
    assert.equal(entry.shadowEligible, true);
  }
  assert.equal(entry.coverageTier, 'shipment_drop_intelligence');
  assert.equal(entry.refinementLevel, 'statewide');
  assert.match(entry.customerSummary, /official.*barrel[- ]selection/i);
  assert.match(entry.customerSummary, /not.*shelf/i);
});
