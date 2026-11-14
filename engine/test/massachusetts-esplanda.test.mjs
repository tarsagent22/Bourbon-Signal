import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { MA_ESPLANDA_PRODUCTS, parseMassachusettsEsplandaProduct } from '../src/collectors/massachusetts-esplanda.mjs';
import { isMassachusettsResearchInventory } from '../src/massachusetts-research-policy.mjs';
import { isActiveCustomerStateRow } from '../src/export-site-contract.mjs';
import { collectResearchStateReport, researchSourceForState } from '../src/research-state-registry.mjs';

const bible = { match(name) {
  if (name === 'Larceny Barrel Proof') return { confidence: 1, record: { id: 'bb_dec2c347ba378237', canonical: 'Larceny Barrel Proof' } };
  if (name === 'Eagle Rare 10 Year Bourbon') return { confidence: 1, record: { id: 'bb_d0fe561ac45db2d5', canonical: 'Eagle Rare 10' } };
  return null;
} };
const stores = new Map();

function fixture(source, change = () => {}) {
  const isEagle = source.id.endsWith('eagle-rare-10');
  const product = { '@type': 'Product', name: isEagle ? 'Eagle Rare 10 Year Bourbon' : 'Larceny Batch A125 Barrel Proof',
    productID: isEagle ? 'e04c2a2e-61b4-46e6-b413-6a672a0a674c' : '6e487b00-125d-11ec-a49f-afb034be823e',
    sku: source.id === 'wildduck-boston-larceny-a125' ? '09674900265' : '096749002658',
    offers: { url: source.requestUrl, availability: 'https://schema.org/InStock', priceCurrency: 'USD',
      price: '49.99', availableAtOrFrom: { '@id': source.storeRef }, sku: source.id === 'wildduck-boston-larceny-a125' ? '09674900265' : '096749002658' } };
  const store = { '@type': 'LiquorStore', '@id': source.storeRef, name: source.storeName,
    address: { streetAddress: source.address.split(',')[0], addressLocality: source.city, addressRegion: 'MA', postalCode: source.zip, addressCountry: 'US' },
    geo: { latitude: source.lat, longitude: source.lng } };
  const service = { '@type': 'Service', name: 'Store pickup', serviceType: 'Store pickup', provider: { '@id': source.storeRef } };
  change({ product, store, service });
  const title = isEagle ? 'Eagle Rare 10 Year Bourbon 750 ML' : 'Larceny Batch A125 Barrel Proof Bourbon 750 ML';
  const price = '49.99';
  const canonical = `<link rel="canonical" href="${source.productUrl}">`;
  const meta = (key, value) => `<meta property="${key}" content="${value}">`;
  return `${canonical}${meta('og:title', title)}${meta('og:site_name', source.storeName)}${meta('og:url', source.productUrl)}${meta('product:availability', 'in stock')}${meta('product:price:amount', price)}${meta('product:price:currency', 'USD')}${meta('product:retailer_item_id', product.productID)}<script type="application/ld+json">${JSON.stringify([product, store, service])}</script>`;
}

test('minimized captures from retained first-party pages bind three in-stock offers to two exact premises', async () => {
  const observedAt = {
    'cbc-westford-larceny-a125': '2026-11-14T16:48:04.000Z',
    'wildduck-boston-larceny-a125': '2026-11-14T17:03:24.000Z',
    'wildduck-boston-eagle-rare-10': '2026-11-14T17:04:06.000Z',
  };
  for (const source of MA_ESPLANDA_PRODUCTS) {
    const html = await readFile(new URL(`./fixtures/massachusetts-esplanda/${source.id}.html`, import.meta.url), 'utf8');
    const row = parseMassachusettsEsplandaProduct(html, source, bible, { observedAt: observedAt[source.id] });
    assert.ok(row, source.id);
    assert.equal(row.storeAddress, source.address);
    assert.equal(row.locationPrecision, 'store_level');
    assert.equal(row.quantity, 0);
    assert.equal(row.quantityIsExact, false);
    assert.equal(row.canAlertAsInventory, true);
    assert.equal(row.canAlertAsWatch, false);
    assert.equal(row.alertable, false);
    assert.equal(row.eligibleForOnSite, false);
    assert.equal(isActiveCustomerStateRow(row), false);
    assert.equal(isMassachusettsResearchInventory(row, { nowMs: Date.parse('2026-11-14T17:05:00Z') }), true);
  }
});

