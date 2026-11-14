import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { BourbonBible } from '../src/core/bible.mjs';
import { isShowermansResearchInventory, matchesShowermansPickup, parseShowermansInventory, showermans }
  from '../src/collectors/showermans-michigan-retail.mjs';
import { collectShowermansResearchReport, showermansResearchSourceForState } from '../src/research-showermans-runtime.mjs';

const [pickup, category] = await Promise.all(['pickup.html', 'allocated.html'].map(file =>
  readFile(new URL(`./fixtures/mi-showermans/${file}`, import.meta.url), 'utf8')));
const bottle = { id: 'blantons-gold-bourbon', canonicalName: "Blanton's Gold", aliases: ["Blanton's Gold Bourbon"],
  nationalTier: 'unicorn', stateOverrides: [], isAlertEligible: true };
const bible = new BourbonBible([{ id: 'blantons-gold', canonical: bottle.canonicalName,
  aliases: bottle.aliases, tier: 'unicorn', libraryIdentities: [bottle] }]);

test('Showerman’s requires exact curbside premise, current stock and a purchasable matching product', () => {
  assert.equal(matchesShowermansPickup(pickup), true);
  assert.equal(matchesShowermansPickup(pickup.replaceAll('15333 Merriman Rd', '15377 Merriman Rd')), false);
  const observedAt = '2026-11-14T22:29:32.190Z', nowMs = Date.parse(observedAt);
  const options = { pickupVerified: true, requestUrl: showermans.categoryUrl, observedAt };
  const rows = parseShowermansInventory(category, bible, options);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].productId, '27186');
  assert.equal(rows[0].price, 199.99);
  assert.equal(rows[0].observedAt, observedAt);
  assert.equal(isShowermansResearchInventory(rows[0], { nowMs }), true);
  assert.equal(isShowermansResearchInventory({ ...rows[0], eligibleForDelivery: true }, { nowMs }), false);
  assert.equal(isShowermansResearchInventory(rows[0], { nowMs: nowMs + 7_200_001 }), false);
  assert.deepEqual(parseShowermansInventory(category.replace('data-product_id="27186"', 'data-product_id="12345"'), bible, options), []);
  assert.deepEqual(parseShowermansInventory(category, bible, { ...options, requestUrl: showermans.pickupUrl }), []);
  assert.deepEqual(parseShowermansInventory(category, bible, { ...options, pickupVerified: false }), []);
});

test('Showerman’s requires shadow authority and persists host denial before another store request', async t => {
  const root = await mkdtemp(path.join(tmpdir(), 'showermans-retail-test-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const config = showermansResearchSourceForState('MI');
  const options = { reportDirectory: root, cursorDir: path.join(root, 'cursor'), incidentFile: path.join(root, 'incident.json') };
  await assert.rejects(collectShowermansResearchReport(config, bible, { ...options, env: {} }), /isolated/);
  const original = process.env.BOURBON_SIGNAL_SHADOW_MODE;
  process.env.BOURBON_SIGNAL_SHADOW_MODE = '1';
  t.after(() => { if (original == null) delete process.env.BOURBON_SIGNAL_SHADOW_MODE; else process.env.BOURBON_SIGNAL_SHADOW_MODE = original; });
  let attempts = 0;
  const deny = { ...options, async fetchText(url, request) {
    attempts++;
    assert.equal(url, showermans.pickupUrl);
    request.onResponse({ status: 429, retryAfterSeconds: 90_000 });
    throw new Error('Expected a denial to abort before another request');
  } };
  const first = await collectShowermansResearchReport(config, bible, deny);
  assert.equal(first.roadblocks[0]?.status, 'source_denial');
  const second = await collectShowermansResearchReport(config, bible, deny);
  assert.equal(second.roadblocks[0]?.status, 'source_cooldown_or_unresolved');
  assert.equal(attempts, 1);
  assert.equal(second.signals.length, 0);
  assert.equal(second.metadata.productionActivationAllowed, false);
});
