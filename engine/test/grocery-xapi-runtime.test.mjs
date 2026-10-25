import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { BourbonBible } from '../src/core/bible.mjs';
import { stableId } from '../src/core/text.mjs';
import { NEVADA_RETAILER_SOURCES } from '../src/collectors/nevada-retailer-surfaces.mjs';
import { collectGroceryXapiSource, groceryXapiSourceFromNevada } from '../src/collectors/grocery-xapi-runtime-source.mjs';
import { isNevadaRetailerInventory } from '../src/nevada-retailer-policy.mjs';
import { confidenceForSignal } from '../src/confidence-policy.mjs';
import { bibleLookup, publicSignal, buildStores } from '../src/export-site-contract.mjs';
import { withCollectionContext } from '../src/core/collection-context.mjs';
import { sourceScopeMatches, mergePollProjection, recoveryPolicy } from '../src/sources/poll-policy.mjs';
import { collectNevada } from '../src/collectors/precision-probes.mjs';

const fixture = JSON.parse(readFileSync(new URL('./fixtures/grocery-xapi/2026-10-25-five-prospects-six-premises-derived.json', import.meta.url)));
const replacement = JSON.parse(readFileSync(new URL('./fixtures/grocery-xapi/2026-10-25-safeway1749-derived.json', import.meta.url))).source;
const bible = new BourbonBible(JSON.parse(readFileSync(new URL('./fixtures/shopify-variant-pickup/current-bourbon-bible.json', import.meta.url))).records);
const lookup = bibleLookup(bible.records);
const definition = row => ({ ...row, banner: row.host.split('.')[1],
  id: row.sourceId, runtimeId: row.sourceId });
const policies = Object.fromEntries(['NV', 'CA', 'AZ'].map(state => [state,
  { admitSource: source => [...fixture.sources, replacement].some(row => row.sourceId === source.id), admitBottle: () => true }]));
const responseOf = row => ({ ok: true, status: 200, elapsedMs: 9,
  text: JSON.stringify({ response: { docs: row.products.map(entry => entry.product) } }) });
const collect = (row, extra = {}) => collectGroceryXapiSource(bible, definition(row), {
  policies, clock: () => Date.parse(row.source.capturedAt), fetchText: async () => responseOf(row), ...extra });

test('same runtime request, matcher and normal serializer serve all six captured premises', async () => {
  let total = 0;
  for (const row of fixture.sources) {
    let calls = 0;
    const result = await collect(row, { fetchText: async (url, options) => {
      calls++;
      assert.equal(new URL(url).searchParams.get('storeid'), row.merchantId);
      assert.equal(options.maxBytes, 2_097_152); assert.equal(options.timeoutMs, 12_000);
      assert.equal(options.maxRedirects, 0); assert.deepEqual(options.reviewedSeedUrls, [url]);
      return responseOf(row);
    } });
    assert.equal(calls, 1); assert.equal(result.accounting.requestCount, 1);
    assert.equal(result.metadata.completeSnapshot, false);
    assert.equal(result.metadata.absenceIsOutOfStock, false);
    assert.equal(result.accounting.bytes, Buffer.byteLength(responseOf(row).text));
    assert.equal(result.signals.length, row.products.length);
    for (const signal of result.signals) {
      assert.equal(signal.storeAddress, row.premise.address);
      assert.equal(signal.stateCode, row.state); assert.equal(signal.sourceRuntimeId, row.sourceId);
      assert.equal(signal.observedAt, row.source.capturedAt); // saved source clock, no fresh-stock claim
      const expected = row.products.find(p => p.expected.productId === signal.productId).expected;
      assert.equal(signal.canonicalBottleId, expected.canonicalId);
      assert.equal(signal.quantity, expected.quantity);
      assert.equal(signal.inventorySemantics, expected.inventorySemantics);
      const serialized = publicSignal({ ...signal, ...confidenceForSignal(signal) }, lookup);
      assert.equal(serialized.storeId, row.premise.storeId);
      assert.equal(serialized.quantity, expected.quantity);
      if (row.state !== 'AZ') {
        assert.equal(serialized.canAlertAsInventory, false, 'new NV/CA identity has no production admission');
        assert.equal(serialized.canAlertAsWatch, false);
      }
    }
    assert(buildStores(result.signals).some(store => store.id === row.premise.storeId));
    total += result.signals.length;
  }
  assert.equal(total, 16);
});

