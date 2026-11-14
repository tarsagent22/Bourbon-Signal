import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../engine/src/core/bible.mjs';
import { LOUISIANA_ALASKA_GROCERY_SOURCES } from '../engine/src/collectors/louisiana-alaska-grocery-premises.mjs';
import { parseLouisianaAlaskaGroceryInventory } from '../engine/src/collectors/louisiana-alaska-grocery-expansion.mjs';
import { toLouisianaAlaskaGroceryOnSiteSignal } from '../engine/src/louisiana-alaska-grocery-policy.mjs';
import { bibleLookup, buildDrops, isSafePublicSignal } from '../engine/src/export-site-contract.mjs';
import { canonicalizeSignal } from '../engine/src/operational-report.mjs';
import * as publicEvidenceModule from '../src/lib/public-drop-evidence.ts';
import * as visibilityModule from '../src/lib/drop-feed-visibility.ts';
import * as siteEngineModule from '../src/lib/site-engine-contract.ts';
import * as coverageModelModule from '../src/lib/coverage-model.ts';
const { isPublicDropFeedEligible, publicDropDegradedStateReasons } = publicEvidenceModule.default || publicEvidenceModule;
const { isUserFacingDropSignal } = visibilityModule.default || visibilityModule;
const { normalizeDropForSite } = siteEngineModule.default || siteEngineModule;
const { buildCoverageContract } = coverageModelModule.default || coverageModelModule;
const observedAt = '2026-11-14T13:05:08.801Z';
const asOf = '2026-11-14T13:34:45.441Z';

const bible = await BourbonBible.load(new URL('../engine/out/bourbon-bible.json', import.meta.url));
const identity = JSON.parse(await readFile(new URL('../engine/test/fixtures/louisiana-alaska/identity.json', import.meta.url), 'utf8'));
for (const state of ['AK', 'LA']) {
  const source = LOUISIANA_ALASKA_GROCERY_SOURCES.find(row => row.stateCode === state);
  const product = structuredClone(identity.product);
  product.storeId = source.merchantId;
  const sourceRow = parseLouisianaAlaskaGroceryInventory({ appCode: 'GR200', response: { docs: [product] } }, source, bible,
    { observedAt })[0];
  assert.ok(sourceRow, `${state}: fixture must match current tracked inventory`);
  const row = toLouisianaAlaskaGroceryOnSiteSignal(sourceRow);
  assert.ok(row, `${state}: production binary projection must pass its source proof`);
  assert.equal(row.quantity, 0);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.sourceProductBinding.productSnapshot.channelInventory.instoreItemQty, '4');
  assert.equal(row.canAlertAsInventory, false);
  assert.equal(row.canAlertAsWatch, false);
  assert.equal(row.eligibleForDelivery, false);
  assert.equal(row.eligibleForEmail, false);
  assert.equal(row.eligibleForSms, false);
  assert.equal(isSafePublicSignal(row), true);
  assert.equal(isUserFacingDropSignal(row), true);
  assert.equal(isPublicDropFeedEligible(row), true);
  const canonical = canonicalizeSignal(row, bible);
  assert.equal(isSafePublicSignal(canonical), true, `${state}: canonicalized production evidence must remain eligible`);
  const drops = buildDrops([canonical], bibleLookup(bible.records), [canonical]);
  assert.equal(drops.length, 1, `${state}: expected one mark-preserving customer drop`);
  const normalized = normalizeDropForSite(drops[0]);
  assert.equal(normalized.quantity, 0);
  assert.equal(normalized.sourceProductBinding.productSnapshot.channelInventory.instoreItemQty, '4');
  assert.equal(normalized.is_user_facing_drop, true);
  const overdueSibling = { state, status: 'degraded', reasons: ['inventory_confirmation_overdue'] };
  const options = { asOf, degradedStateCodes: new Set([state]),
    degradedStateReasons: publicDropDegradedStateReasons([overdueSibling]) };
  assert.equal(isPublicDropFeedEligible(normalized, options), true);
  assert.equal(isPublicDropFeedEligible(normalized, { ...options, asOf: '2026-11-14T15:10:00.000Z' }), false);
  assert.equal(isPublicDropFeedEligible({ ...normalized, lastConfirmedAt: '2026-11-14T10:00:00.000Z' }, options), false);
  assert.equal(isPublicDropFeedEligible({ ...normalized, sourceStale: true }, options), false);
  const market = { publicStatus: 'active', lifecycle: 'retailer_store_inventory', coverageTier: 'sparse_live_store_inventory', sourceLabel: source.name };
  const coverage = degradedStates => buildCoverageContract({
    asOf, lifecycle: { activeStates: [state], states: { [state]: market } }, degradedStates,
    stateRows: [{ state, ...market, signalCount: 1, bestLocationPrecision: 'store_level' }], drops: [normalized],
  }).states.find(entry => entry.code === state);
  assert.equal(coverage([overdueSibling]).freshness.currentInventoryStores, 1);
  assert.equal(coverage([overdueSibling]).freshness.alertEligibleStores, 0);
  for (const boundary of [
    { ...overdueSibling, status: 'blocked' },
    { ...overdueSibling, reasons: ['inventory_confirmation_overdue', 'significant_drop_count_collapse'] },
  ]) {
    assert.equal(isPublicDropFeedEligible(normalized, { ...options, degradedStateReasons: publicDropDegradedStateReasons([boundary]) }), false);
    assert.equal(coverage([boundary]).freshness.currentInventoryStores, 0);
  }
  for (const mutation of [{ quantity: 1 }, { storeId: 'unreviewed:1' }, { canAlertAsInventory: true }, { previewOnly: true },
    { sourceRuntimeId: `research:${state.toLowerCase()}:grocery-xapi` },
    { sourceProductBinding: { ...row.sourceProductBinding, productionOnSite: false } }]) {
    const changed = { ...row, ...mutation };
    assert.equal(isSafePublicSignal(changed), false, `${state}: mutated source proof must not enter export`);
    assert.equal(isUserFacingDropSignal(changed), false, `${state}: mutated source proof must not be user-facing`);
    assert.equal(isPublicDropFeedEligible(changed), false, `${state}: mutated source proof must not enter public feed`);
  }
  console.log(JSON.stringify({ state, quantity: normalized.quantity, binary: normalized.quantityIsExact === false,
    userFacing: normalized.is_user_facing_drop, alertsDisabled: !normalized.canAlertAsInventory && !normalized.canAlertAsWatch }));
}
