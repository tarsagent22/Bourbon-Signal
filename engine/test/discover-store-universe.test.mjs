import assert from 'node:assert/strict';
import test from 'node:test';

import { getStateName, stateMatchesText } from '../src/discovery/state-name-registry.mjs';
import { detectPlatformFingerprints } from '../src/discovery/platform-fingerprints.mjs';
import { buildStoreDiscoveryInput } from '../src/discover-store-universe.mjs';

test('shared state registry supplies all-state names and aliases without state-specific discovery branches', () => {
  assert.equal(getStateName('CO'), 'Colorado');
  assert.equal(stateMatchesText('CO', 'Denver, Colorado bourbon retailer'), true);
  assert.equal(stateMatchesText('CO', 'Cheyenne, Wyoming retailer'), false);
});

test('platform fingerprints classify reusable storefront families and Brave candidates stay discovery-only', () => {
  const fingerprints = detectPlatformFingerprints(`
    cdn.shopify.com assets.cityhive.app wp-json/wc/store
    square.site lightspeedhq.com bottlecapps bottlepos grabbl pos360 remix
    Colorado Liquor Enforcement Division
  `);
  assert.deepEqual(fingerprints, [
    'shopify', 'cityhive', 'woocommerce', 'square', 'lightspeed', 'bottlecapps', 'bottlepos', 'grabbl', 'pos360_remix', 'official_source',
  ]);
  const input = buildStoreDiscoveryInput({
    stateId: 'CO',
    braveCandidates: [{ title: 'Denver Spirits', url: 'https://denver.example/collections/bourbon', description: 'Colorado bourbon retailer', domain: 'denver.example' }],
    existingSeeds: [],
  });
  assert.equal(input.seeds.length, 1);
  assert.equal(input.seeds[0].inventoryStatus, 'discovery-only');
  assert.equal(input.seeds[0].promotionEligible, false);
  assert.deepEqual(input.seeds[0].platformHints, []);
});
