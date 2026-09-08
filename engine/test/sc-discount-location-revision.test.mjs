import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { parseDiscountLiquorLocation } from '../src/collectors/south-carolina-discount-square.mjs';
const captured = JSON.parse(readFileSync(new URL('./fixtures/sc/discount-location-live.json', import.meta.url), 'utf8'));
test('Discount Liquor exact reviewed ZIP+4/geocode revision retains the same licensed premise', () => {
  assert.equal(parseDiscountLiquorLocation(captured)?.id, 'LEG9F5YDP0ZS2');
});
test('Discount Liquor location revision does not permit different premises or mixed postal/geocode identities', () => {
  for (const mutate of [
    d => { d.data[0].address.data.street = '401 N Dobys Bridge Rd'; },
    d => { d.data[0].address.data.postal_code = '29715-0000'; },
    d => { d.data[0].address.data.latitude = 35.5; },
    d => { d.data[0].id = 'OTHER'; },
    d => { d.data[0].pickup_enabled = false; },
  ]) {
    const bad = structuredClone(captured); mutate(bad);
    assert.equal(parseDiscountLiquorLocation(bad), null);
  }
});
