import { createHash } from 'node:crypto';
import { open } from 'node:fs/promises';
import type { RemoteSnapshotStorage } from '../../src/lib/remote-site-snapshot.ts';
import * as snapshotModule from '../../src/lib/remote-site-snapshot.ts';
import * as classificationModule from '../../src/lib/drop-classification.ts';

type Row = Record<string, any>;
type Bytes = string | Uint8Array;
export const CANONICAL_CONTEXT_DEPENDENCY_FILES = Object.freeze({ classification: 'src/data/drop-feed-classification.generated.json',
  classificationImplementation: 'src/lib/drop-classification.ts' });
export const CANONICAL_CONTEXT_SELECTION = Object.freeze([
  Object.freeze({ canonicalId: 'bb_be6a0afd4ba5f963', canonicalName: 'Elijah Craig Barrel Proof' }),
  Object.freeze({ canonicalId: 'bb_d0fe561ac45db2d5', canonicalName: 'Eagle Rare 10 Year' }),
  Object.freeze({ canonicalId: 'bb_1fd1f694742e0a1e', canonicalName: 'Weller Single Barrel' }),
  Object.freeze({ canonicalId: 'bb_8b9546b93a7fbe72', canonicalName: "Booker's Bourbon" }),
]);
export const CANONICAL_CONTEXT_STATE_PAIRS = Object.freeze([
  Object.freeze({ state: 'CA', canonicalId: 'bb_be6a0afd4ba5f963' }),
  Object.freeze({ state: 'CA', canonicalId: 'bb_d0fe561ac45db2d5' }),
  Object.freeze({ state: 'FL', canonicalId: 'bb_d0fe561ac45db2d5' }),
  Object.freeze({ state: 'NY', canonicalId: 'bb_1fd1f694742e0a1e' }),
  Object.freeze({ state: 'TX', canonicalId: 'bb_8b9546b93a7fbe72' }),
]);
export const CANONICAL_CONTEXT_CAPTURE_LIMITS = Object.freeze({ immutableReads: 4, pointerReads: 2, releaseReads: 2,
  manifestBytes: 2 * 1024 * 1024, plaintextObjectBytes: 64 * 1024 * 1024, plaintextTotalBytes: 96 * 1024 * 1024,
  encryptedObjectBytes: 88 * 1024 * 1024, immutableTotalBytes: 128 * 1024 * 1024, pointerBytes: 64 * 1024,
  releaseBytes: 512 * 1024, bottleRows: 100000, outputBytes: 64 * 1024, readTimeoutMs: 15000, totalElapsedMs: 60000 });
