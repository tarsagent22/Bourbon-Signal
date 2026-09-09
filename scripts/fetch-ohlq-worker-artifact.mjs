import { mkdir, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { hydrateOhlqWorkerArtifact, ohlqWorkerArtifactRequired, ohlqWorkerTargetStates } from '../engine/src/ohlq-worker-artifact.mjs';

const REQUIRED = ohlqWorkerArtifactRequired();
const STATUS_FILE = path.resolve(process.env.OHLQ_WORKER_HYDRATION_STATUS_FILE || 'engine/out/browser/ohlq-artifact-hydration-status.json');

async function writeStatus(payload) {
  await mkdir(path.dirname(STATUS_FILE), { recursive: true });
  const temporary = `${STATUS_FILE}.${process.pid}.tmp`;
  await writeFile(temporary, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await rename(temporary, STATUS_FILE);
}

async function hydrate() {
  const checkedAt = new Date().toISOString();
  const targetStates = ohlqWorkerTargetStates();
  try {
    const result = await hydrateOhlqWorkerArtifact();
    const status = {
      schemaVersion: 'bourbon-signal-ohlq-artifact-hydration-v1',
      checkedAt,
      ok: true,
      status: 'hydrated',
      required: REQUIRED,
      targetStates,
      generatedAt: result.generatedAt,
      digest: result.digest,
      destination: result.destination,
      cacheDisposition: 'replaced_after_validation',
      error: null,
      nextRoute: null,
    };
    await writeStatus(status);
    console.log(JSON.stringify(status));
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = {
      schemaVersion: 'bourbon-signal-ohlq-artifact-hydration-v1',
      checkedAt,
      ok: false,
      status: 'dependency_unavailable',
      required: REQUIRED,
      targetStates,
      generatedAt: null,
      digest: null,
      destination: path.resolve(process.env.OHLQ_WORKER_DESTINATION || 'engine/out/browser/ohlq-availability.json'),
      cacheDisposition: 'unchanged',
      error: message,
      nextRoute: 'Run and verify the persistent OHLQ worker upload, then rerun targeted Ohio recovery; do not relabel a retained artifact as fresh.',
    };
    await writeStatus(status);
    console.log(JSON.stringify(status));
    if (REQUIRED) throw new Error(message);
    console.warn(message);
    return null;
  }
}

async function main() {
  return hydrate();
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
