import assert from 'node:assert/strict';
import test from 'node:test';

import { collectOregonDailyInventory, OREGON_DAILY_INVENTORY_URL, oregonIdentityCandidate, parseOregonDailyInventoryCsv, resolveOregonBourbonIdentity } from '../src/or-daily-inventory.mjs';

const csv = `"OLCC Daily Store Inventory","Report Date","Store Number","Location","Street Address","City","Zip Code","Phone Number","Hours Of Operation","Item Code","New Item Code","Description","Category","Size","Proof","Age","Quantity","Bottle Price","Case Price","Inventory Date"
,11/13/2026,1001,"North, South Liquor","225 S Main Street",CONDON,97823,541-256-1200,"Mon-Fri 9-6",8189B,99900818975,"BUFFALO TRACE BOURBON",DOMESTIC WHISKEY | STRAIGHT | SMALL BATCH,750 ML,90,0,11,28.95,347.40,11/12
,11/13/2026,1002,Another Store,10 Oak St,SALEM,97301,503-555-0100,Daily,8189B,99900818975,"BUFFALO TRACE BOURBON",DOMESTIC WHISKEY | STRAIGHT | SMALL BATCH,750 ML,90,0,0,28.95,347.40,11/6
,11/13/2026,1003,Old Store,1 Pine St,SALEM,97301,503-555-0101,Daily,8189B,99900818975,"BUFFALO TRACE BOURBON",DOMESTIC WHISKEY | STRAIGHT | SMALL BATCH,750 ML,90,0,4,28.95,347.40,11/1
,11/13/2026,1004,Beer Shop,2 Main St,SALEM,97301,503-555-0102,Daily,1111,99900111175,"BOURBON BARREL STOUT",BEER,750 ML,0,0,2,9.99,119.88,11/12
,11/13/2026,1005,Whiskey Shop,3 Main St,SALEM,97301,503-555-0103,Daily,2222,99900222275,"RYE WHISKEY",DOMESTIC WHISKEY,750 ML,90,0,7,30.00,360.00,11/12`;

function bibleFor() {
  return { match: (candidate) => ({ record: { id: `bb_${candidate}`, canonical: candidate, tier: 'allocated' }, method: 'exact-normalized-alias' }) };
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
  assert.equal(payload.products[0].rarityTier, 'allocated');
  assert.equal(payload.uniqueRecentPremiseCount, 2);
});
