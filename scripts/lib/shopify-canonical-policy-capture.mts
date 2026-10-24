import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { RemoteSnapshotStorage } from '../../src/lib/remote-site-snapshot.ts';
import * as snapshotModule from '../../src/lib/remote-site-snapshot.ts';
import * as classificationModule from '../../src/lib/drop-classification.ts';
import { validateShopifyVariantSource, describeShopifyVariantSource } from '../../engine/src/collectors/shopify-variant-pickup.mjs';

type Row = Record<string, any>;
type Bytes = string | Uint8Array;
export const CANONICAL_POLICY_EXPORTS = Object.freeze(['bottles', 'state-health', 'alerts'] as const);
export const CANONICAL_POLICY_DEPENDENCY_FILES = Object.freeze({
  collector: 'engine/src/collectors/shopify-variant-pickup.mjs',
  premisesIdentity: 'engine/src/collectors/shopify-premises-identity.mjs',
  safeMatcher: 'engine/src/collectors/safe-bottle-match.mjs',
  catalog: 'engine/test/fixtures/shopify-variant-pickup/current-bourbon-bible.json',
  classification: 'src/data/drop-feed-classification.generated.json',
  classificationImplementation: 'src/lib/drop-classification.ts',
  sourcePolicyImplementation: 'src/lib/source-scheduler.ts',
});
export const CANONICAL_POLICY_CAPTURE_LIMITS = Object.freeze({ immutableReads: 4, pointerReads: 2, releaseReads: 2,
  manifestBytes: 2 * 1024 * 1024, plaintextObjectBytes: 64 * 1024 * 1024, plaintextTotalBytes: 96 * 1024 * 1024,
  encryptedObjectBytes: 88 * 1024 * 1024, immutableTotalBytes: 128 * 1024 * 1024, pointerBytes: 64 * 1024,
  releaseBytes: 512 * 1024, catalogRows: 100000, outputBytes: 64 * 1024, readTimeoutMs: 15000, totalElapsedMs: 60000 });
export type ShopifyCanonicalPolicyCaptureInput = {
  storage: RemoteSnapshotStorage; encryptionKey: string; readRelease: () => Promise<Row>;
  expectedLiveCommit: string; producerCommit: string; producerRunId: string;
  expectedSnapshotId: string; expectedPointerSha256: string; manifestBytes: Bytes; bindings: Row[];
  dependencyBytes: Record<keyof typeof CANONICAL_POLICY_DEPENDENCY_FILES, Bytes>;
  now?: () => number; budgets?: Partial<Record<keyof typeof CANONICAL_POLICY_CAPTURE_LIMITS, number>>;
};
const classification = (classificationModule as any).default || classificationModule;
const { createRemoteSiteSnapshotReader } = (snapshotModule as any).default || snapshotModule;
const sha = (bytes: string | Uint8Array) => createHash('sha256').update(bytes).digest('hex');
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const json = (value: any) => JSON.stringify(canonical(value));
const bytesLength = (value: unknown) => typeof value === 'string' ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.byteLength : Infinity;
const buffer = (value: Bytes) => typeof value === 'string' ? Buffer.from(value) : Buffer.from(value);
const hashText = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const text = (value: unknown, max = 180) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const closed = (value: unknown, keys: string[]): value is Row => !!value && typeof value === 'object' && !Array.isArray(value) && Object.keys(value).every(key => keys.includes(key));
const eligible = (value: unknown) => typeof value === 'string' && ['limited', 'allocated', 'unicorn'].includes(value);
const snapshot = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/u.test(value);
class CaptureError extends Error { constructor(public code: string) { super(`Canonical policy capture rejected: ${code}`); } }
const fail = (code: string): never => { throw new CaptureError(code); };

/**
 * Read-only, one-shot selected production-policy capture. Required adapters never
 * default to network/environment/storage credentials. Local I/O independently
 * verifies only fixed implementation/manifest paths; caller bytes are not code.
 * The reviewed fixture catalog digest is provenance ONLY. Canonical rows derive
 * exclusively from verified pinned PRODUCTION bottles, not that fixture catalog.
 * SDK responses may be buffered before post-read checks; these are validation
 * caps/deadlines, not streaming network/SQL byte or cancellation guarantees.
 */
