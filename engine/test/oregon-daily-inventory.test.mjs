import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { collectOregonDailyInventory, OREGON_DAILY_BODY_MAX_BYTES, OREGON_DAILY_INVENTORY_URL, oregonIdentityCandidate, parseOregonDailyInventoryCsv, resolveOregonBourbonIdentity } from '../src/or-daily-inventory.mjs';

const csv = `"OLCC Daily Store Inventory","Report Date","Store Number","Location","Street Address","City","Zip Code","Phone Number","Hours Of Operation","Item Code","New Item Code","Description","Category","Size","Proof","Age","Quantity","Bottle Price","Case Price","Inventory Date"
,11/13/2026,1001,"North, South Liquor","225 S Main Street",CONDON,97823,541-256-1200,"Mon-Fri 9-6",8189B,99900818975,"BUFFALO TRACE BOURBON",DOMESTIC WHISKEY | STRAIGHT | SMALL BATCH,750 ML,90,0,11,28.95,347.40,11/12
,11/13/2026,1002,Another Store,10 Oak St,SALEM,97301,503-555-0100,Daily,8189B,99900818975,"BUFFALO TRACE BOURBON",DOMESTIC WHISKEY | STRAIGHT | SMALL BATCH,750 ML,90,0,0,28.95,347.40,11/6
,11/13/2026,1003,Old Store,1 Pine St,SALEM,97301,503-555-0101,Daily,8189B,99900818975,"BUFFALO TRACE BOURBON",DOMESTIC WHISKEY | STRAIGHT | SMALL BATCH,750 ML,90,0,4,28.95,347.40,11/1
,11/13/2026,1004,Beer Shop,2 Main St,SALEM,97301,503-555-0102,Daily,1111,99900111175,"BOURBON BARREL STOUT",BEER,750 ML,0,0,2,9.99,119.88,11/12
,11/13/2026,1005,Whiskey Shop,3 Main St,SALEM,97301,503-555-0103,Daily,2222,99900222275,"RYE WHISKEY",DOMESTIC WHISKEY,750 ML,90,0,7,30.00,360.00,11/12`;

function bibleFor(revision = 'fixture-v1') {
  return { records: [{ revision }], match: (candidate) => ({ record: { id: `bb_${candidate}`, canonical: candidate, tier: 'allocated' }, method: 'exact-normalized-alias' }) };
}

async function cacheDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), 'or-daily-cache-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

function head200(etag = '"or-r1"', length = Buffer.byteLength(csv)) {
  return new Response(null, { status: 200, headers: { etag, 'content-length': String(length) } });
}

function csv200(etag = '"or-r1"') {
  const body = new TextEncoder().encode(csv);
  return new Response(body, { status: 200, headers: { etag, 'content-length': String(body.length), 'content-type': 'text/csv' } });
}

test('Oregon parser keeps exact fresh premise inventory, true zeroes, and source dates', () => {
  const payload = parseOregonDailyInventoryCsv(csv, { terms: ['buffalo trace'], generatedAt: '2026-11-14T12:00:00Z', bible: bibleFor() });
  assert.equal(payload.sourceUrl, OREGON_DAILY_INVENTORY_URL);
  assert.equal(payload.sourceReportDate, '11/13/2026');
  assert.equal(payload.sourceRowCount, 5);
  assert.equal(payload.productCount, 1);
  assert.equal(payload.storeRowCount, 2);
  assert.equal(payload.staleStoreRowCount, 1);
  assert.deepEqual(payload.products[0].stores.map((store) => store.quantity), [11, 0]);
  assert.equal(payload.products[0].stores[0].storeName, 'North, South Liquor');
  assert.equal(payload.products[0].stores[0].inventoryObservedAt, '2026-11-12T08:00:00.000Z');
  assert.equal(payload.products[0].stores[0].address, '225 S Main Street');
});

test('Oregon parser rejects a changed or ambiguous source header', () => {
  assert.throws(() => parseOregonDailyInventoryCsv('Report,Date\n'), /header did not match/iu);
});

test('Oregon parser refuses reports older than the two day source refresh bound', () => {
  const old = csv.replaceAll('11/13/2026', '11/10/2026');
  assert.throws(() => parseOregonDailyInventoryCsv(old, { generatedAt: '2026-11-14T12:00:00Z', bible: bibleFor() }), /older than two calendar days/iu);
});

test('Oregon parser treats missing inventory quantity as unknown, not zero', () => {
  const missing = csv.replace(',90,0,11,28.95', ',90,0,,28.95');
  const payload = parseOregonDailyInventoryCsv(missing, { terms: ['buffalo trace'], bible: bibleFor() });
  assert.equal(payload.products[0].stores[0].quantity, null);
});

