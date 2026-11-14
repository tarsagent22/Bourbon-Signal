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
const { isPublicDropFeedEligible } = publicEvidenceModule.default || publicEvidenceModule;
const { isUserFacingDropSignal } = visibilityModule.default || visibilityModule;
const { normalizeDropForSite } = siteEngineModule.default || siteEngineModule;

const bible = await BourbonBible.load(new URL('../engine/out/bourbon-bible.json', import.meta.url));
const identity = JSON.parse(await readFile(new URL('../engine/test/fixtures/louisiana-alaska/identity.json', import.meta.url), 'utf8'));
for (const state of ['AK', 'LA']) {
  const source = LOUISIANA_ALASKA_GROCERY_SOURCES.find(row => row.stateCode === state);
  const product = structuredClone(identity.product);
  product.storeId = source.merchantId;
  const sourceRow = parseLouisianaAlaskaGroceryInventory({ appCode: 'GR200', response: { docs: [product] } }, source, bible,
    { observedAt: new Date().toISOString() })[0];
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