export async function captureShopifyCanonicalPolicy(input: ShopifyCanonicalPolicyCaptureInput) {
  const { storage, encryptionKey, readRelease, expectedLiveCommit, producerCommit, producerRunId,
    expectedSnapshotId, expectedPointerSha256, manifestBytes, bindings, dependencyBytes, now = Date.now } = input;
  const limitKeys = Object.keys(CANONICAL_POLICY_CAPTURE_LIMITS);
  if (input.budgets !== undefined && !closed(input.budgets, limitKeys)) fail('budget_invalid');
  const limits: Row = Object.fromEntries(Object.entries(CANONICAL_POLICY_CAPTURE_LIMITS)
    .map(([key, value]) => [key, input.budgets?.[key as keyof typeof CANONICAL_POLICY_CAPTURE_LIMITS] ?? value]));
  for (const [key, max] of Object.entries(CANONICAL_POLICY_CAPTURE_LIMITS)) if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > max) fail('budget_invalid');
  if (!storage || typeof storage.readPointer !== 'function' || typeof storage.readObject !== 'function' || typeof readRelease !== 'function'
    || typeof now !== 'function' || !/^[a-f0-9]{40}$/u.test(expectedLiveCommit) || producerCommit !== expectedLiveCommit
    || !/^[1-9]\d{0,19}$/u.test(producerRunId) || !snapshot(expectedSnapshotId) || !hashText(expectedPointerSha256)
    || !Array.isArray(bindings) || bindings.length !== 5 || bytesLength(manifestBytes) > 256 * 1024
    || !dependencyBytes || Object.keys(dependencyBytes).length !== 7) fail('input_identity_or_adapters_invalid');
  let manifest: Row; let bindingFileSha256 = ''; const dependencyHashes: Row = {};
  try {
    const supplied = buffer(manifestBytes), actual = await readFile(new URL('../../engine/data/shopify-pickup-next-five-review-20261023.json', import.meta.url));
    if (!supplied.equals(actual)) fail('source_manifest_bytes_mismatch');
    manifest = JSON.parse(supplied.toString('utf8'));
    const fixedBindings = await readFile(new URL('../../engine/data/shopify-next-five-policy-bindings-20261024.json', import.meta.url));
    const reviewedBindings = JSON.parse(fixedBindings.toString('utf8'));
    if (fixedBindings.length > 64 * 1024 || reviewedBindings.schemaVersion !== 1
      || reviewedBindings.scope !== 'read_only_policy_capture_bindings_no_admission_or_activation'
      || json(reviewedBindings.bindings) !== json(bindings)) fail('reviewed_binding_file_mismatch');
    bindingFileSha256 = sha(fixedBindings);
    for (const [key, file] of Object.entries(CANONICAL_POLICY_DEPENDENCY_FILES)) {
      if (bytesLength(dependencyBytes[key as keyof typeof dependencyBytes]) > 2 * 1024 * 1024) fail('dependency_byte_limit');
      const suppliedBytes = buffer(dependencyBytes[key as keyof typeof dependencyBytes]), actualBytes = await readFile(new URL(`../../${file}`, import.meta.url));
      if (!suppliedBytes.equals(actualBytes)) fail('dependency_bytes_mismatch');
      dependencyHashes[key] = sha(suppliedBytes);
    }
  } catch (error) { if (error instanceof CaptureError) throw error; fail('fixed_local_dependency_unavailable_or_invalid'); }
  if (manifest!.collectorSha256 !== dependencyHashes.collector || manifest!.premisesIdentitySha256 !== dependencyHashes.premisesIdentity
    || manifest!.safeMatcherSha256 !== dependencyHashes.safeMatcher || manifest!.catalogSha256 !== dependencyHashes.catalog
    || manifest!.classificationSha256 !== dependencyHashes.classification) fail('source_manifest_dependency_pin_mismatch');
  const configured = new Map<string, Row>();
  try {
    if (!Array.isArray(manifest!.sources) || manifest!.sources.length !== 5) fail('selection_count_invalid');
    for (const raw of manifest!.sources) {
      const source = validateShopifyVariantSource(raw), plan = describeShopifyVariantSource(source, { collectorSha256: dependencyHashes.collector });
      if (source.stores.length !== 1 || source.products.length !== 1 || configured.has(source.runtimeId)) fail('selection_scope_invalid');
      configured.set(source.runtimeId, { source, configSha256: plan.configSha256 });
    }
    const sourceIds = new Set(), ids = new Set(), names = new Set();
    for (const binding of bindings) {
      if (!closed(binding, ['sourceId', 'configSha256', 'state', 'storeId', 'productId', 'variantId', 'canonicalId', 'canonicalName'])) fail('binding_shape_invalid');
      const entry = configured.get(binding.sourceId);
      if (!entry || sourceIds.has(binding.sourceId) || binding.configSha256 !== entry.configSha256 || binding.state !== entry.source.state
        || binding.storeId !== entry.source.stores[0].id || binding.productId !== entry.source.products[0].productId || binding.variantId !== entry.source.products[0].variantId
        || binding.canonicalName !== entry.source.products[0].canonicalName || !text(binding.canonicalId) || !/^bb_[a-f0-9]{16}$/u.test(binding.canonicalId)) fail('binding_scope_mismatch');
      sourceIds.add(binding.sourceId); ids.add(binding.canonicalId); names.add(binding.canonicalName);
    }
    if (ids.size !== 4 || names.size !== 4) fail('canonical_selection_invalid');
  } catch (error) { if (error instanceof CaptureError) throw error; fail('source_configuration_invalid'); }
  const started = Date.now(), accounting = { immutableReads: 0, pointerReads: 0, releaseReads: 0, immutableBytes: 0, declaredPlaintextBytes: 0, elapsedMs: 0 };
  const bounded = async <T,>(action: () => Promise<T>): Promise<T> => {
    const timeout = Math.min(limits.readTimeoutMs, limits.totalElapsedMs - (Date.now() - started));
    if (timeout <= 0) fail('capture_time_limit');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([Promise.resolve().then(action), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CaptureError('read_timeout')), timeout); })]); }
    catch (error) { if (error instanceof CaptureError) throw error; fail('adapter_read_failed'); }
    finally { clearTimeout(timer); }
  };
  const pointer = async () => {
    if (++accounting.pointerReads > limits.pointerReads) fail('pointer_read_limit');
    const value = await bounded(() => storage.readPointer());
    let encoded: string;
    try { encoded = json(value); } catch { fail('pointer_invalid'); }
    if (Buffer.byteLength(encoded!) > limits.pointerBytes || !value || value.active !== expectedSnapshotId) fail('pointer_identity_mismatch');
    if (sha(encoded!) !== expectedPointerSha256) fail('pointer_hash_mismatch');
    return JSON.parse(encoded!);
  };
  const release = async () => {
    if (++accounting.releaseReads > limits.releaseReads) fail('release_read_limit');
    const value = await bounded(readRelease);
    let encoded: string;
    try { encoded = json(value); } catch { fail('release_invalid'); }
    if (Buffer.byteLength(encoded!) > limits.releaseBytes || value?.release?.status !== 'healthy' || value.release.commit !== expectedLiveCommit
      || value?.engine?.snapshotId !== expectedSnapshotId) fail('release_identity_unhealthy_or_changed');
    return sha(encoded!);
  };
  const beforePointer = await pointer(), beforeReleaseSha256 = await release();
  const prefix = `engine/snapshots/${expectedSnapshotId}/`, manifestKey = `${prefix}manifest.json`;
  const encrypted = new Map<string, { sha256: string; bytes: number }>();
  const readObject = async (key: string, maxBytes: number) => {
    if (++accounting.immutableReads > limits.immutableReads) fail('immutable_read_limit');
    const raw = await bounded(() => storage.readObject(key));
    if (typeof raw !== 'string' || !raw) fail('immutable_object_missing');
    const bytes = Buffer.byteLength(raw!); accounting.immutableBytes += bytes;
    if (bytes > maxBytes || accounting.immutableBytes > limits.immutableTotalBytes) fail('immutable_byte_limit');
    return raw!;
  };
  const manifestRaw = await readObject(manifestKey, limits.manifestBytes);
  let remoteManifest: Row;
  try { remoteManifest = JSON.parse(manifestRaw); } catch { fail('snapshot_manifest_invalid'); }
  if (!remoteManifest!.files || remoteManifest!.snapshotId !== expectedSnapshotId || !text(remoteManifest!.generatedAt)) fail('snapshot_manifest_invalid');
  let declared = 0;
  for (const name of CANONICAL_POLICY_EXPORTS) {
    const descriptor = remoteManifest!.files[`${name}.json`];
    if (!descriptor || descriptor.path !== `${name}.json` || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
      || descriptor.bytes > limits.plaintextObjectBytes || !hashText(descriptor.sha256)) fail('export_descriptor_invalid_or_oversized');
    declared += descriptor.bytes;
  }
  if (declared > limits.plaintextTotalBytes) fail('plaintext_total_limit');
  accounting.declaredPlaintextBytes = declared;
  const reader = createRemoteSiteSnapshotReader({ encryptionKey, storage: {
    readPointer: async () => structuredClone(beforePointer),
    readObject: async key => {
      if (key === manifestKey) return manifestRaw; // One immutable manifest read.
      if (!CANONICAL_POLICY_EXPORTS.some(name => key === `${prefix}files/${name}.json.enc`)) fail('immutable_key_not_allowed');
      if (encrypted.has(key)) fail('duplicate_encrypted_read');
      const raw = await readObject(key, limits.encryptedObjectBytes);
      encrypted.set(key, { sha256: sha(raw), bytes: Buffer.byteLength(raw) });
      return raw;
    },
  } });
  const results = new Map<string, Row>();
  for (const name of CANONICAL_POLICY_EXPORTS) {
    let result: Row;
    try { result = await bounded(() => reader.read(name)); } catch (error) { if (error instanceof CaptureError) throw error; fail('verified_snapshot_read_failed'); }
    const age = now() - Date.parse(result!.generatedAt || '');
    if (result!.source !== 'remote' || result!.snapshotId !== expectedSnapshotId || !Number.isFinite(age) || age < 0 || age > 7 * 86400000
      || !result!.payload || typeof result!.payload !== 'object' || Array.isArray(result!.payload)
      || result!.payload.quarantine || result!.payload.bootstrap || result!.payload.manualRefresh) fail('policy_snapshot_unavailable');
    if (result!.generatedAt !== remoteManifest!.generatedAt || (result!.payload.generatedAt !== undefined && result!.payload.generatedAt !== result!.generatedAt)) fail('export_clock_mismatch');
    results.set(name, result!);
  }
  const payloads = [...results.values()].map(result => result.payload);
  for (const field of ['runId', 'engineGeneratedAt']) if (payloads.some(payload => payload[field] !== undefined)
    && (payloads.some(payload => !text(payload[field])) || new Set(payloads.map(payload => payload[field])).size !== 1)) fail('export_run_clock_mismatch');
  const states = results.get('state-health')!.payload.states;
  if (!Array.isArray(states) || states.length > 64) fail('state_policy_schema_invalid');
  for (const state of new Set(bindings.map(binding => binding.state))) {
    const rows = states.filter((row: Row) => row?.state === state);
    if (rows.length !== 1 || !['healthy', 'degraded'].includes(rows[0].health)) fail('selected_state_policy_missing_or_blocked');
  }
  const bottles = results.get('bottles')!.payload.bottles;
  if (!Array.isArray(bottles) || bottles.length < 4 || bottles.length > limits.catalogRows) fail('catalog_shape_or_count_invalid');
  const selected = new Map<string, Row>();
  for (const binding of bindings) {
    if (selected.has(binding.canonicalId)) continue;
    const rows = bottles.filter((row: Row) => row?.canonical_id === binding.canonicalId || row?.id === binding.canonicalId);
    if (rows.length !== 1) fail('selected_canonical_missing_or_duplicate');
    const row = rows[0], name = row.canonical_name ?? row.name;
    if (name !== binding.canonicalName || (row.name !== undefined && row.name !== name) || (row.canonical_name !== undefined && row.canonical_name !== name)
      || (row.id !== undefined && row.id !== binding.canonicalId) || (row.canonical_id !== undefined && row.canonical_id !== binding.canonicalId)
      || !eligible(row.tier) || bottles.filter((item: Row) => (item?.canonical_name ?? item?.name) === name).length !== 1) fail('selected_canonical_identity_or_tier_changed');
    selected.set(binding.canonicalId, { canonicalId: binding.canonicalId, canonicalName: name, canonicalTier: row.tier });
  }
  let index: any;
  try {
    const artifact = JSON.parse(buffer(dependencyBytes.classification).toString('utf8'));
    index = classification.getDropClassificationIndex(artifact.records);
  } catch { fail('classification_artifact_invalid'); }
  const publicBindings = bindings.map(binding => {
    const row = selected.get(binding.canonicalId)!;
    const market = classification.resolveDropClassification({ state: binding.state, canonical_id: row.canonicalId, canonical_name: row.canonicalName, tier: row.canonicalTier }, index);
    if (!eligible(market.tier) || market.source === 'signal') fail('selected_market_policy_unavailable_or_ineligible');
    return { sourceId: binding.sourceId, configSha256: binding.configSha256, state: binding.state, storeId: binding.storeId,
      productId: binding.productId, variantId: binding.variantId, canonicalId: binding.canonicalId, marketTier: market.tier };
  });
  await pointer(); const afterReleaseSha256 = await release();
  accounting.elapsedMs = Date.now() - started;
  if (accounting.elapsedMs > limits.totalElapsedMs) fail('capture_time_limit');
  const capturedAt = now();
  if (!Number.isFinite(capturedAt) || !Number.isFinite(new Date(capturedAt).getTime())) fail('capture_clock_invalid');
  const output = { contractVersion: 'bourbon-signal/selected-canonical-policy@1', capturedAt: new Date(capturedAt).toISOString(),
    expectedProductionCommit: expectedLiveCommit, producerCommit, producerRunId, activeSnapshotId: expectedSnapshotId,
    activePointerSha256: expectedPointerSha256, generatedAt: results.get('bottles')!.generatedAt,
    canonicalRows: [...selected.values()], bindings: publicBindings,
    provenance: { sourceManifestSha256: sha(buffer(manifestBytes)), reviewedBindingFileSha256: bindingFileSha256, manifestSha256: sha(manifestRaw),
      exports: CANONICAL_POLICY_EXPORTS.map(name => ({ name, descriptorBytes: remoteManifest!.files[`${name}.json`].bytes,
        plaintextSha256: remoteManifest!.files[`${name}.json`].sha256, encryptedObjectSha256: encrypted.get(`${prefix}files/${name}.json.enc`)!.sha256,
        encryptedObjectBytes: encrypted.get(`${prefix}files/${name}.json.enc`)!.bytes })),
      collectorSha256: dependencyHashes.collector, premisesIdentitySha256: dependencyHashes.premisesIdentity, safeMatcherSha256: dependencyHashes.safeMatcher,
      reviewedFixtureCatalogSha256: dependencyHashes.catalog, classificationArtifactSha256: dependencyHashes.classification,
      classificationImplementationSha256: dependencyHashes.classificationImplementation, sourcePolicyImplementationSha256: dependencyHashes.sourcePolicyImplementation,
      beforeReleaseSha256, afterReleaseSha256, dependencyScope: 'listed_files_only_not_exhaustive_transitive_hashes' },
    accounting, limits,
    caveats: ['Canonical rows derive from the verified production bottles export; reviewed fixture catalog bytes are dependency provenance only.',
      'Storage SDKs may buffer before post-read validation; timeout does not guarantee cancellation of the underlying SDK request.',
      'No admissions, source activation, inventory refresh, shelf stock or completed scheduled observation is established.'] };
  if (Buffer.byteLength(JSON.stringify(output)) > limits.outputBytes) fail('output_byte_limit');
  return output;
}
