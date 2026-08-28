import { hydrateOhlqWorkerArtifact, ohlqWorkerArtifactRequired } from '../engine/src/ohlq-worker-artifact.mjs';

const REQUIRED = ohlqWorkerArtifactRequired();

function fail(message) {
  if (REQUIRED) throw new Error(message);
  console.warn(message);
  return null;
}

async function hydrate() {
  const result = await hydrateOhlqWorkerArtifact();
  console.log(JSON.stringify({ ok: true, status: 'hydrated', generatedAt: result.generatedAt, digest: result.digest, destination: result.destination }));
  return result;
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