test('Oregon identity resolution requires exact canonical match and an approved proof and size', () => {
  const bible = { match: (name) => ({ record: { canonical: name }, method: 'exact-normalized-alias' }) };
  const product = { name: 'BLANTON GOLD BOURBON', identityCandidate: oregonIdentityCandidate('BLANTON GOLD BOURBON'), size: '750 ML', proof: 103 };
  assert.equal(resolveOregonBourbonIdentity(product, bible).status, 'verified_exact');
  assert.equal(resolveOregonBourbonIdentity({ ...product, proof: 90 }, bible).status, 'proof_or_size_mismatch');
  assert.equal(resolveOregonBourbonIdentity({ ...product, size: '1 L' }, bible).status, 'proof_or_size_mismatch');
  assert.equal(resolveOregonBourbonIdentity(product, { match: () => ({ record: { canonical: "Blanton's Gold" }, method: 'alias-containment' }) }).status, 'unresolved_or_ambiguous');
});

test('Oregon identity rejects generic labels that omit canonical modifiers', () => {
  const ageBible = { match: () => ({ record: { canonical: 'Basil Hayden 10 Year' }, method: 'exact-key' }) };
  const batchBible = { match: () => ({ record: { canonical: 'Four Roses Limited Edition Small Batch' }, method: 'exact-key' }) };
  assert.equal(resolveOregonBourbonIdentity({ name: "BASIL HAYDEN'S BOURBON", size: '750 ML', proof: 80 }, ageBible).status, 'missing_age_modifier');
  assert.equal(resolveOregonBourbonIdentity({ name: 'FOUR ROSES BOURBON', size: '750 ML', proof: 80 }, batchBible).status, 'missing_identity_modifier');
});

test('Oregon identity checks Weller Millennium against the producer-verified proof', () => {
  const bible = { match: (name) => ({ record: { canonical: name }, method: 'exact-library-identity' }) };
  const product = { name: 'Weller Millennium', size: '750 ML', proof: 99 };
  assert.equal(resolveOregonBourbonIdentity(product, bible).status, 'verified_exact');
  assert.equal(resolveOregonBourbonIdentity({ ...product, proof: 90 }, bible).status, 'proof_or_size_mismatch');
});

test('Oregon collector parses bounded streamed CSV across small transport chunks', async () => {
  const encoded = new TextEncoder().encode(csv);
  const body = new ReadableStream({
    start(controller) {
      for (let index = 0; index < encoded.length; index += 7) controller.enqueue(encoded.slice(index, index + 7));
      controller.close();
    },
  });
  const payload = await collectOregonDailyInventory({
    fetchImpl: async () => new Response(body, { headers: { 'content-type': 'text/csv', 'content-length': String(encoded.length) } }),
    terms: ['buffalo trace'],
    bible: bibleFor(),
  });
  assert.equal(payload.storeRowCount, 2);
  assert.equal(payload.sourceBytes, encoded.length);
  assert.match(payload.sourceSha256, /^[0-9a-f]{64}$/u);
  assert.equal(payload.products[0].rarityTier, 'allocated');
  assert.equal(payload.positiveQuantityStoreRowCount, 1);
  assert.equal(payload.uniqueRecentPremiseCount, 1);
});

test('Oregon cache uses conditional HEAD, reuses the validated report, and preserves source clocks', async (t) => {
  const directory = await cacheDirectory(t);
  const calls = [];
  const fetchImpl = async (_url, options) => {
    calls.push({ method: options.method, etag: options.headers['if-none-match'] || null });
    return options.method === 'HEAD' ? head200() : csv200();
  };
  const first = await collectOregonDailyInventory({
    fetchImpl, cacheDir: directory, terms: ['BUFFALO TRACE'], bible: bibleFor(), generatedAt: '2026-11-14T12:00:00.000Z',
  });
  assert.equal(first.cacheDisposition, 'downloaded');
  assert.equal(first.cacheUpdated, true);
  assert.equal(first.sourceBodyFetched, true);
  assert.equal(first.cacheReceipt.httpStatus, 200);
  assert.equal(first.cacheReceipt.sourceSha256, first.sourceSha256);
  assert.equal(first.generatedAt, '2026-11-14T12:00:00.000Z');
  assert.deepEqual(calls.map((call) => call.method), ['HEAD', 'GET']);

  calls.length = 0;
  const reused = await collectOregonDailyInventory({
    fetchImpl: async (_url, options) => {
      calls.push({ method: options.method, etag: options.headers['if-none-match'] || null });
      assert.equal(options.headers['if-none-match'], '"or-r1"');
      return new Response(null, { status: 304, headers: { etag: '"or-r1"' } });
    },
    cacheDir: directory, terms: ['buffalo trace'], bible: bibleFor(), generatedAt: '2026-11-15T10:00:00.000Z',
  });
  assert.equal(reused.cacheDisposition, 'reused_304');
  assert.equal(reused.cacheUpdated, false);
  assert.equal(reused.sourceBodyFetched, false);
  assert.equal(reused.cacheReceipt.httpStatus, 304);
  assert.equal(reused.cacheReceipt.checkedAt, '2026-11-15T10:00:00.000Z');
  assert.equal(reused.generatedAt, first.generatedAt);
  assert.equal(reused.sourceSha256, first.sourceSha256);
  assert.equal(reused.products[0].stores[0].inventoryObservedAt, first.products[0].stores[0].inventoryObservedAt);
  assert.deepEqual(calls.map((call) => call.method), ['HEAD']);
});

