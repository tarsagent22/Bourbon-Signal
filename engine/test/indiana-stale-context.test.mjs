import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { canonicalizeSignal, candidateFromChange } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops, buildAlerts, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';

const capture = JSON.parse(await readFile(new URL('./fixtures/indiana-retailer/2026-10-22-identity-regressions.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const lookup = bibleLookup(bible.records);
const original = capture.signals.find((row) => row.rawName === 'Buffalo Trace Bourbon');
const clone = (value) => JSON.parse(JSON.stringify(value));

test('Indiana retains valid stale source rows as public nonalertable context without changing the observation', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(original.observedAt) + 10 * 60_000 });
  for (const patch of [{ stale: true }, { sourceStale: true }, { raw: { ...original.raw, staleFallback: true } }]) {
    const source = { ...clone(original), ...patch, canAlertAsInventory: false, canAlertAsWatch: false };
    const canonical = clone(canonicalizeSignal(source, bible));
    const drops = clone(buildDrops([canonical], lookup, [canonical]));
    assert.equal(drops.length, 1, 'valid retained source identity remains visible as historical context');
    assert.equal(drops[0].canAlertAsInventory, false);
    assert.equal(drops[0].canAlertAsWatch, false);
    assert.equal(drops[0].observedAt, original.observedAt);
    assert.equal(drops[0].quantity, original.quantity);
    assert.equal(buildAlerts({ candidates: [candidateFromChange({ type: 'new_signal', key: canonical.key, after: canonical }, false)] }).length, 0);
    assert.equal(buildCurrentInventoryAlertsFromDrops(drops).length, 0);
  }
});
