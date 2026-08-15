import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { validateOhlqArtifactDownload } from './lib/ohlq-worker-handoff.mjs';

const BASE_URL = process.env.OHLQ_WORKER_API_URL || 'https://www.bourbonsignal.com';
const DESTINATION = path.resolve(process.env.OHLQ_WORKER_DESTINATION || 'engine/out/browser/ohlq-availability.json');
const MAX_AGE_MS = Number(process.env.OHLQ_WORKER_FETCH_MAX_AGE_MS || 6 * 60 * 60_000);
const TARGET_STATES = String(process.env.OHLQ_WORKER_TARGET_STATES || '')
  .split(/[^A-Za-z]+/)
  .map((state) => state.toUpperCase())
  .filter(Boolean);
const REQUIRED = process.env.OHLQ_WORKER_ARTIFACT_REQUIRED === '1' || process.argv.includes('--required') || TARGET_STATES.includes('OH');

function fail(message) {
  if (REQUIRED) throw new Error(message);
  console.warn(message);
  return null;
}

async function hydrate() {
  const secret = process.env.OHLQ_WORKER_ARTIFACT_SECRET;
  if (!secret || secret.length < 32) return fail('OHLQ worker artifact secret is not configured; retained artifact cache remains unchanged.');
  const url = new URL('/api/source/ohlq/artifact', BASE_URL);
  const response = await fetch(url, {
    headers: { authorization: `Bearer ${secret}`, accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(30_000),
  });
  const text = await response.text();
  if (!response.ok) return fail(`OHLQ worker artifact fetch failed with HTTP ${response.status}: ${text.slice(0, 300)}`);
  const envelope = JSON.parse(text);
  const artifact = validateOhlqArtifactDownload(envelope, { maximumAgeMs: MAX_AGE_MS });
  const artifactText = `${JSON.stringify(artifact, null, 2)}\n`;
  await mkdir(path.dirname(DESTINATION), { recursive: true });
  const temporary = `${DESTINATION}.${process.pid}.tmp`;
  await writeFile(temporary, artifactText, 'utf8');
  await rename(temporary, DESTINATION);
  console.log(JSON.stringify({ ok: true, status: 'hydrated', generatedAt: envelope.generatedAt, digest: envelope.digest, destination: DESTINATION }));
  return envelope;
}

async function main() {
  try {
    return await hydrate();
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
