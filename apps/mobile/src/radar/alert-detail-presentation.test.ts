import assert from 'node:assert/strict';
import test from 'node:test';
import { radarBottleLabel, radarDirectionsUrl, radarStoreAddress } from './alert-detail-presentation';

test('retailer notices and sizes leave the exact bottle edition intact', () => {
  assert.deepEqual(radarBottleLabel('Old Fitzgerald Bourbon Bib 7 Year Whiskey - 700 Ml (limited quantities may be available in store)'), { name: 'Old Fitzgerald Bourbon Bib 7 Year Whiskey', size: '700 mL', proof: null });
  assert.deepEqual(radarBottleLabel('W.L. Weller Full Proof Kentucky Straight Bourbon Whiskey 114 Proof - 750 Ml (limited quantities may be available in store)'), { name: 'W.L. Weller Full Proof', size: '750 mL', proof: '114 Proof' });
  assert.deepEqual(radarBottleLabel('Four Roses (OBSV) Barrel Strength - 750ml'), { name: 'Four Roses (OBSV) Barrel Strength', size: '750 mL', proof: null });
  assert.deepEqual(radarBottleLabel('Eagle Rare 10 Year'), { name: 'Eagle Rare 10 Year', size: null, proof: null });
  assert.deepEqual(radarBottleLabel('Colonel E.H. Taylor Barrel Proof Straight Kentucky Bourbon Whiskey Variable Proof - 750 Ml'), { name: 'Colonel E.H. Taylor Barrel Proof', size: '750 mL', proof: 'Variable Proof' });
  assert.equal(radarBottleLabel('Maker’s Mark - Private Selection').name, 'Maker’s Mark - Private Selection');
});

test('directions require an address and preserve the store number and locality', () => {
  const store = 'Safeway #343 — 3960 S Val Vista Dr, Gilbert, AZ 85297';
  assert.equal(radarStoreAddress(store), '3960 S Val Vista Dr, Gilbert, AZ 85297');
  const url = new URL(radarDirectionsUrl(store)!);
  assert.equal(url.searchParams.get('destination'), 'Safeway #343, 3960 S Val Vista Dr, Gilbert, AZ 85297');
  assert.equal(radarDirectionsUrl('Safeway #343'), null);
  assert.equal(radarDirectionsUrl('Safeway — Gilbert, AZ'), null);
  assert.equal(radarDirectionsUrl('Safeway — District 12, AZ'), null);
});