test('current five-prospect cohort reuses the unchanged runtime; released AZ2799 stays a control', async () => {
  const cohort = [...fixture.sources.filter(row => row.state !== 'AZ'), replacement];
  assert.equal(cohort.length, 5); assert.equal(new Set(cohort.map(row => row.state)).size, 3);
  assert(!cohort.some(row => row.merchantId === '2799'));
  let rows = 0;
  for (const source of cohort) {
    const result = await collect(source);
    assert.equal(result.signals.length, source.products.length);
    for (const signal of result.signals) {
      const expected = source.products.find(row => row.expected.productId === signal.productId).expected;
      assert.equal(signal.canonicalName, expected.canonicalName);
      assert.equal(signal.quantity, expected.quantity);
      assert.equal(signal.storeId, source.premise.storeId);
    }
    rows += result.signals.length;
  }
  assert.equal(rows, 13);
});

test('existing Nevada registry adapter preserves stable IDs, score and exact-store public policy', async () => {
  // Structural compatibility scenario: real captured product objects rebound to
  // existing store662. This is not new provider evidence for662.
  const existing = NEVADA_RETAILER_SOURCES.find(s => s.merchantId === '662');
  const source = groceryXapiSourceFromNevada(existing);
  const payload = responseOf(fixture.sources[0]);
  const body = JSON.parse(payload.text);
  body.response.docs.forEach(product => { product.storeId = '662'; });
  const result = await collectGroceryXapiSource(bible, source, {
    policies: { NV: { admitSource: candidate => candidate.id === existing.id, admitBottle: () => true } },
    clock: () => Date.parse(fixture.sources[0].source.capturedAt),
    fetchText: async () => ({ ...payload, text: JSON.stringify(body) }),
  });
  assert.equal(result.signals.length, 2);
  for (const signal of result.signals) {
    assert.equal(signal.id, stableId(['NV', 'nevada-retailer', existing.id, signal.productId, signal.variantId]));
    assert.equal(signal.confidence, 0.82);
    assert.equal(isNevadaRetailerInventory(signal), true);
    assert.equal(isNevadaRetailerInventory({ ...signal, storeAddress: 'Another premise' }), false);
    assert.equal(publicSignal(signal, lookup).storeAddress, existing.store.address);
  }
});

test('failures are typed, single-attempt and never yield fresh signals', async () => {
  for (const [response, kind] of [
    [{ ok: false, status: 403, retryAfterSeconds: 600 }, 'permanent'],
    [{ ok: false, status: 429, retryAfterSeconds: 600 }, 'transient'],
    [{ ok: false, status: 503 }, 'transient'],
    [{ ok: false, status: 0, error: 'operation timed out' }, 'timeout'],
    [{ ok: false, status: 200, error: 'Collection response exceeded 2097152 bytes' }, 'malformed'],
    [{ ok: false, status: 200, error: 'connection closed' }, 'transient'],
    [{ ok: true, status: 200, text: '{bad' }, 'malformed'],
    [{ ok: true, status: 200, text: '{}' }, 'malformed'],
  ]) {
    let calls = 0;
    await assert.rejects(collect(fixture.sources[0], { fetchText: async () => { calls++; return response; } }),
      error => error.kind === kind && error.details.requestCount === 1);
    assert.equal(calls, 1);
  }
  const result = await collect(fixture.sources[0], { fetchText: async () => ({ ok: true, status: 200, text: '{"response":{"docs":[]}}' }) });
  assert.deepEqual(result.signals, [], 'a valid empty inventory response replaces former stock');
});