export type ShopifyCanonicalContextCaptureInput = {
  storage: RemoteSnapshotStorage; encryptionKey: string; readRelease: () => Promise<Row>;
  expectedLiveCommit: string; producerCommit: string; producerRunId: string;
  expectedSnapshotId: string; expectedPointerSha256: string;
  dependencyBytes: Record<keyof typeof CANONICAL_CONTEXT_DEPENDENCY_FILES, Bytes>;
  now?: () => number; budgets?: Partial<Record<keyof typeof CANONICAL_CONTEXT_CAPTURE_LIMITS, number>>;
};
const { createRemoteSiteSnapshotReader } = (snapshotModule as any).default || snapshotModule;
const classification = (classificationModule as any).default || classificationModule;
const hash = (value: string | Uint8Array) => createHash('sha256').update(value).digest('hex');
const sorted = (value: any): any => Array.isArray(value) ? value.map(sorted) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, sorted(value[key])])) : value;
const json = (value: any) => JSON.stringify(sorted(value));
const size = (value: unknown) => typeof value === 'string' ? Buffer.byteLength(value) : value instanceof Uint8Array ? value.byteLength : Infinity;
const buffer = (value: Bytes) => Buffer.from(value);
const isHash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/u.test(value);
const text = (value: unknown, max = 180) => typeof value === 'string' && value.length > 0 && value.length <= max && !/[\u0000-\u001f\u007f]/u.test(value);
const object = (value: unknown): value is Row => !!value && typeof value === 'object' && !Array.isArray(value);
const closed = (value: unknown, keys: string[]): value is Row => object(value) && Object.keys(value).every(key => keys.includes(key));
const eligible = (tier: unknown) => typeof tier === 'string' && ['limited', 'allocated', 'unicorn'].includes(tier);
const snapshotId = (value: unknown) => typeof value === 'string' && /^[A-Za-z0-9_-]{1,180}$/u.test(value);
const utc = (value: unknown) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) return NaN;
  const at = Date.parse(value); return Number.isFinite(at) && new Date(at).toISOString() === value ? at : NaN;
};
export class CanonicalContextCaptureError extends Error {
  constructor(public code: string) { super(`Canonical context capture rejected: ${code}`); }
}
const fail = (code: string): never => { throw new CanonicalContextCaptureError(code); };
async function fixed(file: string) {
  const handle = await open(new URL(`../../${file}`, import.meta.url), 'r');
  try {
    const stat = await handle.stat(); if (!stat.isFile() || stat.size < 1 || stat.size > 2 * 1024 * 1024) fail('fixed_dependency_byte_limit');
    const bytes = Buffer.alloc(stat.size + 1), read = await handle.read(bytes, 0, bytes.length, 0);
    if (read.bytesRead !== stat.size) fail('fixed_dependency_changed'); return bytes.subarray(0, read.bytesRead);
  } finally { await handle.close(); }
}

/**
 * One read-only production canonical context, with required injected adapters.
 * Only fixed local classification data/implementation files are read. Selection
 * is four public identities and five state/identity pairs, never merchant tuples.
 * No planned connector code, configuration, fixture Bible or source scheduler is
 * imported/read. Raw aliases, alerts and unselected records never leave the gate.
 * No default network/environment/credential access, collection, DB or app writes.
 * Storage SDKs may buffer/retry/redirect before post-read checks. Logical budgets
 * and timeouts are not streaming/provider-request or cancellation guarantees.
 */
