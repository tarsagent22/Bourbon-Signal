import test from 'node:test';
import assert from 'node:assert/strict';
import { BourbonBible } from '../src/core/bible.mjs';
import { fingerprintName } from '../src/core/text.mjs';
import { JENSENS_RUNTIME_SOURCE, collectJensensSource } from '../src/collectors/florida-jensens-runtime-source.mjs';

const title = 'Elijah Craig Single Barrel 18 Years Bourbon Whiskey';
const handle = 'elijah-craig-single-barrel-18-years-bourbon-whiskey';
const productUrl = `https://jensensliquors.com/products/${handle}.json`;
const pickupUrl = 'https://jensensliquors.com/variants/67703590977610/?section_id=pickup-availability';
const observedAt = '2026-10-23T01:00:00.000Z';
const canonical = 'Elijah Craig 18 Year';
const bible = new BourbonBible([{ id: 'reviewed-elijah18', canonical, normalizedKey: fingerprintName(canonical), tier: 'unicorn', aliases: ['EC18', 'Elijah Craig Single Barrel 18Y'] }]);
function product() {
  return { product: { id: 15414448390218, handle, title, product_type: 'Straight Bourbon', tags: 'American, Bourbon, single barrel, whiskey',
    body_html: '<p>Tasting notes: honey, vanilla, chocolate. Mashbill 13% Rye.</p><p>750 ML</p>',
    variants: [{ id: 67703590977610, product_id: 15414448390218, title: 'Default Title', option1: 'Default Title', price: '249.99', sku: '9674901018' }] } };
}
function pickup({ status = 'Pickup available, usually ready in 24 hours', name = 'Jensen’s Liquors PICKUP', address = '1646 Southwest 27th Avenue<br>Miami FL 33145<br>United States', heading = title } = {}) {
  return `<pickup-availability-drawer><h2 id="PickupAvailabilityHeading">${heading}</h2><ul><li class="pickup-availability-list__item"><h3>${name}</h3><p>${status}</p><address><p>${address}</p><p>+13054420804</p></address></li></ul></pickup-availability-drawer>`;
}
function transport({ payload = product(), html = pickup(), override } = {}) {
  const calls = [];
  return { calls, fetchText: async (url, options) => {
    calls.push({ url, options });
    if (override) { const replaced = await override(url, options, calls.length); if (replaced) return replaced; }
    assert.ok([productUrl, pickupUrl].includes(url), `Unreviewed request ${url}`);
    return { ok: true, status: 200, url, text: url === productUrl ? JSON.stringify(payload) : html };
  } };
}
test('reviewed product with real canonical matching and exact pickup emits binary availability', async () => {
  const injected = transport();
  const result = await collectJensensSource(bible, { observedAt, fetchText: injected.fetchText });
  assert.equal(result.signals.length, 1);
  const row = result.signals[0];
  assert.equal(row.canonicalBottleId, 'reviewed-elijah18');
  assert.equal(row.rawName, title);
  assert.equal(row.productId, '15414448390218');
  assert.equal(row.variantId, '67703590977610');
  assert.equal(row.sourceRuntimeId, 'fl:jensens-miami');
  assert.equal(row.storeId, 'jensens-liquors:1646-sw-27th');
  assert.equal(row.storeAddress, '1646 SW 27th Ave, Miami, FL 33145');
  assert.equal(row.sourceProductBinding, pickupUrl);
  assert.equal(row.raw.sizeMl, 750);
  assert.equal(row.price, 249.99);
  assert.equal(row.quantity, 0);
  assert.equal(row.quantityIsExact, false);
  assert.equal(row.availabilityStatus, 'in_stock');
  assert.equal(row.pickupOfferVerified, true);
  assert.equal(row.observedAt, observedAt);
  assert.equal(result.accounting.requestCount, 2);
  assert.equal(result.accounting.completeSnapshot, true);
  assert.equal(result.accounting.positiveProducts, 1);
  assert.equal(result.accounting.negativeProducts, 0);
  assert.equal(result.metadata.completeSnapshot, true);
  assert.deepEqual(injected.calls.map(c => c.url), [productUrl, pickupUrl]);
  for (const { options } of injected.calls) {
    assert.equal(options.maxRedirects, 0);
    assert.ok(options.maxBytes <= 2 * 1024 * 1024);
    assert.ok(options.timeoutMs > 0 && options.timeoutMs <= 12_000);
    assert.ok(options.signal instanceof AbortSignal);
  }
});
test('explicit unavailable exact pickup is a complete healthy negative, never a source failure', async () => {
  const injected = transport({ html: pickup({ status: 'Pickup unavailable' }) });
  const result = await collectJensensSource(bible, { observedAt, fetchText: injected.fetchText });
  assert.deepEqual(result.signals, []);
  assert.equal(result.accounting.negativeProducts, 1);
  assert.equal(result.metadata.completeSnapshot, true);
  assert.equal(injected.calls.length, 2);
});
const badProducts = {
  'wrong product id': p => p.product.id = 7793267081290,
  'wrong variant id': p => p.product.variants[0].id = 41616729079882,
  'variant belongs to another product': p => p.product.variants[0].product_id = 7793267081290,
  'wrong product handle': p => p.product.handle = 'buffalo-trace',
  'wrong named expression': p => p.product.title = 'Elijah Craig Small Batch Bourbon',
  'duplicate ambiguous variant': p => p.product.variants.push(structuredClone(p.product.variants[0])),
  '375ML found only in full description': p => p.product.body_html = '<p>375 ML</p>',
  'missing volume found nowhere': p => p.product.body_html = '<p>Honey vanilla oak notes</p>',
  'ambiguous body volume': p => p.product.body_html = '<p>750 ML and 375 ML</p>',
  'oversize': p => p.product.body_html = '<p>3 L</p>',
  'nonboolean availability': p => p.product.variants[0].available = 'true',
  'invalid price': p => p.product.variants[0].price = 'not-a-price',
};
for (const [name, change] of Object.entries(badProducts)) test(`metadata rejects ${name} before pickup`, async () => {
  const payload = product(); change(payload);
  const injected = transport({ payload });
  await assert.rejects(collectJensensSource(bible, { observedAt, fetchText: injected.fetchText }), error => error.kind === 'malformed');
  assert.equal(injected.calls.length, 1);
});
const badPickup = {
  'wrong address': pickup({ address: '999 Southwest 27th Avenue<br>Miami FL 33145' }),
  'wrong store name': pickup({ name: 'Another Liquor Store PICKUP' }),
  'wrong bottle heading': pickup({ heading: 'Buffalo Trace Bourbon' }),
  'unknown success page': '<html>Success</html>',
  'conflicting positive and negative': pickup({ status: 'Pickup available. Pickup unavailable.' }),
  'missing availability': pickup({ status: 'Call store for information' }),
  'duplicate premises': pickup().replace('</ul>', pickup().match(/<li[\s\S]*<\/li>/)[0] + '</ul>'),
};
for (const [name, html] of Object.entries(badPickup)) test(`pickup rejects ${name} rather than accepting a negative`, async () => {
  const injected = transport({ html });
  await assert.rejects(collectJensensSource(bible, { observedAt, fetchText: injected.fetchText }), error => error.kind === 'malformed');
  assert.equal(injected.calls.length, 2);
});
for (const stage of [1, 2]) for (const status of [401, 403, 429]) test(`HTTP ${status} at stage ${stage} stops without retries`, async () => {
  const injected = transport({ override: (url, _options, call) => call === stage ? { ok: false, status, url, text: '', retryAfterSeconds: 600 } : null });
  await assert.rejects(collectJensensSource(bible, { observedAt, fetchText: injected.fetchText }), error => error.status === status && error.transient === false && error.details.retryAfterSeconds === 600);
  assert.equal(injected.calls.length, stage);
});
test('redirects and oversize responses fail before any followup request', async () => {
  for (const replacement of [
    { url: 'https://attacker.example/products/elijah', text: JSON.stringify(product()) },
    { url: productUrl, text: 'x'.repeat(2 * 1024 * 1024 + 1) },
    { url: productUrl, text: '{invalid json' },
  ]) {
    const injected = transport({ override: () => ({ ok: true, status: 200, ...replacement }) });
    await assert.rejects(collectJensensSource(bible, { observedAt, fetchText: injected.fetchText }), error => error.kind === 'malformed');
    assert.equal(injected.calls.length, 1);
  }
});
test('canonical mapping cannot silently accept another expression', async () => {
  const injected = transport();
  const wrongBible = { match: () => ({ confidence: 1, record: { id: 'wrong', canonical: 'Elijah Craig Small Batch', tier: 'regular' } }) };
  await assert.rejects(collectJensensSource(wrongBible, { observedAt, fetchText: injected.fetchText }), error => error.kind === 'malformed');
  assert.equal(injected.calls.length, 1);
});
test('explicit variant unavailable conflicts with positive pickup', async () => {
  const payload = product(); payload.product.variants[0].available = false;
  const injected = transport({ payload });
  await assert.rejects(collectJensensSource(bible, { observedAt, fetchText: injected.fetchText }), error => error.kind === 'malformed');
});
test('already aborted collection never calls transport', async () => {
  const controller = new AbortController(); controller.abort(); const injected = transport();
  await assert.rejects(collectJensensSource(bible, { observedAt, signal: controller.signal, fetchText: injected.fetchText }));
  assert.equal(injected.calls.length, 0);
});
test('inflight abort settles even a transport that ignores its signal', async () => {
  const controller = new AbortController(); let calls = 0;
  const pending = collectJensensSource(bible, { observedAt, signal: controller.signal, fetchText: () => { calls++; controller.abort(); return new Promise(() => {}); } });
  await assert.rejects(pending);
  assert.equal(calls, 1);
});
test('request timeout settles a noncooperating transport within its measured budget', async t => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let calls = 0;
  const pending = collectJensensSource(bible, { observedAt, fetchText: () => { calls++; return new Promise(() => {}); } });
  const rejected = assert.rejects(pending, error => error.kind === 'timeout');
  await Promise.resolve();
  t.mock.timers.tick(12_001);
  await rejected;
  assert.equal(calls, 1);
});
test('source registry stays confined to reviewed product and request limits', () => {
  assert.equal(JENSENS_RUNTIME_SOURCE.runtimeId, 'fl:jensens-miami');
  assert.equal(JENSENS_RUNTIME_SOURCE.products.length, 1);
  assert.ok(Object.isFrozen(JENSENS_RUNTIME_SOURCE));
  assert.ok(JENSENS_RUNTIME_SOURCE.budgets.maxRequests <= 6);
  assert.ok(JENSENS_RUNTIME_SOURCE.budgets.maxElapsedMs <= 50_000);
});
