import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MA_JULIOS_SOURCE as source, parseMassachusettsJulios } from '../src/collectors/massachusetts-retailer-surfaces.mjs';

function fixture(change = () => {}) {
  const merchant = { id: source.merchantId, full_address: source.address };
  const option = { product_id: 'p1', option_id: 'v1', merchant_id: source.merchantId,
    full_address: source.address, price: 54.99, quantity: 2, preorder_details: null,
    allowed_offer_types: null, product_url: `${source.baseUrl}/shop/product/rare-breed/p1?option-id=v1`,
    option_display_data: { name: 'WILD TURKEY RARE BREED' } };
  const productMerchant = { merchant_id: source.merchantId, full_address: source.address,
    offer_types: ['pick_up', 'shipping'], product_options: [option] };
  const payload = { merchant_configs: [{ merchant }], products: [{ id: 'p1', name: 'WILD TURKEY RARE BREED', merchants: [productMerchant] }] };
  change({ merchant, option, productMerchant, payload });
  return `<script>window.products=JSON.parse(decodeURIComponent("${encodeURIComponent(JSON.stringify(payload))}"))</script>`;
}

test('exact merchant premises and current pickup offer remain binary, never an exact bottle count', () => {
  const rows = parseMassachusettsJulios(fixture());
  assert.equal(rows.length, 1);
  assert.equal(rows[0].pickupOfferVerified, true);
  assert.equal(rows[0].quantityIsExact, false);
  assert.equal(rows[0].quantity, 0);
});

test('preorders, unknown option policy and shipping-only options fail closed', () => {
  for (const change of [
    ({ option }) => { option.preorder_details = { release_date: '2099-01-01' }; },
    ({ option }) => { delete option.preorder_details; },
    ({ option }) => { delete option.allowed_offer_types; },
    ({ option }) => { option.allowed_offer_types = ['shipping']; },
    ({ option }) => { option.description = 'Pre-order, ships next month'; },
    ({ productMerchant }) => { productMerchant.offer_types = ['shipping']; },
  ]) assert.equal(parseMassachusettsJulios(fixture(change)).length, 0);
});

test('wrong merchant, wrong premises and variant URL substitution cannot enter MA research', () => {
  for (const change of [
    ({ merchant }) => { merchant.id = 'another-merchant'; },
    ({ merchant }) => { merchant.full_address = '140 Turnpike Road, another city'; },
    ({ option }) => { option.full_address = 'another store'; },
    ({ option }) => { option.merchant_id = 'another-merchant'; },
    ({ option }) => { option.product_url = option.product_url.replace('option-id=v1', 'option-id=other'); },
    ({ option }) => { option.product_url = option.product_url.replace(source.hostname, 'example.com'); },
  ]) assert.equal(parseMassachusettsJulios(fixture(change)).length, 0);
});

test('nonpositive stock/price and bundles, creams, flavored whiskey or miniatures are excluded', () => {
  for (const change of [
    ({ option }) => { option.quantity = 0; },
    ({ option }) => { option.quantity = -1; },
    ({ option }) => { option.price = 0; },
    ...['Buffalo Trace Pack', 'Buffalo Trace Bourbon Cream 50ML NIP', 'Jim Beam Apple 750ML']
      .map(name => ({ option }) => { option.option_display_data.name = name; }),
  ]) assert.equal(parseMassachusettsJulios(fixture(change)).length, 0);
  assert.deepEqual(parseMassachusettsJulios('x'.repeat(2_000_001)), []);
});
