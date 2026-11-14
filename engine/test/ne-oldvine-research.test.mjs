import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import {
  NE_OLD_VINE_RESEARCH_SOURCE,
  isOldVineNebraskaResearchRow,
  parseOldVineBladeAndBowResearchPage,
} from '../src/research-ne-oldvine-runtime.mjs';

const fixtureDir = new URL('./fixtures/ne-oldvine-20261114/', import.meta.url);
const html = await readFile(new URL('blade-and-bow.html', fixtureDir), 'utf8');
const libraryRecord = JSON.parse(await readFile(new URL('library-record.json', fixtureDir), 'utf8'));
const bible = new BourbonBible([libraryRecord]);
const observedAt = '2026-11-14T13:08:52.073Z';
const now = Date.parse('2026-11-14T13:09:00.000Z');

test('retained Old Vine detail replays as one exact limited, pickup-only research candidate', () => {
  const row = parseOldVineBladeAndBowResearchPage(html, bible, { observedAt, now });
  assert(row);
  assert.equal(row.state, 'NE');
  assert.equal(row.storeId, 'ne:retail-c:113941');
  assert.equal(row.storeAddress, '3821 N 167th Ct Suite 145, Omaha, NE 68116');
  assert.equal(row.productId, '17823');
  assert.equal(row.canonicalBottleId, 'bb_8924180d0cc2d853');
  assert.equal(row.canonicalName, 'Blade and Bow Bourbon');
  assert.equal(row.tier, 'limited');
  assert.equal(row.price, 54.99);
  assert.equal(row.quantity, 0);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.sourceProductBinding.sizeMl, 750);
  assert.equal(row.sourceProductBinding.proof, 91);
  assert.equal(row.sourceProductBinding.pickupVerified, true);
  assert.equal(row.researchOnly, true);
  assert.equal(row.canAlertAsInventory, false);
  assert.equal(row.canAlertAsWatch, false);
  assert.equal(row.eligibleForDelivery, false);
  assert.equal(row.eligibleForOnSite, false);
  assert.equal(isOldVineNebraskaResearchRow(row), true);
  assert.equal(NE_OLD_VINE_RESEARCH_SOURCE.status, 'research_only');
});

test('exact URL, exact SKU and title, size, proof, stock, offer, and limited library identity are required', () => {
  assert.equal(parseOldVineBladeAndBowResearchPage(html, bible, { observedAt, finalUrl: 'https://attacker.example/product/blade-and-bow-bourbon/', now }), null);
  assert.equal(parseOldVineBladeAndBowResearchPage(html, bible, { observedAt, now: Date.parse('2026-11-16T13:08:53.000Z') }), null);
  for (const [from, to] of [
    ['product-17823', 'product-17824'],
    ['value="17823"', 'value="17824"'],
    ['https://schema.org/InStock', 'https://schema.org/OutOfStock'],
    ['One 91 proof 750 mL bottle', 'One 91 proof 375 mL bottle'],
    ['One 91 proof 750 mL bottle of Blade and Bow Kentucky Straight Bourbon Whiskey', 'One 91 proof 750 mL bottle of Blade and Bow Rye Whiskey'],
  ]) {
    assert.equal(parseOldVineBladeAndBowResearchPage(html.replace(from, to), bible, { observedAt, now }), null, from);
  }
  assert.equal(parseOldVineBladeAndBowResearchPage(html, new BourbonBible([]), { observedAt, now }), null);
  const row = parseOldVineBladeAndBowResearchPage(html, bible, { observedAt, now });
  assert(row);
  assert.equal(isOldVineNebraskaResearchRow({ ...row, quantity: 6, quantityIsExact: true }), false,
    'the storefront quantity input maximum is not asserted as stock quantity');
});
