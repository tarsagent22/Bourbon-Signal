import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

export const SITE_SNAPSHOT_CONTRACT_VERSION = 'bourbon-signal-file-snapshot-v1';

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]));
  }
  return value;
}

export function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

export function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function normalizePath(value) {
  const normalized = String(value || '').replaceAll('\\', '/').replace(/^\/+/, '');
  if (!normalized || normalized.includes('..') || !normalized.endsWith('.json')) throw new Error(`Invalid snapshot file path: ${value}`);
  return normalized;
}

function decodeEncryptionKey(value) {
  if (!value) throw new Error('ENGINE_SNAPSHOT_ENCRYPTION_KEY is required');
  const key = Buffer.from(value, 'base64url');
  if (key.length !== 32) throw new Error('ENGINE_SNAPSHOT_ENCRYPTION_KEY must decode to 32 bytes');
  return key;
}

export function encryptSnapshotObject(plaintext, encryptionKey) {
  const key = decodeEncryptionKey(encryptionKey);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return JSON.stringify({
    contractVersion: 'bourbon-signal-encrypted-object-v1',
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64url'),
    tag: cipher.getAuthTag().toString('base64url'),
    ciphertext: ciphertext.toString('base64url'),
  });
}

export function decryptSnapshotObject(serialized, encryptionKey) {
  const key = decodeEncryptionKey(encryptionKey);
  const payload = JSON.parse(serialized);
  if (payload?.contractVersion !== 'bourbon-signal-encrypted-object-v1' || payload.algorithm !== 'aes-256-gcm') {
    throw new Error('Unsupported encrypted snapshot object');
  }
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(payload.iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(payload.tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function createSiteSnapshotManifest(files, metadata) {
  if (!metadata || !Number.isFinite(Date.parse(metadata.generatedAt))) throw new Error('Invalid snapshot generatedAt');
  for (const field of ['appCommit', 'engineCommit', 'collectionRunId']) {
    if (!metadata[field]) throw new Error(`Missing snapshot ${field}`);
  }
  const fileManifest = {};
  for (const [rawPath, rawContents] of Object.entries(files || {}).sort(([left], [right]) => left.localeCompare(right))) {
    const filePath = normalizePath(rawPath);
    const contents = String(rawContents);
    fileManifest[filePath] = {
      path: filePath,
      bytes: Buffer.byteLength(contents),
      sha256: sha256(contents),
    };
  }
  if (!Object.keys(fileManifest).length) throw new Error('Snapshot contains no files');
  const unsigned = {
    contractVersion: SITE_SNAPSHOT_CONTRACT_VERSION,
    generatedAt: metadata.generatedAt,
    appCommit: String(metadata.appCommit),
    engineCommit: String(metadata.engineCommit),
    collectionRunId: String(metadata.collectionRunId),
    stateHealth: metadata.stateHealth || {},
    files: fileManifest,
  };
  const manifestHash = sha256(canonicalJson(unsigned));
  const timestamp = metadata.generatedAt.replace(/[:.]/g, '-');
  return Object.freeze({ ...unsigned, snapshotId: `${timestamp}-${manifestHash.slice(0, 16)}`, manifestHash });
}

export function verifySiteSnapshotManifest(manifest, files) {
  try {
    if (manifest?.contractVersion !== SITE_SNAPSHOT_CONTRACT_VERSION) return { ok: false, reason: 'unsupported_contract_version' };
    const { snapshotId, manifestHash, ...unsigned } = manifest;
    if (sha256(canonicalJson(unsigned)) !== manifestHash) return { ok: false, reason: 'manifest_hash_mismatch' };
    if (!String(snapshotId || '').endsWith(manifestHash.slice(0, 16))) return { ok: false, reason: 'snapshot_identity_mismatch' };
    const supplied = Object.fromEntries(Object.entries(files || {}).map(([key, value]) => [normalizePath(key), String(value)]));
    const expectedPaths = Object.keys(manifest.files || {}).sort();
    if (expectedPaths.length !== Object.keys(supplied).length) return { ok: false, reason: 'file_count_mismatch' };
    for (const filePath of expectedPaths) {
      const contents = supplied[filePath];
      const expected = manifest.files[filePath];
      if (contents === undefined) return { ok: false, reason: `missing_file:${filePath}` };
      if (Buffer.byteLength(contents) !== expected.bytes || sha256(contents) !== expected.sha256) return { ok: false, reason: `file_hash_mismatch:${filePath}` };
    }
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: error instanceof Error ? error.message : 'invalid_manifest' };
  }
}
