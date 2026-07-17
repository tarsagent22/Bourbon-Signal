import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { normalizeStateCodeParam } from '../src/lib/location-normalization.ts';

const readJson = async (relative) => JSON.parse(await readFile(new URL(`../${relative}`, import.meta.url), 'utf8'));
const lifecycle = await readJson('src/config/state-lifecycle.json');
const stateIndex = await readJson('engine/out/site/states/index.json');
const utah = await readJson('engine/out/site/states/UT/drops.json');
const alerts = await readJson('engine/out/site/alerts.json');

assert.ok(lifecycle.activeStates.includes('UT'));
assert.equal(lifecycle.states.UT.publicStatus, 'active');
assert.equal(lifecycle.states.UT.coverageTier, 'aggregate_inventory_watch');
assert.equal(lifecycle.states.UT.refinementLevel, 'statewide');
assert.equal(lifecycle.states.UT.inventoryAlertable, false);
assert.equal(lifecycle.states.UT.watchAlertable, false);
assert.equal(normalizeStateCodeParam('ut'), 'UT');
assert.ok(stateIndex.states.some((entry) => entry.state === 'UT' && entry.count === utah.count && entry.count > 0));
assert.ok(utah.drops.every((drop) => drop.state === 'UT'));
assert.ok(utah.drops.every((drop) => drop.informationalOnly === true && drop.canAlertAsInventory === false && drop.canAlertAsWatch === false));
assert.equal((alerts.alerts || []).filter((alert) => alert.state === 'UT').length, 0);

console.log(`Utah generated user path passed: ${utah.count} informational drops and zero alert candidates.`);
