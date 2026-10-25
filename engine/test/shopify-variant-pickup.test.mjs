import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BourbonBible } from '../src/core/bible.mjs';
import { fingerprintName } from '../src/core/text.mjs';
import { collectShopifyVariantPickup, validateShopifyVariantSource, describeShopifyVariantSource } from '../src/collectors/shopify-variant-pickup.mjs';

// Saved public captures are offline evidence, never production coverage rows.
const fixtureDir = new URL('./fixtures/shopify-variant-pickup/', import.meta.url);
const candidates = JSON.parse(await readFile(new URL('../data/shopify-pickup-onboarding-candidates.json', import.meta.url), 'utf8'));
const manifest = JSON.parse(await readFile(new URL('manifest.json', fixtureDir), 'utf8'));
const captures = new Map();
for (const entry of manifest.captures) captures.set(entry.requestedUrl, { entry, text: await readFile(new URL(entry.file, fixtureDir), 'utf8') });
const catalogText = await readFile(new URL('current-bourbon-bible.json', fixtureDir), 'utf8');
const catalogProvenance = JSON.parse(await readFile(new URL('current-bourbon-bible-provenance.json', fixtureDir), 'utf8'));
const bible = new BourbonBible(JSON.parse(catalogText).records);
const observedAt = '2026-10-23T03:00:00.000Z';
const clone = value => structuredClone(value);
const defaultSource = () => clone(candidates.sources[0]);

function transport(source, { productEdit, pickupEdit, override } = {}) {
  const calls = [];
  return { calls, fetchText: async (url, options) => {
    calls.push({ url, options });
    if (override) { const result = await override(url, options, calls.length); if (result) return result; }
    const capture = captures.get(url);
    assert.ok(capture, `Unreviewed request: ${url}`);
    let text = capture.text;
    if (url.endsWith('.json') && productEdit) { const payload = JSON.parse(text); productEdit(payload); text = JSON.stringify(payload); }
    if (!url.endsWith('.json') && pickupEdit) text = pickupEdit(text);
    return { ok: true, status: 200, url, text };
  } };
}
async function collect(source = defaultSource(), options = {}) {
  const injected = transport(source, options);
  return { ...(await collectShopifyVariantPickup(bible, source, { observedAt, fetchText: injected.fetchText })), calls: injected.calls };
}

test('fixture provenance hashes and exact request URLs match original public captures', () => {
  assert.equal(createHash('sha256').update(catalogText).digest('hex'), catalogProvenance.catalogSha256);
  assert.equal(bible.records.length, catalogProvenance.count);
  for (const { entry, text } of captures.values()) {
    assert.equal(createHash('sha256').update(text).digest('hex'), entry.sha256, entry.file);
    assert.equal(Buffer.byteLength(text), entry.bytes);
    assert.equal(entry.requestedUrl, entry.finalUrl);
  }
});

test('old readiness and matcher-generation pins are stale; reviewed runtime hashes require fresh readiness', async () => {
  for (const input of catalogProvenance.inputs) {
    if (input.missing) continue;
    const bytes = await readFile(new URL(`../../${input.file}`, import.meta.url));
    const actual = createHash('sha256').update(bytes).digest('hex');
    if (['engine/src/collectors/safe-bottle-match.mjs', 'engine/src/build-bible.mjs', 'engine/src/core/bible.mjs'].includes(input.file)) assert.notEqual(actual, input.sha256, 'Frozen matcher-generation evidence is stale, not current readiness');
    else assert.equal(actual, input.sha256, input.file);
  }
  const readiness = JSON.parse(await readFile(new URL('readiness.json', fixtureDir), 'utf8'));
  const code = await readFile(new URL('../src/collectors/shopify-variant-pickup.mjs', import.meta.url));
  assert.equal(readiness.collectorSha256, '82ec1ede939d793f40d7a945430f49c0867fdfadf18d4004c5775c8878e39206');
  assert.notEqual(readiness.collectorSha256, createHash('sha256').update(code).digest('hex'), 'Historical readiness cannot authorize the new runtime');
  assert.equal(createHash('sha256').update(code).digest('hex'), 'ec8c71f52bf700d20ed98ff304c62057a990473f952fc428ad4df13abd439983');
  const identity = await readFile(new URL('../src/collectors/shopify-premises-identity.mjs', import.meta.url));
  assert.equal(createHash('sha256').update(identity).digest('hex'), '95620888325f9ad59a60b304f56df3bac1527b923a845da23a38995976a08ed3');
  assert.equal(readiness.catalogSha256, catalogProvenance.catalogSha256);
  const expected = { 'Buffalo Trace Bourbon': ['bb_317836b9e64a7620', 'allocated'], 'Weller Single Barrel': ['bb_1fd1f694742e0a1e', 'unicorn'], "Booker's Bourbon": ['bb_8b9546b93a7fbe72', 'limited'] };
  for (const result of readiness.results) {
    assert.deepEqual([result.canonical.id, result.canonical.tier], expected[result.canonical.name]);
    assert.equal(result.canonical.confidence, 1);
    assert.equal(result.readiness, 'offline_fixture_validated_live_and_scheduler_pending');
  }
});

