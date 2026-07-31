import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';

import {
  buildPensacolaShopifyStoreLocationSignals,
  isUsefulPensacolaShopifyFormat,
  parsePensacolaShopifyCollectionLinks,
  parsePensacolaShopifyProductPage,
  parsePensacolaShopifyVariantPickup,
  pensacolaVariantPickupUrl,
  PENSACOLA_SHOPIFY_SOURCE,
  PENSACOLA_SHOPIFY_STORES,
} from '../src/collectors/florida-pensacola-surfaces.mjs';
import { isFloridaRetailerInventory } from '../src/florida-retailer-policy.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { buildCurrentInventoryAlertsFromDrops, buildDrops } from '../src/export-site-contract.mjs';

const productUrl = 'https://www.pensacolaliquors.com/products/buffalo-trace-bourbon-750ml';
const variantId = '42469227430083';
const productHtml = ({ availability = 'InStock', offerVariantId = variantId, productId = '7603067060419' } = {}) => `
  <script type="application/ld+json">${JSON.stringify({
    '@context': 'http://schema.org/',
    '@type': 'Product',
    name: 'Buffalo Trace Bourbon - 750ML',
    offers: {
      '@type': 'Offer',
      availability: `http://schema.org/${availability}`,
      price: '29.99',
      priceCurrency: 'USD',
      url: `${productUrl}?variant=${offerVariantId}`,
    },
  })}</script>
  <input type="hidden" name="product-id" value="${productId}" />
`;

const pickupHtml = ({ name = 'Cost Plus Liquors Pace Blvd', address = '1800 North Pace Boulevard<br>Pensacola FL 32505<br>United States', available = true } = {}) => `
  <ul class="pickup-availability-list">
    <li class="pickup-availability-list__item grid gap-2">
      <h4>${name}</h4>
      <p>${available ? 'Pickup available, usually ready in 2 hours' : 'Pickup unavailable'}</p>
      <address class="pickup-availability-address"><p>${address}</p></address>
    </li>
  </ul>
