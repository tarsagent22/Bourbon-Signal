import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { BourbonBible } from '../../engine/src/core/bible.mjs';
import { shopifyPremiseAddressSignature } from '../../engine/src/collectors/shopify-premises-identity.mjs';
import { fingerprintName } from '../../engine/src/core/text.mjs';
import { bibleLookup } from '../../engine/src/export-site-contract.mjs';
import { validateShopifyVariantSource, describeShopifyVariantSource, collectShopifyVariantPickup } from '../../engine/src/collectors/shopify-variant-pickup.mjs';
import * as classificationModule from '../../src/lib/drop-classification.ts';

type Row = Record<string, any>;
type Bytes = string | Uint8Array;
export type ShopifyBatchCapture = { url: string; finalUrl: string; status: number; capturedAt: string; sha256: string; bytes: number; body: Bytes };
export type ShopifyBatchReviewInput = { manifest: Row; collectorBytes: Bytes; premisesIdentityBytes?: Bytes; catalogBytes: Bytes; classificationBytes: Bytes; captures: ShopifyBatchCapture[]; now?: number };
const classification = (classificationModule as any).default || classificationModule;
export const SHOPIFY_BATCH_LIMITS = Object.freeze({ sources: 10, premises: 25, plannedRequests: 40, inputBodyBytes: 32 * 1024 * 1024, captureFreshnessMs: 3600000 });
const PENDING = ['production_catalog_authority_pending', 'physical_baseline_and_alias_review_pending', 'current_live_preflight_pending', 'scheduled_observation_pending', 'explicit_admission_pending'];
const rare = (tier: unknown) => typeof tier === 'string' && ['limited', 'allocated', 'unicorn'].includes(tier);
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const buffer = (value: Bytes) => typeof value === 'string' ? Buffer.from(value, 'utf8') : value instanceof Uint8Array ? Buffer.from(value) : null;
const unique = (values: string[]) => [...new Set(values)];
const distinct = (values: unknown[]) => new Set(values).size;
const STATES = new Set('AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC'.split(' '));
const scalarText = (value: unknown, max = 500) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const hashText = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const byteLength = (value: unknown) => typeof value === 'string' ? Buffer.byteLength(value, 'utf8') : value instanceof Uint8Array ? value.byteLength : null;
const utcClock = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return NaN;
  const at = Date.parse(value);
  return Number.isFinite(at) && new Date(at).toISOString() === value ? at : NaN;
};
const stringList = (value: unknown) => Array.isArray(value) && value.every(item => scalarText(item));
const catalogTiers = new Set(['standard', 'core', 'unknown', 'regular', 'limited', 'allocated', 'unicorn', 'highly_allocated']);
const marketTiers = new Set(['regular', 'limited', 'allocated', 'unicorn', 'highly_allocated']);


/**
 * Offline evidence review only. All capture bodies and context bytes are supplied
 * by the caller. The only local I/O independently reads the two FIXED imported
 * collector/identity implementation files to verify caller bytes and all pins.
 * Caller bytes are never executed; no environment, network or database reads.
 * The mandatory capture transport never delegates to fetch or storage.
 * Saved catalog/classification and replay clocks establish fixture compatibility,
 * not current production authority. No admissions or descriptors are fabricated.
 * manifestSha256 hashes JSON.stringify(manifest), not a CLI file's whitespace.
 */