for (const source of candidates.sources) test(`unchanged collector proves exact variant pickup: ${source.id} (${source.state})`, async () => {
  const result = await collect(source);
  assert.equal(result.signals.length, 1);
  const row = result.signals[0], seed = source.products[0], store = source.stores[0];
  assert.equal(row.state, source.state); assert.equal(row.storeAddress, store.address); assert.equal(row.storeId, store.id);
  assert.equal(row.canonicalName, seed.canonicalName); assert.equal(row.rawName, seed.title);
  assert.equal(row.productId, seed.productId); assert.equal(row.variantId, seed.variantId);
  assert.equal(row.sourceProductBinding, seed.evidence.pickup.url);
  assert.equal(row.quantity, 0); assert.equal(row.quantityIsExact, false); assert.equal(row.raw.sizeMl, 750);
  assert.equal(row.availabilityStatus, 'in_stock'); assert.equal(row.pickupOfferVerified, true);
  assert.equal(row.observedAt, observedAt); assert.equal(result.accounting.requestCount, 2);
  assert.equal(result.accounting.completeSnapshot, true); assert.equal(result.accounting.premisesChecked, 1);
  assert.equal(result.metadata.receipts.length, 2);
  assert.equal(result.accounting.bytes, result.metadata.receipts.reduce((sum, receipt) => sum + receipt.bytes, 0));
  assert.ok(result.accounting.elapsedMs >= 0); assert.deepEqual(result.observations.map(row => row.availabilityStatus), ['in_stock']);
  assert.deepEqual(result.calls.map(call => call.url), [seed.evidence.product.url, seed.evidence.pickup.url]);
  for (const { options } of result.calls) { assert.equal(options.maxRedirects, 0); assert.ok(options.signal instanceof AbortSignal); assert.ok(options.timeoutMs <= 12_000); }
});

test('five research premises span three states; no runtime source activation or fabricated source rows', () => {
  assert.equal(candidates.scope, 'preparation_only_no_activation');
  assert.equal(candidates.sources.length, 5);
  assert.deepEqual([...new Set(candidates.sources.map(source => source.state))].sort(), ['CA', 'NY', 'TX']);
  assert.equal(new Set(candidates.sources.map(source => source.baseUrl)).size, 5);
});

test('dry-run plan binds config, code hash, exact URLs, cost and explicit theme exception', () => {
  for (const source of candidates.sources) {
    const plan = describeShopifyVariantSource(source, { collectorSha256: 'a'.repeat(64) });
    assert.equal(plan.scope, 'preparation_only_no_activation'); assert.equal(plan.requestCount, 2);
    assert.match(plan.configSha256, /^[a-f0-9]{64}$/u); assert.equal(plan.collectorSha256, 'a'.repeat(64));
    assert.equal(plan.exceptions.length, (source.headingIdentity === 'variant_title' ? 1 : 0) + (source.products[0].titleMapping ? 1 : 0));
    assert.ok(Object.isFrozen(plan.source));
  }
  assert.throws(() => describeShopifyVariantSource(defaultSource()), /code SHA/iu);
});

