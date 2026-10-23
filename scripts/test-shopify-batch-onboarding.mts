import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { reviewShopifyOnboardingBatch, SHOPIFY_BATCH_LIMITS, type ShopifyBatchReviewInput } from './lib/shopify-batch-onboarding.mts';

type Row = Record<string, any>;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const root = new URL('../engine/test/fixtures/shopify-variant-pickup/', import.meta.url);
const collectorBytes = await readFile(new URL('../engine/src/collectors/shopify-variant-pickup.mjs', import.meta.url));
const premisesIdentityBytes = await readFile(new URL('../engine/src/collectors/shopify-premises-identity.mjs', import.meta.url));
const catalogBytes = await readFile(new URL('current-bourbon-bible.json', root));
const classificationBytes = await readFile(new URL('../src/data/drop-feed-classification.generated.json', import.meta.url));
const original = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-candidates.json', import.meta.url), 'utf8'));
const v2 = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-cohort-v2.json', import.meta.url), 'utf8'));
const all = new Map<string, Row>();
for (const directory of [root, new URL('v2/', root)]) {
  const manifest = JSON.parse(await readFile(new URL('manifest.json', directory), 'utf8'));
  for (const capture of manifest.captures) {
    const body = await readFile(new URL(capture.file, directory));
    assert.equal(hash(body), capture.sha256); assert.equal(body.length, capture.bytes);
    all.set(capture.requestedUrl, { url: capture.requestedUrl, finalUrl: capture.finalUrl, status: capture.status,
      capturedAt: capture.capturedAt, sha256: capture.sha256, bytes: capture.bytes, body });
  }
}
const now = Date.parse('2026-10-23T04:00:00.000Z');
function input(plan = v2): ShopifyBatchReviewInput {
  const manifest = structuredClone(plan);
  // Explicitly synthetic preparation pin of the actual currently imported file;
  // never modifies the published V2 manifest or claims it has been re-reviewed.
  manifest.collectorSha256 = hash(collectorBytes);
  manifest.premisesIdentitySha256 = hash(premisesIdentityBytes);
  manifest.catalogSha256 = hash(catalogBytes);
  manifest.classificationSha256 = hash(classificationBytes);
  const urls = manifest.sources.flatMap((source: Row) => source.products.flatMap((product: Row) => Object.values(product.evidence).map((evidence: any) => evidence.url)));
  return { manifest, collectorBytes, premisesIdentityBytes, catalogBytes, classificationBytes, captures: urls.map((url: string) => structuredClone(all.get(url)!)) as any, now };
}
function reviseCapture(value: ShopifyBatchReviewInput, index: number, text: string) {
  const capture = value.captures[index];
  capture.body = Buffer.from(text); capture.bytes = Buffer.byteLength(text); capture.sha256 = hash(text);
  for (const source of value.manifest.sources) for (const product of source.products) for (const evidence of Object.values(product.evidence) as Row[]) {
    if (evidence.url === capture.url) evidence.sha256 = capture.sha256;
  }
}
function safe(report: Row) {
  assert.equal(report.accepted, 0); assert.equal(report.counts.accepted, 0); assert.equal(report.activated, false); assert.equal(report.counts.liveRequests, 0);
  assert.ok(!('descriptors' in report)); assert.ok(!JSON.stringify(report).includes('body_html'));
}