export async function reviewShopifyOnboardingBatch({ manifest, collectorBytes, premisesIdentityBytes, catalogBytes, classificationBytes, captures, now = Date.now() }: ShopifyBatchReviewInput) {
  const report: Row = { contractVersion: 'bourbon-signal/shopify-batch-onboarding@1', scope: 'offline_preparation_no_admission_or_activation',
    generatedAt: Number.isFinite(now) && Number.isFinite(new Date(now).getTime()) ? new Date(now).toISOString() : null, hashes: {}, limits: SHOPIFY_BATCH_LIMITS,
    counts: { sources: 0, premises: 0, plannedRequests: 0, fixtureReplayRequests: 0, fixtureBodyBytes: 0, inputBodyBytes: 0,
      fixtureCompatibleSources: 0, eligibleFixturePremises: 0, accepted: 0, liveRequests: 0 }, sources: [], blockers: [], accepted: 0, activated: false,
    caveats: ['Fixture replay never refreshes a captured observation or establishes current production catalog/classification authority.',
      'Physical baseline, exact aliases, current permitted preflight, scheduled observation and explicit admission require separate reviewed evidence.',
      'Complete negative pickup is healthy fixture evidence, not a positive inventory connection. No live requests or activation occur.'] };
  const block = (code: string) => report.blockers.push(code);
  if (!Number.isFinite(now) || !Number.isFinite(new Date(now).getTime())) { block('invalid_review_clock'); return report; }
  if (!manifest || manifest.schemaVersion !== 1 || !Array.isArray(manifest.sources) || !manifest.sources.length || manifest.sources.length > SHOPIFY_BATCH_LIMITS.sources
    || !Array.isArray(captures) || captures.length > SHOPIFY_BATCH_LIMITS.plannedRequests) { block('invalid_or_oversized_batch'); return report; }
  report.counts.sources = manifest.sources.length;
  // Bound arrays before any source traversal or serialization. A malformed
  // source is isolated later; an oversized batch is never partially replayed.
  if (manifest.sources.some((source: Row) => Array.isArray(source?.stores) && source.stores.length > 5
    || Array.isArray(source?.products) && source.products.length > 2)) { block('invalid_or_oversized_source'); return report; }
  let manifestText: string;
  try {
    let units = 0;
    manifestText = JSON.stringify(manifest, (_key, value) => {
      units += typeof value === 'string' ? value.length : 1;
      if (units > 256 * 1024) throw Error();
      return value;
    });
    if (Buffer.byteLength(manifestText) > 256 * 1024) throw Error();
  } catch { block('invalid_or_oversized_manifest'); return report; }
  // Inspect lengths before copying, UTF-8 decoding or hashing caller buffers.
  const contextLengths = [collectorBytes, premisesIdentityBytes, catalogBytes, classificationBytes].map(byteLength);
  const bodyLengths = captures.map(capture => byteLength(capture?.body));
  const contextCaps = [128 * 1024, 128 * 1024, 2 * 1024 * 1024, 2 * 1024 * 1024];
  const totalBytes = [...contextLengths, ...bodyLengths].reduce<number>((sum, length) => sum + (length || 0), 0);
  report.counts.inputBodyBytes = totalBytes;
  if (totalBytes > SHOPIFY_BATCH_LIMITS.inputBodyBytes) block('input_body_budget_exceeded');
  if (contextLengths.some((length, i) => length !== null && length > contextCaps[i])) block('context_byte_budget_exceeded');
  if (bodyLengths.some(length => length !== null && length > 2 * 1024 * 1024)) block('capture_body_budget_exceeded');
  if (report.blockers.length) return report;
  let code: Buffer | null, catalog: Buffer | null, classes: Buffer | null, identityBytes: Buffer | null;
  try {
    code = buffer(collectorBytes); catalog = buffer(catalogBytes); classes = buffer(classificationBytes);
    identityBytes = premisesIdentityBytes === undefined ? null : buffer(premisesIdentityBytes);
    if (!code || !catalog || !classes) throw Error();
    report.hashes = { collectorSha256: sha(code), catalogSha256: sha(catalog), classificationSha256: sha(classes),
      premisesIdentitySha256: identityBytes ? sha(identityBytes) : null, manifestSha256: sha(manifestText) };
  } catch { block('invalid_context_bytes'); return report; }
  try {
    const [actualCollector, actualIdentity] = await Promise.all([
      readFile(new URL('../../engine/src/collectors/shopify-variant-pickup.mjs', import.meta.url)),
      readFile(new URL('../../engine/src/collectors/shopify-premises-identity.mjs', import.meta.url)),
    ]);
    if (actualCollector.length > 128 * 1024 || actualIdentity.length > 128 * 1024) throw Error();
    if (!code.equals(actualCollector)) block('collector_implementation_bytes_mismatch');
    if (!identityBytes || !identityBytes.equals(actualIdentity)) block('premises_identity_implementation_bytes_mismatch');
  } catch { block('fixed_implementation_unavailable'); }
  for (const [key, error] of [['collectorSha256', 'collector_code_pin_mismatch'], ['premisesIdentitySha256', 'premises_identity_code_pin_mismatch'],
    ['catalogSha256', 'catalog_pin_mismatch'], ['classificationSha256', 'classification_pin_mismatch']]) {
    if (!hashText(manifest[key]) || manifest[key] !== report.hashes[key]) block(error);
  }
  const bodies = new Map<string, { capture: ShopifyBatchCapture; text: string; errors: string[]; ageMs: number }>();
  const duplicateUrls = new Set<string>();
  for (const capture of captures) {
    if (!capture || typeof capture.url !== 'string') { block('invalid_capture_record'); continue; }
    let body: Buffer | null = null;
    try { body = buffer(capture.body); } catch { /* Bound validation below. */ }
    if (!body) { bodies.set(capture.url, { capture, text: '', errors: ['capture_body_invalid'], ageMs: NaN }); continue; }
    const text = body.toString('utf8'), errors: string[] = [], at = utcClock(capture.capturedAt), ageMs = now - at;
    if (!Buffer.from(text, 'utf8').equals(body)) errors.push('capture_utf8_invalid');
    if (!Number.isSafeInteger(capture.bytes) || capture.bytes !== body.length) errors.push('capture_byte_count_mismatch');
    if (!hashText(capture.sha256) || capture.sha256 !== sha(body)) errors.push('capture_hash_mismatch');
    if (capture.finalUrl !== capture.url) errors.push('capture_redirect');
    if (capture.status !== 200) errors.push('capture_http_not_success');
    if (!Number.isFinite(at)) errors.push('capture_clock_invalid');
    else if (ageMs < 0) errors.push('capture_clock_future');
    if (bodies.has(capture.url)) duplicateUrls.add(capture.url);
    bodies.set(capture.url, { capture: { ...capture, body: '' }, text, errors, ageMs });
  }
  const ids = new Set(), runtimeIds = new Set(), tuples = new Set(), premises = new Set();
  const locations = new Map<string, Array<{ unit: string | null; unitKind: string | null }>>();
  for (const source of manifest.sources) {
    if (!source || typeof source !== 'object') continue;
    if (typeof source.id === 'string') { if (ids.has(source.id)) block('duplicate_source_identity'); ids.add(source.id); }
    if (typeof source.runtimeId === 'string') { if (runtimeIds.has(source.runtimeId)) block('duplicate_source_identity'); runtimeIds.add(source.runtimeId); }
    for (const store of Array.isArray(source.stores) ? source.stores : []) {
      report.counts.premises++;
      const signature = shopifyPremiseAddressSignature(store?.address, { state: source.state, city: store?.city, zip: store?.zip });
      const key = signature?.key;
      if (key && premises.has(key)) block('duplicate_physical_premise'); if (key) premises.add(key);
      if (signature) {
        const base = JSON.stringify([signature.state, signature.zip, signature.city, signature.house, signature.street]);
        const prior = locations.get(base) || [];
        if (prior.some(other => (other.unit === null || signature.unit === null || other.unit === signature.unit)
          && (other.unit !== signature.unit || other.unitKind !== signature.unitKind))) block('physical_colocation_review_unresolved');
        prior.push({ unit: signature.unit, unitKind: signature.unitKind }); locations.set(base, prior);
      }
      for (const product of Array.isArray(source.products) ? source.products : []) {
        const values = [source.state, source.chain, store?.id, product?.productId, product?.variantId];
        if (values.some(value => typeof value !== 'string')) continue;
        const tuple = JSON.stringify(values);
        if (tuples.has(tuple)) block('duplicate_owned_tuple'); tuples.add(tuple);
      }
    }
  }
  if (report.counts.premises > SHOPIFY_BATCH_LIMITS.premises) block('premise_budget_exceeded');
  const prepared: Array<{ input: Row; source?: Row; plan?: Row; output: Row }> = manifest.sources.map((input: Row) => {
    const output: Row = { sourceId: typeof input?.runtimeId === 'string' && /^[a-z]{2}:[a-z0-9-]{1,100}$/u.test(input.runtimeId) ? input.runtimeId : null, state: typeof input?.state === 'string' && STATES.has(input.state) ? input.state : null, configSha256: null,
      reuseFamily: null, exceptions: [], plannedRequests: 0, replayStatus: 'not_replayed', accounting: { requestCount: 0, bytes: 0, completeSnapshot: false },
      captureEvidence: [], stores: [], blockers: [] };
    try {
      const source = validateShopifyVariantSource(input), plan = describeShopifyVariantSource(source, { collectorSha256: report.hashes.collectorSha256 });
      Object.assign(output, { configSha256: plan.configSha256, reuseFamily: plan.reuseFamily, exceptions: plan.exceptions, plannedRequests: plan.requestCount });
      output.stores = source.stores.map((store: Row) => ({ storeId: store.id, name: store.name, address: store.address, fixturePositive: false,
        fixtureNegative: false, eligibleFixtureBottles: 0, bottleBreadth: 0, bottles: [], pickupSemantics: 'binary_retailer_orderable_no_exact_count',
        blockers: [...PENDING] }));
      report.counts.plannedRequests += plan.requestCount;
      return { input, source, plan, output };
    } catch { output.blockers.push('configuration_invalid'); return { input, output }; }
  });
  report.sources = prepared.map(item => item.output);
  if (report.counts.plannedRequests > SHOPIFY_BATCH_LIMITS.plannedRequests) block('planned_request_budget_exceeded');
  let bible: any, lookup: any, index: any;
  try {
    const parsed = JSON.parse(catalog.toString('utf8')), rawRecords = parsed.records || parsed.bottles;
    if (!Array.isArray(rawRecords) || !rawRecords.length || rawRecords.length > 10000) throw Error();
    const records = rawRecords.map((row: Row) => {
      if (!row || typeof row !== 'object' || Array.isArray(row)) throw Error();
      for (const field of ['canonical_id', 'id', 'canonical_name', 'canonical', 'name', 'tier']) {
        if (row[field] !== undefined && !scalarText(row[field])) throw Error();
      }
      const id = row.canonical_id || row.id, canonical = row.canonical_name || row.canonical || row.name;
      if (!scalarText(id, 180) || !scalarText(canonical) || !catalogTiers.has(row.tier)
        || (row.aliases !== undefined && !stringList(row.aliases))) throw Error();
      return { id, canonical, tier: row.tier, normalizedKey: fingerprintName(canonical), aliases: row.aliases || [] };
    });
    if (distinct(records.map((row: Row) => row.id)) !== records.length) throw Error();
    bible = new BourbonBible(records); lookup = bibleLookup(records);
    const artifact = JSON.parse(classes.toString('utf8'));
    if (!Array.isArray(artifact.records) || !artifact.records.length || artifact.records.length > 10000) throw Error();
    for (const row of artifact.records) {
      if (!row || typeof row !== 'object' || !scalarText(row.id, 180) || !scalarText(row.canonicalName)
        || !marketTiers.has(row.nationalTier) || (row.tier !== undefined && !marketTiers.has(row.tier))
        || (row.aliases !== undefined && !stringList(row.aliases)) || !Array.isArray(row.stateOverrides)) throw Error();
      for (const override of row.stateOverrides) {
        if (!override || typeof override !== 'object' || !scalarText(override.jurisdiction, 30) || !marketTiers.has(override.tier)
          || !scalarText(override.reason, 10000) || !stringList(override.sourceIds)) throw Error();
      }
    }
    index = classification.getDropClassificationIndex(artifact.records);
  } catch { block('catalog_or_classification_invalid'); }
  report.blockers = unique(report.blockers);
  if (report.blockers.length) return report;
  for (const { source, plan, output } of prepared) {
    if (!source || !plan) continue;
    for (const seed of source.products) for (const kind of ['product', 'pickup']) {
      const expected = seed.evidence[kind], body = bodies.get(expected.url);
      if (!body) { output.blockers.push('capture_missing'); continue; }
      output.blockers.push(...body.errors);
      if (duplicateUrls.has(expected.url)) output.blockers.push('capture_duplicate_url');
      if (body.capture.sha256 !== expected.sha256 || body.capture.capturedAt !== expected.capturedAt || body.capture.status !== expected.status) output.blockers.push('config_capture_binding_mismatch');
      output.captureEvidence.push({ url: expected.url, capturedAt: Number.isFinite(utcClock(body.capture.capturedAt)) ? body.capture.capturedAt : null, ageMs: Number.isFinite(body.ageMs) ? body.ageMs : null,
        stale: body.ageMs > SHOPIFY_BATCH_LIMITS.captureFreshnessMs, sha256: hashText(body.capture.sha256) ? body.capture.sha256 : null, bytes: Number.isSafeInteger(body.capture.bytes) ? body.capture.bytes : null });
    }
    output.blockers = unique(output.blockers);
    if (!output.blockers.length) {
      // Preserve the oldest paired capture clock, never the replay/review clock.
      const observedAt = new Date(Math.min(...output.captureEvidence.map((row: Row) => Date.parse(row.capturedAt)))).toISOString();
      try {
        const allowed = new Set(plan.plannedRequests);
        const result = await collectShopifyVariantPickup(bible, source, { observedAt, fetchText: async (url: string) => {
          if (!allowed.has(url) || !bodies.has(url)) throw new Error('Offline fixture URL not supplied');
          if (++report.counts.fixtureReplayRequests > SHOPIFY_BATCH_LIMITS.plannedRequests) throw new Error('Offline batch request budget exceeded');
          const body = bodies.get(url)!;
          report.counts.fixtureBodyBytes += Buffer.byteLength(body.text, 'utf8');
          return { ok: true, status: 200, url: body.capture.finalUrl, text: body.text };
        } });
        output.accounting = result.accounting;
        output.replayStatus = result.metadata.completeSnapshot ? 'complete' : 'partial';
        if (result.metadata.completeSnapshot) report.counts.fixtureCompatibleSources++;
        for (const store of output.stores) {
          store.bottles = source.products.map((seed: Row) => {
            const record = bible.match(seed.canonicalName)?.record, current = record && lookup.byId.get(record.id);
            const market = current ? classification.resolveDropClassification({ state: source.state, canonical_id: current.id,
              canonical_name: current.canonical, tier: current.tier }, index) : null;
            const observation = result.observations.find((row: Row) => row.storeId === store.storeId && row.productId === seed.productId && row.variantId === seed.variantId);
            const positive = observation?.availabilityStatus === 'in_stock', eligible = !!current && rare(current.tier) && rare(market?.tier);
            return { productId: seed.productId, variantId: seed.variantId, canonicalId: current?.id || null, canonicalName: current?.canonical || null,
              canonicalTier: current?.tier || null, marketTier: market?.tier || null, availability: observation?.availabilityStatus || 'unknown',
              observedAt: observation?.observedAt || null, fixtureEligible: positive && eligible, quantity: 0, quantityIsExact: false,
              fulfillment: 'variant_pickup_offer' };
          });
          store.fixturePositive = store.bottles.some((row: Row) => row.availability === 'in_stock');
          store.fixtureNegative = store.bottles.length > 0 && store.bottles.every((row: Row) => row.availability === 'out_of_stock');
          store.eligibleFixtureBottles = store.bottles.filter((row: Row) => row.fixtureEligible).length;
          store.bottleBreadth = distinct(store.bottles.filter((row: Row) => row.fixtureEligible).map((row: Row) => row.canonicalId));
          if (store.bottles.some((row: Row) => !rare(row.canonicalTier) || !rare(row.marketTier))) store.blockers.push('saved_catalog_or_market_ineligible');
          if (!store.fixturePositive) store.blockers.push('positive_pickup_evidence_missing');
          if (store.eligibleFixtureBottles) report.counts.eligibleFixturePremises++;
        }
      } catch (error: any) {
        output.replayStatus = 'rejected'; output.blockers.push('collector_rejected_fixture');
        output.accounting = error?.details?.accounting || output.accounting;
      }
    } else output.replayStatus = 'evidence_rejected';
    if (output.captureEvidence.some((row: Row) => row.stale)) output.blockers.push('fixture_evidence_stale');
    output.blockers = unique([...output.blockers, ...PENDING]);
    for (const store of output.stores) store.blockers = unique([...store.blockers, ...output.blockers]);
  }
  return report;
}