for (const [name, edit] of [
  ['HTTP origin', source => { source.baseUrl = source.baseUrl.replace('https:', 'http:'); }],
  ['credentials', source => { source.baseUrl = 'https://secret@www.remedyliquor.com'; }],
  ['private IP', source => { source.baseUrl = 'https://127.0.0.1'; }],
  ['path', source => { source.baseUrl += '/products'; }],
  ['unpublished section', source => { source.sectionId = '../../admin'; }],
  ['unsafe handle', source => { source.products[0].handle = '../all'; }],
  ['numeric variant binding', source => { source.products[0].variantId = '1?foo'; }],
  ['evidence host mismatch', source => { source.products[0].evidence.pickup.url = 'https://evil.example/variants/43038323638500/?section_id=pickup-availability'; }],
  ['missing evidence hash', source => { source.products[0].evidence.product.sha256 = ''; }],
  ['duplicate premises', source => { source.stores.push(clone(source.stores[0])); }],
  ['over budget', source => { source.budgets = { maxRequests: 100 }; }],
  ['unsupported endpoint-only identity', source => { source.headingIdentity = 'endpoint_only'; }],
]) test(`configuration rejects ${name} before transport`, async () => {
  const source = defaultSource(); edit(source); let calls = 0;
  await assert.rejects(() => collectShopifyVariantPickup(bible, source, { fetchText: async () => { calls++; } }));
  assert.equal(calls, 0);
});

for (const [name, edit] of [
  ['wrong product', payload => { payload.product.id++; }],
  ['wrong variant', payload => { payload.product.variants[0].id++; }],
  ['wrong product binding', payload => { payload.product.variants[0].product_id++; }],
  ['duplicate variant', payload => { payload.product.variants.push(clone(payload.product.variants[0])); }],
  ['changed title', payload => { payload.product.title += ' Rye'; }],
  ['375ML in body despite safe title', payload => { payload.product.body_html += '<p>375 ML</p>'; }],
  ['ambiguous volume', payload => { payload.product.body_html += '<p>1 liter</p>'; }],
  ['invalid price', payload => { payload.product.variants[0].price = 'unknown'; }],
  ['unsafe bundle format', payload => { payload.product.tags += ', 2 pack'; }],
]) test(`product metadata rejects ${name} before pickup request`, async () => {
  const source = defaultSource(), injected = transport(source, { productEdit: edit });
  await assert.rejects(() => collectShopifyVariantPickup(bible, source, { fetchText: injected.fetchText }));
  assert.equal(injected.calls.length, 1);
});

test('missing explicit size fails even with numeric binding and available flag', async () => {
  const source = defaultSource(); source.products[0].title = 'Buffalo Trace Bourbon';
  await assert.rejects(() => collect(source, { productEdit: payload => { payload.product.title = source.products[0].title; payload.product.body_html = ''; payload.product.variants[0].available = true; } }), /volume/iu);
});

test('reviewed canonical mapping cannot accept a different record returned by matcher', async () => {
  const source = defaultSource(), injected = transport(source);
  await assert.rejects(() => collectShopifyVariantPickup({ match: () => ({ record: { id: 'wrong', canonical: 'Other Bourbon' }, confidence: 1 }) }, source, { fetchText: injected.fetchText }), /canonical/iu);
  assert.equal(injected.calls.length, 1);
});

test('changing a genuine Buffalo Trace seed canonical to Weller cannot emit Weller inventory', async () => {
  const source = defaultSource(); source.products[0].canonicalName = 'Weller Single Barrel';
  await assert.rejects(() => collect(source), /different canonical|compatibility/iu);
  source.products[0].titleMapping = { rawTitle: source.products[0].title, canonicalName: 'Weller Single Barrel', reason: 'Invalid cross-bottle mutation test', allowedUnsafeReasons: [] };
  await assert.rejects(() => collect(source), /different canonical|compatibility/iu);
});

test('raw-match exceptions are exact title/canonical bound and cannot override unsafe flavors or missing modifiers', async () => {
  const source = clone(candidates.sources[1]); source.products[0].canonicalName = 'Weller Special Reserve';
  await assert.rejects(() => collect(source), /title mapping/iu);
  const missing = clone(candidates.sources[3]); delete missing.products[0].titleMapping;
  await assert.rejects(() => collect(missing), /compatibility/iu);
});

