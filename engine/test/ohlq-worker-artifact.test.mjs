import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { ohlqArtifactDigest, OHLQ_WORKER_CONTRACT } from '../../scripts/lib/ohlq-worker-handoff.mjs';
import { hydrateOhlqWorkerArtifact, loadOhlqBrowserArtifact, ohlqArtifactFreshEnough } from '../src/ohlq-worker-artifact.mjs';

function envelope(generatedAt) {
  const artifact = {
    generatedAt,
    summary: { okProductCount: 2, inventoryRowCount: 240 },
    products: [{ sku: 'example', ok: true, inventories: [{ AgencyId: '1', I: 'A' }] }],
  };
  return {
    contractVersion: OHLQ_WORKER_CONTRACT,
    generatedAt,
    digest: ohlqArtifactDigest(artifact),
    artifact,
  };
}

test('OHLQ freshness rejects stale and implausibly future-dated local artifacts', () => {
  const nowMs = Date.parse('2026-08-28T12:00:00.000Z');
  const staleAfterMs = 12 * 60 * 60_000;
  assert.equal(ohlqArtifactFreshEnough({ generatedAt: '2026-08-28T11:55:00.000Z' }, staleAfterMs, nowMs), true);
  assert.equal(ohlqArtifactFreshEnough({ generatedAt: '2026-08-27T12:00:00.000Z' }, staleAfterMs, nowMs), false);
  assert.equal(ohlqArtifactFreshEnough({ generatedAt: '2026-08-28T12:10:01.000Z' }, staleAfterMs, nowMs), false);
});

test('OHLQ worker hydration validates and writes the downloaded artifact', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ohlq-worker-artifact-'));
  try {
    const destination = path.join(dir, 'ohlq-availability.json');
    const downloaded = envelope('2026-08-28T11:45:00.000Z');
    const result = await hydrateOhlqWorkerArtifact({
      destination,
      secret: 'x'.repeat(32),
      nowMs: Date.parse('2026-08-28T12:00:00.000Z'),
      fetchImpl: async () => ({ ok: true, text: async () => JSON.stringify(downloaded) }),
    });
    assert.equal(result.generatedAt, downloaded.generatedAt);
    assert.equal(result.digest, downloaded.digest);
    assert.deepEqual(JSON.parse(await readFile(destination, 'utf8')), downloaded.artifact);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('OHLQ loader ignores a local cooldown when worker hydration refreshes the artifact', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ohlq-worker-loader-'));
  try {
    const artifactPath = path.join(dir, 'ohlq-availability.json');
    const cooldownPath = path.join(dir, 'ohlq-cooldown.json');
    const fresh = envelope('2026-08-28T11:45:00.000Z').artifact;
    await writeFile(artifactPath, `${JSON.stringify(envelope('2026-08-27T00:00:00.000Z').artifact)}\n`, 'utf8');
    await writeFile(cooldownPath, JSON.stringify({ cooldownUntil: '2026-08-28T13:00:00.000Z', reason: 'Cloudflare backoff' }), 'utf8');

    const loaded = await loadOhlqBrowserArtifact({
      artifactPath,
      cooldownPath,
      staleAfterMs: 12 * 60 * 60_000,
      nowMs: Date.parse('2026-08-28T12:00:00.000Z'),
      hydrate: async () => ({ artifact: fresh, hydrated: true }),
    });

    assert.equal(loaded.hydrated, true);
    assert.equal(loaded.stale, false);
    assert.equal(loaded.staleReason, null);
    assert.equal(loaded.browserRun?.generatedAt, fresh.generatedAt);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('OHLQ loader preserves stale fallback evidence when worker hydration fails', async () => {
  const dir = await mkdtemp(path.join(tmpdir(), 'ohlq-worker-loader-fail-'));
  try {
    const artifactPath = path.join(dir, 'ohlq-availability.json');
    const cooldownPath = path.join(dir, 'ohlq-cooldown.json');
    await writeFile(artifactPath, `${JSON.stringify(envelope('2026-08-27T00:00:00.000Z').artifact)}\n`, 'utf8');
    await writeFile(cooldownPath, JSON.stringify({ cooldownUntil: '2026-08-28T13:00:00.000Z', reason: 'Cloudflare backoff' }), 'utf8');

    const loaded = await loadOhlqBrowserArtifact({
      artifactPath,
      cooldownPath,
      staleAfterMs: 12 * 60 * 60_000,
      nowMs: Date.parse('2026-08-28T12:00:00.000Z'),
      hydrate: async () => { throw new Error('fetch failed'); },
    });

    assert.equal(loaded.hydrated, false);
    assert.equal(loaded.stale, true);
    assert.match(loaded.staleReason || '', /cooldown active/i);
    assert.match(loaded.hydrationError || '', /fetch failed/i);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