export async function captureShopifyCanonicalContext(input: ShopifyCanonicalContextCaptureInput) {
  if (!object(input)) fail('input_invalid');
  const { storage, encryptionKey, readRelease, expectedLiveCommit, producerCommit, producerRunId,
    expectedSnapshotId, expectedPointerSha256, dependencyBytes, now = Date.now } = input;
  const limitKeys = Object.keys(CANONICAL_CONTEXT_CAPTURE_LIMITS);
  if (input.budgets !== undefined && !closed(input.budgets, limitKeys)) fail('budget_invalid');
  const limits: Row = Object.fromEntries(Object.entries(CANONICAL_CONTEXT_CAPTURE_LIMITS)
    .map(([key, value]) => [key, input.budgets?.[key as keyof typeof CANONICAL_CONTEXT_CAPTURE_LIMITS] ?? value]));
  for (const [key, max] of Object.entries(CANONICAL_CONTEXT_CAPTURE_LIMITS)) if (!Number.isSafeInteger(limits[key]) || limits[key] < 1 || limits[key] > max) fail('budget_invalid');
  if (!storage || typeof storage.readPointer !== 'function' || typeof storage.readObject !== 'function' || typeof readRelease !== 'function'
    || typeof now !== 'function' || typeof encryptionKey !== 'string' || !/^[a-f0-9]{40}$/u.test(expectedLiveCommit) || producerCommit !== expectedLiveCommit
    || !/^[1-9]\d{0,19}$/u.test(producerRunId) || !snapshotId(expectedSnapshotId) || !isHash(expectedPointerSha256)
    || !closed(dependencyBytes, Object.keys(CANONICAL_CONTEXT_DEPENDENCY_FILES)) || Object.keys(dependencyBytes).length !== 2) fail('input_identity_or_adapters_invalid');
  const readClock = () => {
    try { const value = now(); if (!Number.isFinite(value) || !Number.isFinite(new Date(value).getTime())) fail('capture_clock_invalid'); return value; }
    catch (error) { if (error instanceof CanonicalContextCaptureError) throw error; fail('capture_clock_invalid'); }
  };
  readClock(); // Reject invalid injected clocks before any remote adapter call.
  const dependencyHashes: Row = {}; let classificationBytes: Buffer;
  try {
    for (const [key, file] of Object.entries(CANONICAL_CONTEXT_DEPENDENCY_FILES)) {
      if (size(dependencyBytes[key as keyof typeof dependencyBytes]) > 2 * 1024 * 1024) fail('dependency_byte_limit');
      const supplied = buffer(dependencyBytes[key as keyof typeof dependencyBytes]), actual = await fixed(file);
      if (!supplied.equals(actual)) fail('dependency_bytes_mismatch');
      dependencyHashes[key] = hash(actual);
      if (key === 'classification') classificationBytes = actual;
    }
  } catch (error) { if (error instanceof CanonicalContextCaptureError) throw error; fail('fixed_classification_dependency_unavailable'); }
  let index: any;
  try {
    const artifact = JSON.parse(classificationBytes!.toString('utf8'));
    if (!Array.isArray(artifact.records)) fail('classification_artifact_invalid');
    index = classification.getDropClassificationIndex(artifact.records);
  } catch (error) { if (error instanceof CanonicalContextCaptureError) throw error; fail('classification_artifact_invalid'); }
  const started = Date.now(), accounting = { immutableReads: 0, pointerReads: 0, releaseReads: 0, immutableBytes: 0, declaredPlaintextBytes: 0, elapsedMs: 0 };
  const bounded = async <T,>(action: () => Promise<T>): Promise<T> => {
    const timeout = Math.min(limits.readTimeoutMs, limits.totalElapsedMs - (Date.now() - started));
    if (timeout <= 0) fail('capture_time_limit');
    let timer: ReturnType<typeof setTimeout> | undefined;
    try { return await Promise.race([Promise.resolve().then(action), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new CanonicalContextCaptureError('read_timeout')), timeout); })]); }
    catch (error) { if (error instanceof CanonicalContextCaptureError) throw error; fail('adapter_read_failed'); }
    finally { clearTimeout(timer); }
  };
  const pointer = async () => {
    if (++accounting.pointerReads > limits.pointerReads) fail('pointer_read_limit');
    const value = await bounded(() => storage.readPointer()); let encoded: string;
    try { encoded = json(value); } catch { fail('pointer_invalid'); }
    if (!encoded! || Buffer.byteLength(encoded!) > limits.pointerBytes || !value || value.active !== expectedSnapshotId) fail('pointer_identity_mismatch');
    if (hash(encoded!) !== expectedPointerSha256) fail('pointer_hash_mismatch'); return JSON.parse(encoded!);
  };
  const release = async () => {
    if (++accounting.releaseReads > limits.releaseReads) fail('release_read_limit');
    const value = await bounded(readRelease); let encoded: string;
    try { encoded = json(value); } catch { fail('release_invalid'); }
    if (!encoded! || Buffer.byteLength(encoded!) > limits.releaseBytes || value?.release?.status !== 'healthy' || value.release.commit !== expectedLiveCommit
      || value?.engine?.snapshotId !== expectedSnapshotId) fail('release_identity_unhealthy_or_changed'); return hash(encoded!);
  };
  const beforePointer = await pointer(), beforeReleaseSha256 = await release();
  const prefix = `engine/snapshots/${expectedSnapshotId}/`, manifestKey = `${prefix}manifest.json`;
  const encrypted = new Map<string, { sha256: string; bytes: number }>();
  const readObject = async (key: string, cap: number) => {
    if (++accounting.immutableReads > limits.immutableReads) fail('immutable_read_limit');
    const value = await bounded(() => storage.readObject(key));
    if (typeof value !== 'string' || !value) fail('immutable_object_missing');
    const length = Buffer.byteLength(value!); accounting.immutableBytes += length;
    if (length > cap || accounting.immutableBytes > limits.immutableTotalBytes) fail('immutable_byte_limit'); return value!;
  };
  const manifestRaw = await readObject(manifestKey, limits.manifestBytes); let manifest: Row;
  try { manifest = JSON.parse(manifestRaw); } catch { fail('snapshot_manifest_invalid'); }
  if (!object(manifest!.files) || manifest!.snapshotId !== expectedSnapshotId || !Number.isFinite(utc(manifest!.generatedAt))) fail('snapshot_manifest_invalid');
  const exports = ['bottles', 'state-health', 'alerts'] as const; let declared = 0;
  for (const name of exports) {
    const descriptor = manifest!.files[`${name}.json`];
    if (!descriptor || descriptor.path !== `${name}.json` || !Number.isSafeInteger(descriptor.bytes) || descriptor.bytes < 1
      || descriptor.bytes > limits.plaintextObjectBytes || !isHash(descriptor.sha256)) fail('export_descriptor_invalid_or_oversized');
    declared += descriptor.bytes;
  }
  if (declared > limits.plaintextTotalBytes) fail('plaintext_total_limit'); accounting.declaredPlaintextBytes = declared;
  const reader = createRemoteSiteSnapshotReader({ encryptionKey, storage: { readPointer: async () => structuredClone(beforePointer), readObject: async key => {
    if (key === manifestKey) return manifestRaw;
    if (!exports.some(name => key === `${prefix}files/${name}.json.enc`)) fail('immutable_key_not_allowed');
    if (encrypted.has(key)) fail('duplicate_encrypted_read');
    const raw = await readObject(key, limits.encryptedObjectBytes); encrypted.set(key, { sha256: hash(raw), bytes: Buffer.byteLength(raw) }); return raw;
  } } });
  const results = new Map<string, Row>();
  for (const name of exports) {
    let result: Row;
    try { result = await bounded(() => reader.read(name)); } catch (error) { if (error instanceof CanonicalContextCaptureError) throw error; fail('verified_snapshot_read_failed'); }
    const at = readClock(), age = at! - utc(result!.generatedAt);
    if (!Number.isFinite(at) || !Number.isFinite(new Date(at).getTime()) || result!.source !== 'remote' || result!.snapshotId !== expectedSnapshotId
      || !Number.isFinite(age) || age < 0 || age > 7 * 86400000 || !object(result!.payload)
      || result!.payload.quarantine || result!.payload.bootstrap || result!.payload.manualRefresh) fail('policy_snapshot_unavailable');
    if (result!.generatedAt !== manifest!.generatedAt || (result!.payload.generatedAt !== undefined && result!.payload.generatedAt !== result!.generatedAt)) fail('export_clock_mismatch');
    results.set(name, result!);
  }
  const payloads = [...results.values()].map(result => result.payload);
  for (const field of ['runId', 'engineGeneratedAt']) if (payloads.some(payload => payload[field] !== undefined)
    && (payloads.some(payload => !text(payload[field])) || new Set(payloads.map(payload => payload[field])).size !== 1)) fail('export_run_clock_mismatch');
  const states = results.get('state-health')!.payload.states;
  if (!Array.isArray(states) || states.length > 64) fail('state_policy_schema_invalid');
  for (const state of new Set(CANONICAL_CONTEXT_STATE_PAIRS.map(row => row.state))) {
    const rows = states.filter((row: Row) => row?.state === state);
    if (rows.length !== 1 || !['healthy', 'degraded', 'stale_useful'].includes(rows[0].health)) fail('selected_state_policy_missing_or_blocked');
  }
  const bottles = results.get('bottles')!.payload.bottles;
  if (!Array.isArray(bottles) || bottles.length < 4 || bottles.length > limits.bottleRows) fail('bottle_shape_or_count_invalid');
  const canonicalRows = CANONICAL_CONTEXT_SELECTION.map(selection => {
    const rows = bottles.filter((row: Row) => row?.canonical_id === selection.canonicalId || row?.id === selection.canonicalId);
    if (rows.length !== 1) fail('selected_canonical_missing_or_duplicate');
    const row = rows[0], name = row.canonical_name ?? row.name;
    if (name !== selection.canonicalName || (row.name !== undefined && row.name !== name) || (row.canonical_name !== undefined && row.canonical_name !== name)
      || (row.id !== undefined && row.id !== selection.canonicalId) || (row.canonical_id !== undefined && row.canonical_id !== selection.canonicalId)
      || !eligible(row.tier) || bottles.filter((item: Row) => (item?.canonical_name ?? item?.name) === name).length !== 1) fail('selected_canonical_identity_or_tier_changed');
    return { canonicalId: selection.canonicalId, canonicalName: name, canonicalTier: row.tier };
  });
  const stateClassifications = CANONICAL_CONTEXT_STATE_PAIRS.map(pair => {
    const row = canonicalRows.find(row => row.canonicalId === pair.canonicalId)!;
    const market = classification.resolveDropClassification({ state: pair.state, canonical_id: row.canonicalId, canonical_name: row.canonicalName, tier: row.canonicalTier }, index);
    if (!eligible(market.tier) || market.source === 'signal') fail('selected_market_policy_unavailable_or_ineligible');
    return { state: pair.state, canonicalId: pair.canonicalId, marketTier: market.tier, classificationSource: market.source };
  });
  await pointer(); const afterReleaseSha256 = await release();
  accounting.elapsedMs = Date.now() - started;
  if (accounting.elapsedMs > limits.totalElapsedMs) fail('capture_time_limit');
  const capturedAt = readClock()!;
  const finalAge = capturedAt - utc(results.get('bottles')!.generatedAt);
  if (!Number.isFinite(finalAge) || finalAge < 0 || finalAge > 7 * 86400000) fail('capture_clock_invalid');
  const output = { contractVersion: 'bourbon-signal/selected-canonical-context@2', scope: 'read_only_canonical_context_no_inventory_or_admission',
    capturedAt: new Date(capturedAt).toISOString(), expectedProductionCommit: expectedLiveCommit, producerCommit, producerRunId,
    activeSnapshotId: expectedSnapshotId, activePointerSha256: expectedPointerSha256, generatedAt: results.get('bottles')!.generatedAt,
    selectionSha256: hash(json({ canonicalRows: CANONICAL_CONTEXT_SELECTION, statePairs: CANONICAL_CONTEXT_STATE_PAIRS })), canonicalRows, stateClassifications,
    provenance: { manifestSha256: hash(manifestRaw), exports: exports.map(name => ({ name, descriptorBytes: manifest!.files[`${name}.json`].bytes,
      plaintextSha256: manifest!.files[`${name}.json`].sha256, encryptedObjectSha256: encrypted.get(`${prefix}files/${name}.json.enc`)!.sha256,
      encryptedObjectBytes: encrypted.get(`${prefix}files/${name}.json.enc`)!.bytes })), classificationDataSha256: dependencyHashes.classification,
      classificationImplementationSha256: dependencyHashes.classificationImplementation, beforeReleaseSha256, afterReleaseSha256,
      dependencyScope: 'classification_data_and_implementation_only_not_all_transitive_hashes' }, accounting, limits,
    admissions: [], descriptors: [], activated: false, acceptedNewStores: 0, requiresExplicitLeadReview: true,
    caveats: ['Only selected production canonical identities and current state classifications are established; no merchant, premise, product, variant or inventory binding is made. Broad state health may be stale_useful; canonical policy does not establish fresh state inventory.',
      'Storage SDKs may buffer or retry before post-read checks; logical read budgets and timeouts do not guarantee provider request limits or cancellation.',
      'The historical selected-canonical-policy@1 artifact consumer does not accept this @2 contract; explicit offline adaptation and independent lineage review remain required.'] };
  if (Buffer.byteLength(JSON.stringify(output)) > limits.outputBytes) fail('output_byte_limit');
  return output;
}