test('real five-source capture combination replays unchanged collector and actual catalog/state classification without admissions or network', async () => {
  const value = input(), before = hash(JSON.stringify(value.manifest));
  const fetch = globalThis.fetch; globalThis.fetch = (() => { throw new Error('Forbidden live fetch'); }) as any;
  let report: Row;
  try { report = await reviewShopifyOnboardingBatch(value); } finally { globalThis.fetch = fetch; }
  assert.deepEqual(report.blockers, []); assert.equal(report.counts.sources, 5); assert.equal(report.counts.premises, 5);
  assert.equal(report.counts.plannedRequests, 10); assert.equal(report.counts.fixtureReplayRequests, 10); assert.equal(report.counts.fixtureBodyBytes, 30111);
  assert.equal(report.counts.fixtureCompatibleSources, 5); assert.equal(report.counts.eligibleFixturePremises, 5);
  assert.equal(new Set(report.sources.map((row: Row) => row.state)).size, 3);
  const bottles = report.sources.flatMap((row: Row) => row.stores.flatMap((store: Row) => store.bottles));
  assert.equal(new Set(bottles.map((row: Row) => row.canonicalId)).size, 4);
  assert.ok(bottles.every((row: Row) => row.quantity === 0 && row.quantityIsExact === false && row.fulfillment === 'variant_pickup_offer'));
  const vino = report.sources.find((row: Row) => row.state === 'NY').stores[0].bottles[0];
  assert.equal(vino.canonicalTier, 'unicorn'); assert.equal(vino.marketTier, 'allocated');
  assert.equal(hash(JSON.stringify(value.manifest)), before, 'Review never mutates candidate configuration');
  for (const source of report.sources) {
    assert.equal(source.replayStatus, 'complete');
    assert.ok(source.blockers.includes('explicit_admission_pending'));
    assert.ok(source.blockers.includes('physical_baseline_and_alias_review_pending'));
    assert.ok(source.stores.every((row: Row) => row.blockers.includes('production_catalog_authority_pending')));
    assert.equal(source.stores[0].bottles[0].observedAt, source.captureEvidence.map((row: Row) => row.capturedAt).sort()[0]);
  }
  safe(report);
});

test('historical original regular Buffalo Trace seeds remain excluded by actual CA state classification', async () => {
  const report = await reviewShopifyOnboardingBatch(input(original));
  assert.equal(report.counts.fixtureCompatibleSources, 5); assert.equal(report.counts.eligibleFixturePremises, 3);
  for (const source of report.sources.filter((row: Row) => ['ca:remedy-glendale', 'ca:main-street-el-cajon'].includes(row.sourceId))) {
    assert.equal(source.stores[0].bottles[0].marketTier, 'regular'); assert.equal(source.stores[0].eligibleFixtureBottles, 0);
    assert.ok(source.stores[0].blockers.includes('saved_catalog_or_market_ineligible'));
  }
  safe(report);
});

for (const mode of ['body tamper', 'missing', 'redirect', 'bad bytes', 'wrong status', 'metadata binding', 'future']) test(`bad first-source capture is isolated: ${mode}`, async () => {
  const value = input();
  if (mode === 'body tamper') value.captures[0].body = 'changed';
  if (mode === 'missing') value.captures.splice(0, 1);
  if (mode === 'redirect') value.captures[0].finalUrl = 'https://other.invalid/';
  if (mode === 'bad bytes') value.captures[0].bytes++;
  if (mode === 'wrong status') value.captures[0].status = 403;
  if (mode === 'metadata binding') value.captures[0].capturedAt = '2026-10-23T03:00:00.000Z';
  if (mode === 'future') value.now = Date.parse(value.captures[0].capturedAt) - 1;
  const report = await reviewShopifyOnboardingBatch(value);
  assert.equal(report.sources[0].replayStatus, 'evidence_rejected'); assert.equal(report.accepted, 0);
  if (mode !== 'future') { assert.equal(report.counts.fixtureCompatibleSources, 4); assert.ok(report.sources.slice(1).every((row: Row) => row.replayStatus === 'complete')); }
  else assert.ok(report.sources[0].blockers.includes('capture_clock_future'));
  safe(report);
});

test('stale captures can demonstrate parsing but never acquire a fresh observation clock or admission', async () => {
  const value = input(); value.now = Date.parse('2026-10-24T12:00:00.000Z');
  const report = await reviewShopifyOnboardingBatch(value);
  assert.equal(report.counts.fixtureCompatibleSources, 5);
  assert.ok(report.sources.every((row: Row) => row.blockers.includes('fixture_evidence_stale')));
  assert.ok(report.sources.every((row: Row) => Date.parse(row.stores[0].bottles[0].observedAt) < value.now! - 3600000)); safe(report);
});

