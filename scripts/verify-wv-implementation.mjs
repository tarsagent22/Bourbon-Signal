import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import {
  parseWestVirginiaBarrelSelections,
  westVirginiaDirectorySignals,
} from '../engine/src/collectors/west-virginia-official.mjs';

const lifecycle = JSON.parse(await readFile(new URL('../src/config/state-lifecycle.json', import.meta.url), 'utf8'));
const stateSources = await readFile(new URL('../engine/src/state-sources.mjs', import.meta.url), 'utf8');
const exporter = await readFile(new URL('../engine/src/export-site-contract.mjs', import.meta.url), 'utf8');
const feedVisibility = await readFile(new URL('../src/lib/drop-feed-visibility.ts', import.meta.url), 'utf8');

if (lifecycle.states.WV?.publicStatus === 'active') {
  assert.ok(lifecycle.activeStates.includes('WV'), 'Active WV must be present in activeStates.');
  assert.ok(lifecycle.states.WV?.promotionEvidence?.immutableEvidence, 'Active WV requires immutable promotion evidence.');
} else {
  assert.equal(lifecycle.states.WV?.publicStatus, 'research_only');
  assert.equal(lifecycle.activeStates.includes('WV'), false);
  assert.equal(lifecycle.states.WV?.shadowEligible, true);
}
assert.equal(lifecycle.states.WV?.lifecycle, 'official_barrel_selection_updates');
assert.equal(lifecycle.states.WV?.coverageTier, 'shipment_drop_intelligence');
assert.equal(lifecycle.states.WV?.inventoryAlertable, false);
assert.equal(lifecycle.states.WV?.watchAlertable, false);
assert.match(lifecycle.states.WV?.customerSummary || '', /do(?:es)? not confirm shelf stock/i);
assert.match(stateSources, /wv-abca-barrel-selections/);
assert.match(exporter, /isWestVirginiaOfficialBarrelSelectionSignal/);
assert.match(feedVisibility, /isWestVirginiaOfficialBarrelSelection/);

const directorySignals = westVirginiaDirectorySignals({ nowAt: '2026-08-09T21:00:00.000Z' });
assert.equal(directorySignals.length, 180);
assert.equal(directorySignals.filter((row) => row.canAlertAsInventory || row.canAlertAsWatch).length, 0);
assert.equal(new Set(directorySignals.map((row) => row.storeId)).size, 180);
assert.equal(new Set(directorySignals.map((row) => row.observedAt)).size, 1);
assert.ok(directorySignals.every((row) => row.raw.snapshotCapturedAt === row.observedAt && row.stale === false));

const staleFixture = '<h2>New 2025 discounts for limited barrel selections:</h2><p>28204 - Ezra Brooks Stave Finish Spice &amp; Clove</p>';
assert.equal(parseWestVirginiaBarrelSelections(staleFixture, { currentYear: 2026 }).length, 0);

process.stdout.write(`${JSON.stringify({ state: 'WV', knownStores: 180, inventoryAlertable: false, watchAlertable: false })}\n`);