for (const [name, edit] of [
  ['wrong address', html => html.replaceAll('91201', '91202')],
  ['unknown store', html => html.replaceAll('1700 W Glenoaks Blvd.,', 'Different Store')],
  ['wrong product heading', html => html.replace(/(<h2\b[^>]*>)[\s\S]*?(<\/h2>)/iu, '$1Other Product$2')],
  ['unknown status', html => html.replaceAll('Pickup available', 'Check store')],
  ['conflicting status', html => html.replaceAll('Pickup available', 'Pickup available Pickup unavailable')],
  ['duplicate row', html => html.replace('</ul>', `${html.match(/<li\b[\s\S]*?<\/li>/iu)[0]}</ul>`) ],
  ['truncated response', () => '<div id="shopify-section-pickup-availability"></div>'],
  ['hidden premises row', html => html.replace('<li class=', '<li hidden class=')],
  ['inert premises wrapper', html => `<section inert>${html}</section>`],
  ['template premises wrapper', html => `<template>${html}</template>`],
  ['aria-hidden premises row', html => html.replace('<li class=', '<li aria-hidden="true" class=')],
  ['display-none premises row', html => html.replace('<li class=', '<li style="display: none" class=')],
  ['script-only positive status', html => html.replaceAll('Pickup available', '<script>Pickup available</script>')],
]) test(`pickup rejects ${name} without accepting an empty snapshot`, async () => {
  await assert.rejects(() => collect(defaultSource(), { pickupEdit: edit }));
});

for (const source of [candidates.sources[0], candidates.sources[2], candidates.sources[3]]) test(`explicit negative is a healthy complete zero: ${source.id}`, async () => {
  const result = await collect(source, { pickupEdit: html => html.replaceAll('Pickup available', 'Pickup unavailable') });
  assert.deepEqual(result.signals, []); assert.equal(result.accounting.negativeProducts, 1);
  assert.equal(result.accounting.completeSnapshot, true); assert.equal(result.observations[0].availabilityStatus, 'out_of_stock');
});

test('genuine store theme currently-unavailable wording is healthy negative with matching identity', async () => {
  const genuine = captures.get('https://www.thebarreltap.com/variants/45394129518817/?section_id=store-availability').text;
  assert.match(genuine, /Pickup currently unavailable/iu);
  // Reuse its genuine status wording inside the otherwise unchanged Main Street
  // fixture so heading/address validation is exercised before negative parsing.
  const result = await collect(candidates.sources[2], { pickupEdit: html => html.replaceAll('Pickup available', 'Pickup currently unavailable') });
  assert.equal(result.signals.length, 0); assert.equal(result.accounting.negativeProducts, 1); assert.equal(result.metadata.completeSnapshot, true);
});

test('positive pickup conflicts with explicit JSON unavailable', async () => {
  await assert.rejects(() => collect(defaultSource(), { productEdit: payload => { payload.product.variants[0].available = false; } }), /conflicts/iu);
});

test('store theme preserves unit and rejects missing unit, extra partial row, and malformed div structure', async () => {
  const source = candidates.sources[2];
  await assert.rejects(() => collect(source, { pickupEdit: html => html.replace('<br>100<br>', '<br>') }), /premises/iu);
  await assert.rejects(() => collect(source, { pickupEdit: html => html + '<div class="store-availability__info"><strong>Other Store</strong><p>Pickup available</p></div>' }), /address/iu);
  await assert.rejects(() => collect(source, { pickupEdit: html => html + '<div>' }), /markup/iu);
});

test('variant-only heading exception remains strict and is never an endpoint-only fallback', async () => {
  const source = candidates.sources[3];
  await assert.rejects(() => collect(source, { pickupEdit: html => html.replace('<small>750mL</small>', '<small>375mL</small>') }), /heading/iu);
  await assert.rejects(() => collect(source, { pickupEdit: html => html.replace('<small>750mL</small>', '') }), /heading/iu);
  const invalid = clone(source); delete invalid.products[0].headingException;
  assert.throws(() => validateShopifyVariantSource(invalid), /exception/iu);
});

for (const status of [401, 403, 429]) for (const stage of [1, 2]) test(`HTTP ${status} stops without retry at stage ${stage} and preserves cooldown`, async () => {
  const source = defaultSource(), injected = transport(source, { override: (url, options, count) => count === stage ? { ok: false, status, url, text: 'Denied', retryAfterSeconds: 172800 } : null });
  await assert.rejects(() => collectShopifyVariantPickup(bible, source, { fetchText: injected.fetchText }), error => {
    assert.equal(error.status, status); assert.equal(error.transient, false); assert.equal(error.details.retryAfterSeconds, 172800);
    assert.equal(error.details.accounting.completeSnapshot, false); assert.equal(error.details.accounting.requestCount, stage); return true;
  });
  assert.equal(injected.calls.length, stage);
});

test('redirects and malformed JSON are rejected, never interpreted as unavailable', async () => {
  for (const override of [url => ({ ok: true, status: 200, url: url.replace('www.remedyliquor.com', 'evil.example'), text: '{}' }),
    url => ({ ok: true, status: 200, url, text: '{broken' })]) await assert.rejects(() => collect(defaultSource(), { override }));
});