test('partial/malformed pickup is collector rejection while a complete unavailable pickup is healthy negative evidence', async () => {
  const partial = input(); reviseCapture(partial, 1, '<html>No pickup schema</html>');
  let report = await reviewShopifyOnboardingBatch(partial);
  assert.equal(report.sources[0].replayStatus, 'rejected'); assert.equal(report.counts.fixtureCompatibleSources, 4);
  assert.equal(report.sources[0].accounting.completeSnapshot, false);
  const negative = input(); const text = Buffer.from(negative.captures[1].body).toString('utf8');
  assert.match(text, /Pickup available/u); reviseCapture(negative, 1, text.replaceAll('Pickup available', 'Pickup unavailable'));
  report = await reviewShopifyOnboardingBatch(negative);
  assert.equal(report.sources[0].replayStatus, 'complete'); assert.equal(report.sources[0].stores[0].fixtureNegative, true);
  assert.equal(report.sources[0].stores[0].fixturePositive, false); assert.equal(report.sources[0].stores[0].eligibleFixtureBottles, 0);
  assert.ok(report.sources[0].stores[0].blockers.includes('positive_pickup_evidence_missing')); safe(report);
});

test('invalid source configuration does not hide remaining independently valid source results', async () => {
  const value = input(); value.manifest.sources[0].baseUrl = 'http://unsafe.invalid';
  const report = await reviewShopifyOnboardingBatch(value);
  assert.equal(report.sources[0].replayStatus, 'not_replayed'); assert.ok(report.sources[0].blockers.includes('configuration_invalid'));
  assert.equal(report.counts.fixtureCompatibleSources, 4); safe(report);
});

for (const mode of ['source', 'tuple', 'physical']) test(`duplicate ${mode} authority fails batch before replay`, async () => {
  const value = input(), first = value.manifest.sources[0], second = value.manifest.sources[1];
  if (mode === 'source') second.runtimeId = first.runtimeId;
  if (mode === 'physical') { second.state = first.state; second.stores[0] = { ...first.stores[0] }; }
  if (mode === 'tuple') { second.state = first.state; second.chain = first.chain; second.stores[0].id = first.stores[0].id; second.products[0].productId = first.products[0].productId; second.products[0].variantId = first.products[0].variantId; }
  const report = await reviewShopifyOnboardingBatch(value);
  assert.ok(report.blockers.some((code: string) => code.startsWith('duplicate_'))); assert.equal(report.counts.fixtureReplayRequests, 0); safe(report);
});

test('actual collector bytes must match the manifest pin; old published V2 cannot silently acquire a changed implementation', async () => {
  const value = input(); value.manifest.collectorSha256 = '0'.repeat(64);
  const report = await reviewShopifyOnboardingBatch(value);
  assert.ok(report.blockers.includes('collector_code_pin_mismatch')); assert.equal(report.counts.fixtureReplayRequests, 0);
  const published = input(); published.manifest = structuredClone(v2);
  const result = await reviewShopifyOnboardingBatch(published);
  assert.equal(result.blockers.includes('collector_code_pin_mismatch'), v2.collectorSha256 !== hash(collectorBytes)); safe(result);
});

test('global input/source/premise bounds and invalid context fail closed without replay', async () => {
  const sourceOverflow = input(); sourceOverflow.manifest.sources = Array.from({ length: 11 }, () => sourceOverflow.manifest.sources[0]);
  assert.ok((await reviewShopifyOnboardingBatch(sourceOverflow)).blockers.includes('invalid_or_oversized_batch'));
  const premiseOverflow = input(); premiseOverflow.manifest.sources[0].stores = Array.from({ length: 26 }, (_, i) => ({ ...premiseOverflow.manifest.sources[0].stores[0], id: `store-${i}`, address: `${i} Other Street, Glendale CA 91201` }));
  assert.ok((await reviewShopifyOnboardingBatch(premiseOverflow)).blockers.includes('invalid_or_oversized_source'));
  const bytesOverflow = input(); bytesOverflow.captures[0].body = Buffer.alloc(SHOPIFY_BATCH_LIMITS.inputBodyBytes + 1);
  let report = await reviewShopifyOnboardingBatch(bytesOverflow); assert.ok(report.blockers.includes('input_body_budget_exceeded')); assert.equal(report.counts.fixtureReplayRequests, 0);
  const badCatalog = input(); badCatalog.catalogBytes = Buffer.from('{}'); badCatalog.manifest.catalogSha256 = hash(badCatalog.catalogBytes);
  report = await reviewShopifyOnboardingBatch(badCatalog); assert.ok(report.blockers.includes('catalog_or_classification_invalid')); safe(report);
});