test('the reviewed source policy rejects changed identity, premises, pickup, and stale rows', () => {
  const source = MA_ESPLANDA_PRODUCTS[0];
  const row = parseMassachusettsEsplandaProduct(fixture(source), source, bible, { observedAt: '2026-11-14T17:04:06.000Z' });
  for (const change of [
    { canonicalBottleId: 'wrong-id' }, { storeAddress: 'another address' }, { sourceUrl: source.productUrl },
    { canAlertAsWatch: true }, { quantity: 1 }, { eligibleForDelivery: true },
    { observedAt: '2026-11-14T14:00:00.000Z' },
  ]) assert.equal(isMassachusettsResearchInventory({ ...row, ...change }, { nowMs: Date.parse('2026-11-14T17:05:00Z') }), false, JSON.stringify(change));
  assert.equal(parseMassachusettsEsplandaProduct(fixture(source, ({ service }) => { service.name = 'Shipping'; }), source, bible,
    { observedAt: '2026-11-14T17:04:06.000Z' }), null);
  assert.equal(parseMassachusettsEsplandaProduct(fixture(source, ({ product }) => { product.productID = 'wrong'; }), source, bible,
    { observedAt: '2026-11-14T17:04:06.000Z' }), null);
});

test('explicit isolated MA source mode collects Esplanda only and retains raw evidence under the shadow run', async () => {
  const previousShadow = process.env.BOURBON_SIGNAL_SHADOW_MODE;
  const previousEsplanda = process.env.BOURBON_SIGNAL_MA_ESPLANDA_ONLY;
  const directory = await mkdtemp(path.join(os.tmpdir(), 'ma-esplanda-'));
  const requested = [];
  const htmlById = new Map();
  for (const source of MA_ESPLANDA_PRODUCTS) {
    htmlById.set(source.requestUrl, await readFile(new URL(`./fixtures/massachusetts-esplanda/${source.id}.html`, import.meta.url), 'utf8'));
  }
  try {
    process.env.BOURBON_SIGNAL_SHADOW_MODE = '1';
    process.env.BOURBON_SIGNAL_MA_ESPLANDA_ONLY = '1';
    const report = await collectResearchStateReport(researchSourceForState('MA'), bible, {
      reportDirectory: directory,
      includeCityHiveResearch: true,
      fetchImpl: async url => {
        requested.push(String(url));
        return new Response(htmlById.get(String(url)), { headers: {
          'content-type': 'text/html; charset=utf-8', date: 'Sat, 14 Nov 2026 17:04:06 GMT',
        } });
      },
    });
    assert.equal(report.metadata.sourceSet, 'massachusetts-esplanda-only');
    assert.equal(report.metadata.complete, true);
    assert.equal(report.signals.length, 3);
    assert.equal(report.sources.length, 3);
    assert.deepEqual(requested.sort(), MA_ESPLANDA_PRODUCTS.map(source => source.requestUrl).sort());
    assert.ok(report.sources.every(source => source.receipt?.artifactPath && source.receipt.sha256));
    assert.ok(report.signals.every(row => !isActiveCustomerStateRow(row)));
  } finally {
    if (previousShadow === undefined) delete process.env.BOURBON_SIGNAL_SHADOW_MODE;
    else process.env.BOURBON_SIGNAL_SHADOW_MODE = previousShadow;
    if (previousEsplanda === undefined) delete process.env.BOURBON_SIGNAL_MA_ESPLANDA_ONLY;
    else process.env.BOURBON_SIGNAL_MA_ESPLANDA_ONLY = previousEsplanda;
    await rm(directory, { recursive: true, force: true });
  }
});