`;

test('Pensacola Shopify registry binds exactly two reviewed first-party pickup stores', () => {
  assert.equal(PENSACOLA_SHOPIFY_SOURCE.hostname, 'www.pensacolaliquors.com');
  assert.equal(PENSACOLA_SHOPIFY_STORES.size, 2);
  assert.deepEqual([...PENSACOLA_SHOPIFY_STORES.values()].map((store) => store.address), [
    '1800 North Pace Boulevard, Pensacola, FL 32505',
    '1420 W 9 Mile Rd, Pensacola, FL 32534',
  ]);
});

test('Pensacola collection parser accepts only same-origin product links and deduplicates handles', () => {
  const html = `
    <a href="/collections/bourbon/products/buffalo-trace-bourbon-750ml">Buffalo Trace</a>
    <a href="https://www.pensacolaliquors.com/products/buffalo-trace-bourbon-750ml?variant=1">duplicate</a>
    <a href="https://evil.example/products/forged-bourbon">forged</a>
    <a href="/collections/bourbon?page=2">not a product</a>
  `;
  assert.deepEqual(parsePensacolaShopifyCollectionLinks(html), [productUrl]);
});

test('Pensacola product parser requires product-specific in-stock identity', () => {
  const parsed = parsePensacolaShopifyProductPage(productHtml(), productUrl);
  assert.deepEqual(parsed, {
    rawName: 'Buffalo Trace Bourbon - 750ML',
    productId: '7603067060419',
    variantId,
    price: 29.99,
  });
  assert.equal(parsePensacolaShopifyProductPage(productHtml({ availability: 'OutOfStock' }), productUrl), null);
  assert.equal(parsePensacolaShopifyProductPage(productHtml({ offerVariantId: '' }), productUrl), null);
  assert.equal(parsePensacolaShopifyProductPage(productHtml({ productId: '' }), productUrl), null);
  assert.equal(parsePensacolaShopifyProductPage(productHtml(), 'https://evil.example/products/buffalo-trace-bourbon-750ml'), null);
});

test('Pensacola pickup parser requires the exact variant response, pickup status, store name, and address', () => {
  const pickupUrl = pensacolaVariantPickupUrl(variantId);
  assert.deepEqual(parsePensacolaShopifyVariantPickup(pickupHtml(), pickupUrl, variantId), [
    PENSACOLA_SHOPIFY_STORES.get('pensacola-liquors:pace-blvd'),
  ]);
  assert.deepEqual(parsePensacolaShopifyVariantPickup(pickupHtml(), pickupUrl, '99999999999999'), []);
  assert.deepEqual(parsePensacolaShopifyVariantPickup(pickupHtml(), 'https://evil.example/variants/42469227430083/?section_id=pickup-availability', variantId), []);
  assert.deepEqual(parsePensacolaShopifyVariantPickup(pickupHtml({ address: '999 Forged Rd, Pensacola FL 32505' }), pickupUrl, variantId), []);
  assert.deepEqual(parsePensacolaShopifyVariantPickup(pickupHtml({ available: false }), pickupUrl, variantId), []);
});

test('Pensacola configured store rows are searchable directory evidence and never inventory', () => {
  const rows = buildPensacolaShopifyStoreLocationSignals('2026-07-31T00:00:00.000Z');
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.eventType === 'retailer_store_location'));
  assert.ok(rows.every((row) => /pickup inventory/i.test(row.sourceLabel)));
  assert.ok(rows.every((row) => row.raw.configuredStoreIdentity === true));
  assert.ok(rows.every((row) => row.canAlertAsInventory === false && row.canAlertAsWatch === false));
});

test('Pensacola inventory rejects minis and multipack spelling variants', () => {
  assert.equal(isUsefulPensacolaShopifyFormat('Buffalo Trace Bourbon 750ml'), true);
  for (const name of [
    'Buffalo Trace Bourbon 375ml',
    'Buffalo Trace Bourbon 1.7 oz',
    'Buffalo Trace Bourbon 3pk 750ml',
    'Buffalo Trace Bourbon 3-pk 750ml',
    'Buffalo Trace Bourbon 3 pack 750ml',
    'Buffalo Trace Bourbon 3-pack 750ml',
    'Buffalo Trace Bourbon multipack 750ml',
    'Buffalo Trace Bourbon multi-pack 750ml',
    'Buffalo Trace Bourbon pack of 3 750ml',
    'Buffalo Trace Bourbon 6x750ml',
    'Buffalo Trace Bourbon case of 6 bottles',
    'Buffalo Trace Bourbon 12 bottle case',
    'Buffalo Trace Bourbon case pack',
    'Buffalo Trace Bourbon gift set 750ml',
    'Buffalo Trace Bourbon bundle 750ml',
    'Buffalo Trace Bourbon sampler 750ml',
    'Buffalo Trace Bourbon variety pack 750ml',
    'Buffalo Trace Bourbon set of 2 750ml',
  ]) assert.equal(isUsefulPensacolaShopifyFormat(name), false, name);
});

test('central Florida policy revalidates Pensacola host, merchant, store, address, and product identity', () => {
  const store = PENSACOLA_SHOPIFY_STORES.get('pensacola-liquors:pace-blvd');
  const valid = {
    state: 'FL',
    sourceLabel: PENSACOLA_SHOPIFY_SOURCE.sourceLabel,
    sourceUrl: productUrl,
    sourceChain: PENSACOLA_SHOPIFY_SOURCE.id,
    merchantId: store.id,
    productId: '7603067060419',
    variantId: '42469227430083',
    sourceProductBinding: pensacolaVariantPickupUrl(variantId),
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    storeId: store.id,
    storeName: store.name,
    storeAddress: store.address,
    city: store.city,
    stateCode: 'FL',
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    premisesVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    quantity: 0,
    quantityIsExact: false,
    raw: {
      chain: PENSACOLA_SHOPIFY_SOURCE.id,
      merchantId: store.id,
      productId: '7603067060419',
      variantId,
      pickupVerified: true,
      variantPickupVerified: true,
      variantPickupUrl: pensacolaVariantPickupUrl(variantId),
    },
  };
  assert.equal(isFloridaRetailerInventory(valid), true);
  assert.equal(confidenceForSignal(valid).canAlertAsInventory, true);
  for (const mutation of [
    { sourceUrl: PENSACOLA_SHOPIFY_SOURCE.collectionUrl },
    { sourceUrl: 'https://evil.example/products/buffalo-trace-bourbon-750ml' },
    { merchantId: 'pensacola-liquors:forged' },
    { storeId: 'pensacola-liquors:forged' },
    { storeAddress: '999 Forged Rd, Pensacola, FL 32505' },
    { productId: '' },
    { variantId: '' },
    { quantity: 1 },
    { quantityIsExact: true },
    { sourceProductBinding: 'https://evil.example/variants/42469227430083/?section_id=pickup-availability' },
    { pickupOfferVerified: false },
    { premisesVerified: false },
    { raw: { ...valid.raw, productId: 'forged' } },
  ]) {
    const forged = { ...valid, ...mutation };
    assert.equal(isFloridaRetailerInventory(forged), false, JSON.stringify(mutation));
    assert.equal(confidenceForSignal(forged).canAlertAsInventory, false, JSON.stringify(mutation));
  }
  assert.equal(isFloridaRetailerInventory({ ...valid, raw: undefined }), true, 'normalized operational signals preserve top-level pickup proof');
});

test('fresh reviewed Pensacola pickup evidence reaches the customer feed while forged evidence does not', () => {
  const store = PENSACOLA_SHOPIFY_STORES.get('pensacola-liquors:pace-blvd');
  const signal = {
    id: 'pensacola-customer-card-fixture',
    state: 'FL',
    sourceLabel: PENSACOLA_SHOPIFY_SOURCE.sourceLabel,
    sourceUrl: productUrl,
    sourceChain: PENSACOLA_SHOPIFY_SOURCE.id,
    merchantId: store.id,
    productId: '7603067060419',
    variantId: '42469227430083',
    sourceProductBinding: pensacolaVariantPickupUrl(variantId),
    rawName: 'Buffalo Trace Bourbon - 750ML',
    canonicalBottleId: 'buffalo-trace-bourbon',
    canonicalName: 'Buffalo Trace Bourbon',
    tier: 'allocated',
    eventType: 'retailer_store_inventory_result',
    locationPrecision: 'store_level',
    locationName: store.name,
    storeName: store.name,
    storeId: store.id,
    storeAddress: store.address,
    city: store.city,
    stateCode: 'FL',
    postalCode: store.zip,
    quantity: 0,
    quantityIsExact: false,
    availabilityStatus: 'in_stock',
    sourceAvailabilityVerified: true,
    pickupOfferVerified: true,
    premisesVerified: true,
    canAlertAsInventory: true,
    canAlertAsWatch: true,
    observedAt: new Date().toISOString(),
    raw: {
      chain: PENSACOLA_SHOPIFY_SOURCE.id,
      merchantId: store.id,
      productId: '7603067060419',
      variantId: '42469227430083',
      pickupVerified: true,
      variantPickupVerified: true,
      variantPickupUrl: pensacolaVariantPickupUrl(variantId),
    },
  };
  const record = { id: signal.canonicalBottleId, canonical: signal.canonicalName, aliases: [], tier: signal.tier };
  const bible = { byId: new Map([[record.id, record]]), byName: new Map() };
  const cards = buildDrops([signal], bible, [signal]);
  assert.equal(cards.length, 1);
  assert.equal(cards[0].storeId, store.id);
  assert.equal(cards[0].sourceProductBinding, signal.sourceProductBinding);
  assert.equal(cards[0].quantityIsExact, false);
  assert.equal(isFloridaRetailerInventory(cards[0]), true, 'customer cards preserve enough proof for central policy replay');
  assert.match(cards[0].inventoryCaveat, /verify directly with the store before driving/i);
  const baselineAlerts = buildCurrentInventoryAlertsFromDrops(cards);
  assert.equal(baselineAlerts.length, 1);
  assert.equal(baselineAlerts[0].eligibleForOnSite, true);
  assert.equal(baselineAlerts[0].eligibleForEmail, false);
  assert.equal(baselineAlerts[0].eligibleForSms, false);
  assert.equal(baselineAlerts[0].sendRecommendation, 'display_on_site_until_change_detected');
  const legacyAmbiguousQuantityCard = { ...cards[0] };
  delete legacyAmbiguousQuantityCard.quantityIsExact;
  assert.deepEqual(buildCurrentInventoryAlertsFromDrops([legacyAmbiguousQuantityCard]), []);
  assert.deepEqual(buildCurrentInventoryAlertsFromDrops([{ ...cards[0], quantity: 2 }]), []);
  for (const exactness of [true, undefined]) {
    const positiveFloridaCard = {
      ...cards[0],
      source: "Gaspar's Liquor Shoppe Lightspeed store inventory",
      sourceLabel: "Gaspar's Liquor Shoppe Lightspeed store inventory",
      sourceUrl: 'https://gasparsliquorshoppe.com/',
      sourceChain: 'gaspars-liquor-shoppe',
      merchantId: 'lightspeed:640576',
      storeId: 'gaspars-liquor-shoppe:tampa-56th',
      storeName: "Gaspar's Liquor Shoppe",
      locationName: "Gaspar's Liquor Shoppe",
      storeAddress: '8448 N 56th St, Temple Terrace, FL 33617',
      quantity: 2,
      quantityIsExact: exactness,
    };
    if (exactness === undefined) delete positiveFloridaCard.quantityIsExact;
    const positiveAlerts = buildCurrentInventoryAlertsFromDrops([positiveFloridaCard]);
    assert.equal(positiveAlerts.length, 1);
    assert.equal(positiveAlerts[0].eligibleForEmail, true);
  }

  const forged = { ...signal, pickupOfferVerified: false };
  assert.deepEqual(buildDrops([forged], bible, [forged]), []);
});

test('Florida runtime and verifier wire the Pensacola lane before publication', () => {
  const collector = readFileSync(new URL('../src/collectors/precision-probes.mjs', import.meta.url), 'utf8');
  const verifier = readFileSync(new URL('../src/verify-fl.mjs', import.meta.url), 'utf8');
  assert.match(collector, /name:\s*'pensacola-shopify'[\s\S]*collectFloridaPensacolaShopify/);
  assert.match(collector, /buildPensacolaShopifyStoreLocationSignals/);
  assert.match(collector, /curlTextFetch\(url\.href[\s\S]*followRedirects: false/);
  assert.match(collector, /curlTextFetch\(productUrl[\s\S]*followRedirects: false/);
  assert.match(collector, /pensacolaVariantPickupUrl[\s\S]*parsePensacolaShopifyVariantPickup/);
  assert.match(verifier, /PENSACOLA_SHOPIFY_STORES/);
  assert.match(verifier, /Expected fresh exact-store Pensacola Shopify inventory/);
});

test('live probe derives coverage metrics from the generated customer contract', () => {
  const liveProbe = readFileSync(new URL('../../scripts/run-state-expansion-live-probe.mjs', import.meta.url), 'utf8');
  assert.match(liveProbe, /print-generated-coverage-state\.mts/);
  assert.match(liveProbe, /coverageGeneratedAtMs < startedAtMs/);
  assert.match(liveProbe, /hydrate-state-reports\.mjs/);
  assert.doesNotMatch(liveProbe, /baseline-artifact/);
  assert.match(liveProbe, /Forced live probe produced no fresh Pensacola customer card/);
  assert.match(liveProbe, /requires clean engine\/out\/site artifacts/);
  assert.match(liveProbe, /git[\s\S]*restore[\s\S]*engine\/out\/site/);
  assert.doesNotMatch(liveProbe, /representedAreaCount:\s*packet\.acceptance/);
  assert.doesNotMatch(liveProbe, /layers:\s*\{\s*known:\s*packet\.baseline/);
});