test('current strict replay requires exact supplied shared premises identity bytes', async () => {
  const value = input(); value.manifest.premisesIdentitySha256 = hash(premisesIdentityBytes);
  let report = await reviewShopifyOnboardingBatch(value); assert.equal(report.counts.fixtureCompatibleSources, 5);
  assert.equal(report.hashes.premisesIdentitySha256, hash(premisesIdentityBytes));
  delete value.premisesIdentityBytes;
  report = await reviewShopifyOnboardingBatch(value); assert.ok(report.blockers.includes('premises_identity_code_pin_mismatch'));
  value.premisesIdentityBytes = Buffer.from('modified helper');
  report = await reviewShopifyOnboardingBatch(value); assert.ok(report.blockers.includes('premises_identity_code_pin_mismatch'));
  assert.equal(report.counts.fixtureReplayRequests, 0); safe(report);
});

for (const mode of ['missing unit', 'different unit marker']) test(`co-location is unresolved review, never counted as independent: ${mode}`, async () => {
  const value = input(), first = value.manifest.sources[0], second = value.manifest.sources[1];
  first.stores[0].address = '1700 W Glenoaks Blvd Suite 100, Glendale CA 91201';
  second.state = first.state;
  second.stores[0] = { ...first.stores[0], id: 'distinct-test-store',
    address: mode === 'missing unit' ? '1700 W Glenoaks Boulevard, Glendale CA 91201' : '1700 W Glenoaks Blvd Apt 100, Glendale CA 91201' };
  const report = await reviewShopifyOnboardingBatch(value);
  assert.ok(report.blockers.includes('physical_colocation_review_unresolved')); assert.equal(report.counts.fixtureReplayRequests, 0);
  assert.equal(report.counts.eligibleFixturePremises, 0); safe(report);
});

test('cyclic/oversized metadata and invalid date never escape as an unhandled review', async () => {
  const cyclic = input(); cyclic.manifest.circular = cyclic.manifest;
  assert.ok((await reviewShopifyOnboardingBatch(cyclic)).blockers.includes('invalid_or_oversized_manifest'));
  const date = input(); date.now = 1e20;
  assert.ok((await reviewShopifyOnboardingBatch(date)).blockers.includes('invalid_review_clock'));
  const products = input(); products.manifest.sources[0].products = Array(3).fill(products.manifest.sources[0].products[0]);
  assert.ok((await reviewShopifyOnboardingBatch(products)).blockers.includes('invalid_or_oversized_source'));
});


for (const dependency of ['collector', 'identity']) test(`spoofed ${dependency} bytes with matching fake pin never label imported code as that hash`, async () => {
  const value = input(), fake = Buffer.from('FAKE_IMPLEMENTATION_PRIVATE_CANARY');
  if (dependency === 'collector') { value.collectorBytes = fake; value.manifest.collectorSha256 = hash(fake); }
  else { value.premisesIdentityBytes = fake; value.manifest.premisesIdentitySha256 = hash(fake); }
  const report = await reviewShopifyOnboardingBatch(value);
  assert.ok(report.blockers.some((code: string) => code.endsWith('implementation_bytes_mismatch')));
  assert.equal(report.counts.fixtureReplayRequests, 0); assert.equal(report.counts.eligibleFixturePremises, 0);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_CANARY')); safe(report);
});

for (const key of ['collectorSha256', 'premisesIdentitySha256', 'catalogSha256', 'classificationSha256']) test(`missing or wrong mandatory provenance pin: ${key}`, async () => {
  for (const missing of [true, false]) {
    const value = input(); if (missing) delete value.manifest[key]; else value.manifest[key] = '0'.repeat(64);
    const report = await reviewShopifyOnboardingBatch(value);
    assert.ok(report.blockers.some((code: string) => code.endsWith('pin_mismatch'))); assert.equal(report.counts.fixtureReplayRequests, 0); safe(report);
  }
});

