import { createHash } from 'node:crypto';

export const SNAPSHOT_CONTRACT_VERSION = 'bourbon-signal-snapshot-v1';

function sortForCanonicalJson(value) {
  if (Array.isArray(value)) return value.map(sortForCanonicalJson);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, sortForCanonicalJson(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(sortForCanonicalJson(value));
}

export function snapshotHash(unsignedSnapshot) {
  return createHash('sha256').update(canonicalJson(unsignedSnapshot)).digest('hex');
}

function validIso(value) {
  return typeof value === 'string' && Number.isFinite(Date.parse(value));
}

function validateUnsigned(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return 'invalid_snapshot';
  if (input.contractVersion !== SNAPSHOT_CONTRACT_VERSION) return 'unsupported_contract_version';
  if (!validIso(input.generatedAt)) return 'invalid_generated_at';
  if (!input.provenance || typeof input.provenance !== 'object') return 'missing_provenance';
  for (const key of ['engineVersion', 'gitSha', 'runId']) {
    if (typeof input.provenance[key] !== 'string' || !input.provenance[key]) return `invalid_provenance_${key}`;
  }
  if (!Array.isArray(input.provenance.sources)) return 'invalid_provenance_sources';
  if (!input.stateHealth || typeof input.stateHealth !== 'object' || Array.isArray(input.stateHealth)) return 'invalid_state_health';
  if (!input.data || typeof input.data !== 'object' || Array.isArray(input.data)) return 'invalid_data';
  return null;
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  Object.freeze(value);
  for (const child of Object.values(value)) deepFreeze(child);
  return value;
}

export function createSnapshot(input) {
  const unsigned = structuredClone({
    contractVersion: SNAPSHOT_CONTRACT_VERSION,
    generatedAt: input.generatedAt,
    provenance: input.provenance,
    stateHealth: input.stateHealth,
    data: input.data,
  });
  const validationError = validateUnsigned(unsigned);
  if (validationError) throw new Error(`Invalid snapshot: ${validationError}`);
  const hash = snapshotHash(unsigned);
  return deepFreeze({ ...unsigned, snapshotId: hash, hash });
}

export function verifySnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object') return { ok: false, reason: 'invalid_snapshot' };
  const { hash, snapshotId, ...unsigned } = snapshot;
  const validationError = validateUnsigned(unsigned);
  if (validationError) return { ok: false, reason: validationError };
  if (typeof hash !== 'string' || snapshotId !== hash) return { ok: false, reason: 'invalid_identity' };
  if (snapshotHash(unsigned) !== hash) return { ok: false, reason: 'hash_mismatch' };
  return { ok: true };
}