test('Oregon unchanged source is reparsed for a changed full Bible without refreshing inventory dates', async (t) => {
  const directory = await cacheDirectory(t);
  await collectOregonDailyInventory({
    fetchImpl: async (_url, options) => options.method === 'HEAD' ? head200() : csv200(),
    cacheDir: directory, terms: ['buffalo trace'], bible: bibleFor('v1'), generatedAt: '2026-11-14T12:00:00.000Z',
  });
  let calls = 0;
  const updated = await collectOregonDailyInventory({
    fetchImpl: async (_url, options) => { calls += 1; return new Response(null, { status: 304, headers: { etag: '"or-r1"' } }); },
    cacheDir: directory, terms: ['buffalo trace'], bible: bibleFor('v2'), generatedAt: '2026-11-14T13:00:00.000Z',
  });
  assert.equal(calls, 1);
  assert.equal(updated.cacheDisposition, 'reparsed_for_bible');
  assert.equal(updated.cacheUpdated, true);
  assert.equal(updated.sourceBodyFetched, false);
  assert.equal(updated.generatedAt, '2026-11-14T12:00:00.000Z');
  assert.equal(updated.products[0].stores[0].inventoryObservedAt, '2026-11-12T08:00:00.000Z');
  const manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8'));
  assert.equal(manifest.bible.recordsSha256, updated.bible.recordsSha256);
});

test('Oregon malformed cache is discarded and replaced only after a bounded 200 GET', async (t) => {
  const directory = await cacheDirectory(t);
  const calls = [];
  const initialFetch = async (_url, options) => options.method === 'HEAD' ? head200() : csv200();
  await collectOregonDailyInventory({ fetchImpl: initialFetch, cacheDir: directory, bible: bibleFor() });
  await writeFile(path.join(directory, 'report.json'), '{ malformed');
  const payload = await collectOregonDailyInventory({
    fetchImpl: async (_url, options) => {
      calls.push({ method: options.method, conditional: options.headers['if-none-match'] || null });
      return options.method === 'HEAD' ? head200() : csv200();
    },
    cacheDir: directory, bible: bibleFor(), generatedAt: '2026-11-14T12:00:00.000Z',
  });
  assert.equal(payload.cacheDisposition, 'downloaded');
  assert.deepEqual(calls, [{ method: 'HEAD', conditional: null }, { method: 'GET', conditional: null }]);
});

test('Oregon cache fails closed on stale 304, access denial, and an oversized source declaration', async (t) => {
  const directory = await cacheDirectory(t);
  await collectOregonDailyInventory({
    fetchImpl: async (_url, options) => options.method === 'HEAD' ? head200() : csv200(),
    cacheDir: directory, bible: bibleFor(), generatedAt: '2026-11-14T12:00:00.000Z',
  });
  let calls = 0;
  await assert.rejects(collectOregonDailyInventory({
    fetchImpl: async () => { calls += 1; return new Response(null, { status: 304, headers: { etag: '"or-r1"' } }); },
    cacheDir: directory, bible: bibleFor(), generatedAt: '2026-11-16T12:00:00.000Z',
  }), (error) => {
    assert.match(error.message, /stale.*no source or inventory clocks were refreshed/iu);
    assert.equal(error.oregonCacheReceipt.httpStatus, 304);
    assert.equal(error.oregonCacheReceipt.cacheStatus, 'stale_validated_cache');
    return true;
  });
  assert.equal(calls, 1);

  await assert.rejects(collectOregonDailyInventory({
    fetchImpl: async () => new Response(null, { status: 403 }), cacheDir: directory, bible: bibleFor(),
  }), (error) => {
    assert.match(error.message, /conditional HEAD returned HTTP 403/iu);
    assert.equal(error.oregonCacheReceipt.httpStatus, 403);
    return true;
  });
  await assert.rejects(collectOregonDailyInventory({
    fetchImpl: async () => head200('"too-large"', OREGON_DAILY_BODY_MAX_BYTES + 1), cacheDir: directory, bible: bibleFor(),
  }), /exceeded 150 MB limit/iu);
});