for (const clock of ['2026-10-23', '2026-10-23T02:20:00', '2026-02-30T02:20:00.000Z']) test(`capture clock must be exact UTC, not ambiguous or calendar-normalized: ${clock}`, async () => {
  const value = input(); value.captures[0].capturedAt = clock;
  value.manifest.sources[0].products[0].evidence.product.capturedAt = clock;
  const report = await reviewShopifyOnboardingBatch(value);
  assert.equal(report.sources[0].replayStatus, 'evidence_rejected'); assert.ok(report.sources[0].blockers.includes('capture_clock_invalid'));
  assert.equal(report.counts.fixtureCompatibleSources, 4); assert.equal(report.sources[0].stores[0].bottles.length, 0); safe(report);
});

test('invalid nested state is not copied into rejected source report', async () => {
  const value = input(); value.manifest.sources[0].state = { secret: 'PRIVATE_CANARY' };
  const report = await reviewShopifyOnboardingBatch(value);
  assert.equal(report.sources[0].state, null); assert.equal(report.sources[0].replayStatus, 'not_replayed');
  assert.ok(!JSON.stringify(report).includes('PRIVATE_CANARY')); assert.equal(report.counts.fixtureCompatibleSources, 4); safe(report);
});

for (const fixture of ['catalog', 'classification']) for (const field of ['id', 'canonical', 'tier']) test(`nested ${fixture} ${field} is rejected without copying tainted context`, async () => {
  const value = input(); const bytes = fixture === 'catalog' ? value.catalogBytes : value.classificationBytes;
  const artifact = JSON.parse(Buffer.from(bytes).toString('utf8'));
  const key = fixture === 'classification' ? ({ id: 'id', canonical: 'canonicalName', tier: 'nationalTier' } as any)[field] : field;
  artifact.records[0][key] = { secret: 'PRIVATE_CANARY' };
  const modified = Buffer.from(JSON.stringify(artifact));
  if (fixture === 'catalog') { value.catalogBytes = modified; value.manifest.catalogSha256 = hash(modified); }
  else { value.classificationBytes = modified; value.manifest.classificationSha256 = hash(modified); }
  const report = await reviewShopifyOnboardingBatch(value);
  assert.ok(report.blockers.includes('catalog_or_classification_invalid')); assert.equal(report.counts.fixtureReplayRequests, 0);
  assert.ok(!JSON.stringify(report).includes('PRIVATE_CANARY')); safe(report);
});

test('oversized context and body reject before decoding and hashing caller buffers', async () => {
  for (const kind of ['context', 'body']) {
    const value = input(); const oversized = Buffer.alloc(kind === 'context' ? 2 * 1024 * 1024 + 1 : 32 * 1024 * 1024 + 1);
    oversized.toString = () => { throw Error('Oversized bytes must never be decoded'); };
    if (kind === 'context') value.catalogBytes = oversized; else value.captures[0].body = oversized;
    const report = await reviewShopifyOnboardingBatch(value);
    assert.ok(report.blockers.includes(kind === 'context' ? 'context_byte_budget_exceeded' : 'input_body_budget_exceeded'));
    assert.equal(report.counts.fixtureReplayRequests, 0); assert.deepEqual(report.hashes, {}); safe(report);
  }
});


for (const field of ['id', 'name', 'address', 'city', 'zip']) test(`nested store ${field} is rejected without copying private context`, async () => {
  const value = input(); value.manifest.sources[0].stores[0][field] = { secret: 'PRIVATE_CANARY' };
  const report = await reviewShopifyOnboardingBatch(value);
  assert.equal(report.sources[0].replayStatus, 'not_replayed'); assert.equal(report.sources[0].stores.length, 0);
  assert.equal(report.counts.fixtureCompatibleSources, 4); assert.ok(!JSON.stringify(report).includes('PRIVATE_CANARY')); safe(report);
});

test('a single capture over two MiB is rejected even below the total batch cap', async () => {
  const value = input(); value.captures[0].body = Buffer.alloc(2 * 1024 * 1024 + 1);
  const report = await reviewShopifyOnboardingBatch(value);
  assert.ok(report.blockers.includes('capture_body_budget_exceeded')); assert.ok(!report.blockers.includes('input_body_budget_exceeded'));
  assert.equal(report.counts.fixtureReplayRequests, 0); assert.deepEqual(report.hashes, {}); safe(report);
});
