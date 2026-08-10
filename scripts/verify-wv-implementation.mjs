import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  parseWestVirginiaBarrelSelections,
  westVirginiaDirectorySignals,
  westVirginiaRecentPurchaseSignal,
} from '../engine/src/collectors/west-virginia-official.mjs';

const lifecycle = JSON.parse(await readFile(new URL('../src/config/state-lifecycle.json', import.meta.url), 'utf8'));
const stateSources = await readFile(new URL('../engine/src/state-sources.mjs', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../engine/src/export-site-contract.mjs', import.meta.url), 'utf8');
const feedVisibility = await readFile(new URL('../src/lib/drop-feed-visibility.ts', import.meta.url), 'utf8');
const gatewayRoute = await readFile(new URL('../src/app/api/source/wvabca/route.ts', import.meta.url), 'utf8');
const gatewaySource = await readFile(new URL('../src/lib/wvabca-source-gateway.ts', import.meta.url), 'utf8');
const nextConfig = await readFile(new URL('../next.config.ts', import.meta.url), 'utf8');

if (lifecycle.states.WV?.publicStatus === 'active') {
  assert.ok(lifecycle.activeStates.includes('WV'), 'Active WV must be present in activeStates.');
  assert.ok(lifecycle.states.WV?.promotionEvidence?.immutableEvidence, 'Active WV requires immutable promotion evidence.');
} else {
  assert.equal(lifecycle.states.WV?.publicStatus, 'research_only');
  assert.equal(lifecycle.activeStates.includes('WV'), false);
  assert.equal(lifecycle.states.WV?.shadowEligible, true);
}
assert.equal(lifecycle.states.WV?.lifecycle, 'exact_store_recent_purchase_and_barrel_updates');
assert.equal(lifecycle.states.WV?.coverageTier, 'shipment_drop_intelligence');
assert.equal(lifecycle.states.WV?.refinementLevel, 'exact_store');
assert.equal(lifecycle.states.WV?.inventoryAlertable, false);
assert.equal(lifecycle.states.WV?.watchAlertable, false);
assert.match(lifecycle.states.WV?.customerSummary || '', /exact-store.*purchase/i);
assert.match(lifecycle.states.WV?.customerSummary || '', /not live shelf inventory/i);
assert.match(stateSources, /wv-abca-recent-purchases/);
assert.match(stateSources, /wv-abca-barrel-selections/);
assert.match(exporter, /isWestVirginiaRecentPurchaseSignal/);
assert.match(exporter, /isWestVirginiaOfficialBarrelSelectionSignal/);
assert.match(feedVisibility, /isWestVirginiaRecentPurchase/);
assert.match(feedVisibility, /isWestVirginiaOfficialBarrelSelection/);
assert.match(gatewayRoute, /authorizeWvabcaGateway[\s\S]*readCachedWvabcaGatewayPayload/);
assert.match(gatewayRoute, /authorization !== "authorized"/);
assert.match(gatewaySource, /ENGINE_SNAPSHOT_ENCRYPTION_KEY/);
assert.match(gatewaySource, /createHmac\("sha256", key\)\.update\(AUTH_LABEL\)/);
assert.match(gatewaySource, /\^Bearer\\s\+\(\[a-f0-9\]\{64\}\)\$/i);
assert.match(gatewayRoute, /private, no-store/);
assert.match(nextConfig, /api\/source\/wvabca/);
assert.match(nextConfig, /favicon\.ico\|api\/source\/wvabca/);

const directorySignals = westVirginiaDirectorySignals({ nowAt: '2026-08-09T21:00:00.000Z' });
assert.equal(directorySignals.length, 180);
assert.equal(directorySignals.filter((row) => row.canAlertAsInventory || row.canAlertAsWatch).length, 0);
assert.equal(new Set(directorySignals.map((row) => row.storeId)).size, 180);
assert.equal(new Set(directorySignals.map((row) => row.observedAt)).size, 1);
assert.ok(directorySignals.every((row) => row.raw.snapshotCapturedAt === row.observedAt && row.stale === false));

const recentPurchase = westVirginiaRecentPurchaseSignal({
  StoreNumber: 624,
  StoreName: '7-eleven #10670',
  StreetAddress1: '1015 N. Queen St.',
  City: 'Martinsburg,WV',
  PhoneNumber: '(304) 263-3111',
  ProductID: 827,
  ProductName: 'Buffalo Trace Kentucky Straight Bourbon Whiskey',
  BottleSize: 750,
}, {
  bottle: { id: 'buffalo-trace', canonical: 'Buffalo Trace', producer: 'Buffalo Trace' },
  observedAt: '2026-08-10T16:00:00.000Z',
});
assert.ok(recentPurchase);
assert.equal(recentPurchase?.storeId, 'wvabca-store-624');
assert.equal(recentPurchase?.storeAddress, '1015 N. Queen St., Martinsburg, WV');
assert.equal(recentPurchase?.sourceAvailabilityVerified, false);
assert.equal(recentPurchase?.canAlertAsInventory, false);
assert.equal(recentPurchase?.canAlertAsWatch, false);

const staleFixture = '<h2>New 2025 discounts for limited barrel selections:</h2><p>28204 - Ezra Brooks Stave Finish Spice &amp; Clove</p>';
assert.equal(parseWestVirginiaBarrelSelections(staleFixture, { currentYear: 2026 }).length, 0);

process.stdout.write(`${JSON.stringify({ state: 'WV', knownStores: 180, inventoryAlertable: false, watchAlertable: false })}\n`);