test('real shared fetch transport enforces decoded-body and redirect bounds without a second request', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  try {
    for (const makeResponse of [
      () => new Response('oversized body', { status: 200, headers: { 'content-length': '2097153' } }),
      () => new Response(null, { status: 302, headers: { location: 'https://www.safeway.com/other' } }),
    ]) {
      calls = 0;
      globalThis.fetch = async (_url, options) => { calls++; assert.equal(options.redirect, 'manual'); return makeResponse(); };
      await assert.rejects(collectGroceryXapiSource(bible, definition(fixture.sources[0]), {
        policies, clock: () => Date.parse(fixture.sources[0].source.capturedAt),
      }));
      assert.equal(calls, 1);
    }
  } finally { globalThis.fetch = originalFetch; }
});

test('missing source policy and caller/inherited cancellation prevent collection', async () => {
  let calls = 0;
  await assert.rejects(collect(fixture.sources[0], { policies: {}, fetchText: async () => { calls++; } }));
  const controller = new AbortController(); controller.abort();
  await assert.rejects(collect(fixture.sources[0], { signal: controller.signal }));
  await assert.rejects(withCollectionContext({ signal: controller.signal }, () => collect(fixture.sources[0])));
  const active = new AbortController();
  await assert.rejects(withCollectionContext({ signal: active.signal }, () => collect(fixture.sources[0], {
    fetchText: async () => { calls++; active.abort(); return responseOf(fixture.sources[0]); },
  })));
  assert.equal(calls, 1);
});

test('actual Nevada caller propagates abort without fetching a sibling or publishing cache', async () => {
  const controller = new AbortController();
  let calls = 0, writes = 0, pauses = 0;
  const sourceIds = NEVADA_RETAILER_SOURCES.filter(s => s.platform === 'albertsons-xapi').map(s => s.id);
  await assert.rejects(collectNevada({ id: 'NV' }, bible, {
    sourceIds, signal: controller.signal, readCache: async () => null,
    writeCache: async () => { writes++; }, sleep: async () => { pauses++; },
    fetchText: async () => { calls++; controller.abort(); return responseOf(fixture.sources[0]); },
  }));
  assert.equal(calls, 1); assert.equal(writes, 0); assert.equal(pauses, 0);
});

test('existing owned-partition policy supports expiry, error, disablement and denied-source pauses', async () => {
  const row = fixture.sources[0], signal = (await collect(row)).signals[0];
  const source = { id: row.sourceId, kind: 'grocery-xapi', state: row.state, chain: row.sourceId,
    storeIds: [row.premise.storeId], expiryHours: 1, failClosedOnError: true,
    noImmediateRetry: true, accessDeniedPauseSeconds: 86400, rateLimitedPauseSeconds: 14400 };
  assert.equal(sourceScopeMatches(source, signal), true);
  assert.equal(sourceScopeMatches(source, { ...signal, storeId: 'albertsons:9999' }), false);
  const job = { source_id: source.id, last_reason: 'accepted', projection: { drops: [signal], candidates: [signal] } };
  const capturedAt = Date.parse(signal.observedAt);
  assert.equal(mergePollProjection([], [job], [source], 'candidates', capturedAt + 1).length, 1);
  assert.equal(mergePollProjection([], [job], [source], 'candidates', capturedAt + 3_600_001).length, 0);
  assert.equal(mergePollProjection([], [job], [{ ...source, disabled: true }], 'candidates', capturedAt).length, 0);
  assert.equal(mergePollProjection([], [{ ...job, last_reason: 'http_503' }], [source], 'candidates', capturedAt).length, 0);
  assert.equal(recoveryPolicy('source_access_denied', 0, 0, source).pause, 86400);
  assert.equal(recoveryPolicy('rate_limited', 0, 0, source).pause, 14400);
  assert.equal(recoveryPolicy('http_503', 0, 0, source).retry, false);
  // Policy reuse only: this source definition has not been registered or run.
});
