#!/usr/bin/env node
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { verifySiteSnapshotManifest } from './site-snapshot-contract.mjs';
import { VercelBlobObjectStorage } from './vercel-blob-object-storage.mjs';
import {
  publishSiteSnapshot,
  readPublishedManifest,
  readPublishedSiteFile,
  rollbackSiteSnapshot,
  siteSnapshotObjectKeys,
} from './site-snapshot-publisher.mjs';

export async function repackActiveSiteSnapshot(storage, encryptionKey, options = {}) {
  if (!encryptionKey) throw new Error('ENGINE_SNAPSHOT_ENCRYPTION_KEY is required');
  const before = await storage.readPointer();
  if (!before?.active) throw new Error('No active production snapshot');
  if (options.expectedSourceSnapshotId && before.active !== options.expectedSourceSnapshotId) {
    throw new Error(`Active source snapshot changed before activation: expected ${options.expectedSourceSnapshotId}, found ${before.active}`);
  }
  const manifest = await readPublishedManifest(storage, before.active);
  const files = {};
  for (const filePath of Object.keys(manifest.files).sort()) {
    files[filePath] = await readPublishedSiteFile(storage, filePath, {
      encryptionKey,
      snapshotId: before.active,
    });
  }
  const sourceVerified = verifySiteSnapshotManifest(manifest, files);
  if (!sourceVerified.ok) throw new Error(`Active source manifest verification failed: ${sourceVerified.reason}`);
  const metadata = {
    generatedAt: manifest.generatedAt,
    appCommit: manifest.appCommit,
    engineCommit: manifest.engineCommit,
    collectionRunId: manifest.collectionRunId,
    stateHealth: manifest.stateHealth || {},
  };
  const staged = await publishSiteSnapshot(storage, files, metadata, {
    encryptionKey,
    activate: false,
  });
  if (staged.manifest.snapshotId === before.active) {
    throw new Error('Active snapshot already uses the current immutable transport identity');
  }
  if (options.expectedCandidateSnapshotId && staged.manifest.snapshotId !== options.expectedCandidateSnapshotId) {
    throw new Error(`Staged snapshot identity changed: expected ${options.expectedCandidateSnapshotId}, found ${staged.manifest.snapshotId}`);
  }
  let totalEncryptedEnvelopeBytes = 0;
  let dropsEnvelopeRaw = null;
  let dropsEnvelope = null;
  for (const filePath of Object.keys(files)) {
    const key = siteSnapshotObjectKeys.encryptedKey(staged.manifest.snapshotId, filePath);
    const envelopeRaw = await storage.readObject(key);
    const envelope = JSON.parse(envelopeRaw || '{}');
    if (envelope.encoding !== 'gzip') throw new Error(`Repacked snapshot object is not gzip encoded: ${filePath}`);
    if (filePath === 'drops.json') {
      dropsEnvelopeRaw = envelopeRaw;
      dropsEnvelope = envelope;
    }
    totalEncryptedEnvelopeBytes += Buffer.byteLength(envelopeRaw);
  }
  if (!dropsEnvelopeRaw || !dropsEnvelope) throw new Error('Repacked snapshot is missing drops.json');
  const summary = {
    oldSnapshotId: before.active,
    newSnapshotId: staged.manifest.snapshotId,
    previousSnapshotId: before.active,
    fileCount: Object.keys(files).length,
    dropsPlaintextBytes: Buffer.byteLength(files['drops.json']),
    dropsEncryptedEnvelopeBytes: Buffer.byteLength(dropsEnvelopeRaw),
    totalEncryptedEnvelopeBytes,
    encoding: dropsEnvelope.encoding,
    generatedAt: manifest.generatedAt,
  };
  if (options.activate === false) return { status: 'staged', ...summary };
  const current = await storage.readPointer();
  if (current?.active !== before.active || current?.revision !== before.revision) {
    throw new Error('Active snapshot changed while the repack was staged');
  }
  const published = await publishSiteSnapshot(storage, files, metadata, {
    encryptionKey,
    activate: true,
    expectedActive: before.active,
  });
  const after = published.pointer;
  return {
    status: published.status,
    ...summary,
    newSnapshotId: after.active,
    previousSnapshotId: after.previous,
    revision: after.revision,
  };
}

export async function rollbackSnapshotIfActive(storage, expectedSnapshotId) {
  if (!expectedSnapshotId) throw new Error('Expected snapshot ID is required for guarded rollback');
  return rollbackSiteSnapshot(storage, { expectedActive: expectedSnapshotId });
}

export async function verifyLiveSnapshotId(expectedSnapshotId, options = {}) {
  if (!expectedSnapshotId) throw new Error('Expected snapshot ID is required');
  const baseUrl = options.baseUrl || 'https://www.bourbonsignal.com';
  const attempts = Number(options.attempts || 8);
  const delayMs = Number(options.delayMs || 5_000);
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const url = new URL('/api/drops', baseUrl);
    url.searchParams.set('limit', '1');
    url.searchParams.set('_repack_verify', `${Date.now()}-${attempt}`);
    const response = await fetch(url, { cache: 'no-store', headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30_000) });
    const payload = response.ok ? await response.json() : {};
    if (response.ok && String(payload.snapshot || '').startsWith(`${expectedSnapshotId}:`)) {
      return { ok: true, snapshot: payload.snapshot, generatedAt: payload.generatedAt, total: payload.total };
    }
    if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
  throw new Error(`Production did not observe expected snapshot ${expectedSnapshotId}`);
}

const invokedPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === invokedPath) {
  if (process.argv[2] === '--verify-live') {
    verifyLiveSnapshotId(process.argv[3])
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exit(1); });
  } else {
    if (!process.env.BLOB_READ_WRITE_TOKEN) throw new Error('BLOB_READ_WRITE_TOKEN is required');
    const storage = new VercelBlobObjectStorage();
    const operation = process.argv[2] === '--rollback-if-active'
      ? rollbackSnapshotIfActive(storage, process.argv[3])
      : repackActiveSiteSnapshot(storage, process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY, process.argv[2] === '--activate-staged'
        ? { activate: true, expectedSourceSnapshotId: process.argv[3], expectedCandidateSnapshotId: process.argv[4] }
        : { activate: process.argv[2] !== '--stage' });
    operation
      .then((result) => console.log(JSON.stringify(result)))
      .catch((error) => { console.error(JSON.stringify({ ok: false, error: error.message })); process.exit(1); });
  }
}