test('byte limits are hard bounds; aborted work does not begin a request', async () => {
  const source = defaultSource(); source.budgets = { maxBodyBytes: 1 };
  await assert.rejects(() => collect(source), /byte budget/iu);
  const controller = new AbortController(); controller.abort(); let calls = 0;
  await assert.rejects(() => collectShopifyVariantPickup(bible, defaultSource(), { signal: controller.signal, fetchText: async () => { calls++; } }));
  assert.equal(calls, 0);
});

test('transport body cap shrinks to the remaining total and rejects an over-returned body', async () => {
  const source = defaultSource(), productBytes = Buffer.byteLength(captures.get(source.products[0].evidence.product.url).text);
  source.budgets = { maxTotalBytes: productBytes + 17 };
  const injected = transport(source);
  await assert.rejects(() => collectShopifyVariantPickup(bible, source, { fetchText: injected.fetchText }), error => {
    assert.match(error.message, /byte budget/iu); assert.equal(error.details.accounting.completeSnapshot, false); return true;
  });
  assert.equal(injected.calls.length, 2);
  assert.equal(injected.calls[0].options.maxBytes, productBytes + 17);
  assert.equal(injected.calls[1].options.maxBytes, 17);
});

test('exhausted total budget prevents the pickup request entirely', async () => {
  const source = defaultSource(), productBytes = Buffer.byteLength(captures.get(source.products[0].evidence.product.url).text);
  source.budgets = { maxTotalBytes: productBytes };
  const injected = transport(source);
  await assert.rejects(() => collectShopifyVariantPickup(bible, source, { fetchText: injected.fetchText }), error => {
    assert.match(error.message, /byte budget exhausted/iu); assert.equal(error.details.accounting.requestCount, 1);
    assert.equal(error.details.accounting.bytes, productBytes); assert.equal(error.details.accounting.completeSnapshot, false); return true;
  });
  assert.equal(injected.calls.length, 1); assert.equal(injected.calls[0].options.maxBytes, productBytes);
});

test('uncooperative transport is bounded by request timeout', async () => {
  const source = defaultSource(); source.budgets = { requestTimeoutMs: 10, maxElapsedMs: 30 }; let calls = 0;
  await assert.rejects(() => collectShopifyVariantPickup(bible, source, { fetchText: async () => { calls++; return new Promise(() => {}); } }), error => error.kind === 'timeout');
  assert.equal(calls, 1);
});

test('unsupported real retailer formats remain unsupported despite positive endpoint status', async () => {
  const source = clone(candidates.sources[2]), product = JSON.parse(captures.get('https://www.thebarreltap.com/products/elijah-craig-barrel-proof-batch-c925.json').text).product;
  source.baseUrl = 'https://www.thebarreltap.com';
  source.stores = [{ id: 'unsupported', name: 'The Barrel Tap', pickupName: '9410 Jamacha Blvd', address: '9410 Jamacha Blvd Spring Valley CA 91977', city: 'Spring Valley', zip: '91977' }];
  source.products = [{ productId: String(product.id), variantId: String(product.variants[0].id), handle: product.handle, title: product.title, canonicalName: 'Elijah Craig Barrel Proof', evidence: {} }];
  source.products[0].titleMapping = { rawTitle: product.title, canonicalName: 'Elijah Craig Barrel Proof', reason: 'Unsupported-format fixture keeps exact batch title in raw metadata; family-only canonical mapping.', allowedUnsafeReasons: [] };
  for (const kind of ['product', 'pickup']) {
    const url = kind === 'product' ? `${source.baseUrl}/products/${product.handle}.json` : `${source.baseUrl}/variants/${product.variants[0].id}/?section_id=store-availability`;
    const capture = captures.get(url); source.products[0].evidence[kind] = { url, sha256: capture.entry.sha256, capturedAt: capture.entry.capturedAt, status: 200 };
  }
  const matchingBible = new BourbonBible([{ id: 'ecbp', canonical: 'Elijah Craig Barrel Proof', normalizedKey: fingerprintName('Elijah Craig Barrel Proof'), tier: 'allocated' }]);
  const injected = transport(source);
  await assert.rejects(() => collectShopifyVariantPickup(matchingBible, source, { fetchText: injected.fetchText }), /heading/iu);
  assert.equal(injected.calls.length, 2);
});
