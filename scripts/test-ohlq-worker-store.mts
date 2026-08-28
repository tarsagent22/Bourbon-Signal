import assert from "node:assert/strict";
import test from "node:test";

import { OHLQ_WORKER_CONTRACT } from "../src/lib/ohlq-worker-artifact.ts";
import { readLatestOhlqWorkerEnvelope, storeOhlqWorkerEnvelope } from "../src/lib/ohlq-worker-artifact-store.ts";
import { ohlqWorkerArtifactBackend, readLatestOhlqWorkerEnvelopeFromDatabase, storeOhlqWorkerEnvelopeInDatabase } from "../src/lib/ohlq-worker-artifact-database.ts";

const previousBlobToken = process.env.BLOB_READ_WRITE_TOKEN;
const previousArtifactSecret = process.env.OHLQ_WORKER_ARTIFACT_SECRET;
process.env.BLOB_READ_WRITE_TOKEN = "test-blob-token";
process.env.OHLQ_WORKER_ARTIFACT_SECRET = "0123456789abcdef0123456789abcdef";

test.after(() => {
  if (previousBlobToken == null) delete process.env.BLOB_READ_WRITE_TOKEN;
  else process.env.BLOB_READ_WRITE_TOKEN = previousBlobToken;
  if (previousArtifactSecret == null) delete process.env.OHLQ_WORKER_ARTIFACT_SECRET;
  else process.env.OHLQ_WORKER_ARTIFACT_SECRET = previousArtifactSecret;
});

function makeEnvelope(generatedAt: string, uploadId: string, marker: string) {
  const products = Array.from({ length: 10 }, (_, productIndex) => {
    const sku = `sku-${marker}-${productIndex}`;
    const inventories = Array.from({ length: 50 }, (_, rowIndex) => ({
      AgencyId: `${marker}-${productIndex}-${rowIndex}`,
      AgencyName: `Agency ${rowIndex}`,
      Address1: `${rowIndex} Main St`,
      City: "Columbus",
      State: "OH",
      Zip: "43215",
      I: "available",
      VariantCode: sku,
      LocationTypes: ["OHLQ"],
      PickupAvailable: true,
      Url: "https://www.ohlq.com/locations",
      EcommerceUrls: [],
    }));
    return {
      ok: true,
      status: 200,
      endpoint: `/api/product-availability/${sku}?sku=${sku}&isExclusive=false&sortByAvailability=true`,
      pageUrl: `https://www.ohlq.com/liquor/${sku}`,
      title: `Product ${marker}`,
      productName: `Product ${marker}`,
      sku,
      isExclusive: false,
      inventoryCount: inventories.length,
      inventories,
    };
  });
  return {
    contractVersion: OHLQ_WORKER_CONTRACT,
    uploadId,
    generatedAt,
    artifact: { generatedAt, products, summary: { productCount: 10, okProductCount: 10, inventoryRowCount: 500 } },
  };
}

function memoryBlob() {
  const objects = new Map<string, string>();
  const urlFor = (pathname: string) => `https://blob.test/${encodeURIComponent(pathname)}`;
  return {
    objects,
    list: async ({ prefix }: { prefix: string }) => ({
      blobs: [...objects.keys()].filter((pathname) => pathname.startsWith(prefix)).map((pathname) => ({
        pathname, url: urlFor(pathname), downloadUrl: urlFor(pathname), uploadedAt: new Date(), size: objects.get(pathname)!.length,
      })),
      hasMore: false,
    }),
    put: async (pathname: string, body: string, options: { allowOverwrite?: boolean }) => {
      if (objects.has(pathname) && !options.allowOverwrite) throw new Error("blob already exists");
      objects.set(pathname, body);
      return { pathname, url: urlFor(pathname), downloadUrl: urlFor(pathname), uploadedAt: new Date(), size: body.length };
    },
    fetcher: async (url: string) => {
      const pathname = decodeURIComponent(new URL(url).pathname.slice(1));
      const body = objects.get(pathname);
      return body == null ? new Response("missing", { status: 404 }) : new Response(body, { status: 200 });
    },
  };
}

function memoryDatabase() {
  const rows = new Map<string, Record<string, unknown>>();
  return {
    rows,
    async query(text: string, params: unknown[] = []) {
      if (/CREATE TABLE|CREATE INDEX|DELETE FROM/iu.test(text)) return [];
      if (/INSERT INTO ohlq_worker_artifacts/iu.test(text)) {
        const [digest, uploadId, generatedAt, receivedAt, encryptedPayload] = params.map(String);
        const conflict = [...rows.values()].find((row) => row.digest === digest || row.upload_id === uploadId);
        if (conflict) return [];
        const row = { digest, upload_id: uploadId, generated_at: generatedAt, received_at: receivedAt, encrypted_payload: encryptedPayload };
        rows.set(digest, row);
        return [row];
      }
      if (/WHERE digest = \$1 OR upload_id = \$2/iu.test(text)) {
        const [digest, uploadId] = params.map(String);
        const row = [...rows.values()].find((candidate) => candidate.digest === digest || candidate.upload_id === uploadId);
        return row ? [row] : [];
      }
      if (/ORDER BY generated_at DESC/iu.test(text)) {
        return [...rows.values()].sort((left, right) => {
          const generated = String(right.generated_at).localeCompare(String(left.generated_at));
          return generated || String(left.digest).localeCompare(String(right.digest));
        }).slice(0, 1);
      }
      throw new Error(`Unexpected database query in test: ${text}`);
    },
  };
}

test("immutable OHLQ manifests prevent older concurrent uploads from replacing newer evidence", async () => {
  const blob = memoryBlob();
  const newer = makeEnvelope(new Date(Date.now() - 60_000).toISOString(), "123e4567-e89b-42d3-a456-426614174001", "new");
  const older = makeEnvelope(new Date(Date.now() - 120_000).toISOString(), "123e4567-e89b-42d3-a456-426614174002", "old");
  await storeOhlqWorkerEnvelope(newer, blob as never);
  await storeOhlqWorkerEnvelope(older, blob as never);
  const latest = await readLatestOhlqWorkerEnvelope(blob as never);
  assert.equal(latest?.generatedAt, newer.generatedAt);
  assert.equal(JSON.stringify([...blob.objects.values()]).includes("Agency 1"), false, "public blobs must remain encrypted");
});

test("Blob and database backends use the same digest tie-break for equal generated timestamps", async () => {
  const generatedAt = new Date(Date.now() - 60_000).toISOString();
  const first = makeEnvelope(generatedAt, "123e4567-e89b-42d3-a456-426614174021", "same-time-a");
  const second = makeEnvelope(generatedAt, "123e4567-e89b-42d3-a456-426614174022", "same-time-b");
  const blob = memoryBlob();
  const database = memoryDatabase();
  await storeOhlqWorkerEnvelope(first, blob as never);
  await storeOhlqWorkerEnvelope(second, blob as never);
  await storeOhlqWorkerEnvelopeInDatabase(first, { database });
  await storeOhlqWorkerEnvelopeInDatabase(second, { database });
  const blobLatest = await readLatestOhlqWorkerEnvelope(blob as never);
  const databaseLatest = await readLatestOhlqWorkerEnvelopeFromDatabase({ database });
  assert.equal(databaseLatest?.digest, blobLatest?.digest);
  assert.equal(databaseLatest?.generatedAt, generatedAt);
});

test("one authoritative backend is selected deterministically for both reads and writes", () => {
  assert.equal(ohlqWorkerArtifactBackend({ DATABASE_URL: "postgres://example", BLOB_READ_WRITE_TOKEN: "blob" } as NodeJS.ProcessEnv), "database");
  assert.equal(ohlqWorkerArtifactBackend({ BLOB_READ_WRITE_TOKEN: "blob" } as NodeJS.ProcessEnv), "blob");
  assert.throws(() => ohlqWorkerArtifactBackend({} as NodeJS.ProcessEnv), /No OHLQ worker artifact store/);
});

test("encrypted database fallback preserves newest immutable evidence and rejects upload-ID rebinding", async () => {
  const database = memoryDatabase();
  const newer = makeEnvelope(new Date(Date.now() - 60_000).toISOString(), "123e4567-e89b-42d3-a456-426614174011", "db-new");
  const older = makeEnvelope(new Date(Date.now() - 120_000).toISOString(), "123e4567-e89b-42d3-a456-426614174012", "db-old");
  await storeOhlqWorkerEnvelopeInDatabase(newer, { database });
  await storeOhlqWorkerEnvelopeInDatabase(older, { database });
  const latest = await readLatestOhlqWorkerEnvelopeFromDatabase({ database });
  assert.equal(latest?.generatedAt, newer.generatedAt);
  assert.equal(JSON.stringify([...database.rows.values()]).includes("Agency 1"), false, "database payload must remain encrypted");

  const replay = await storeOhlqWorkerEnvelopeInDatabase(newer, { database });
  assert.equal(replay.digest, latest?.digest);
  await assert.rejects(
    () => storeOhlqWorkerEnvelopeInDatabase(makeEnvelope(newer.generatedAt, newer.uploadId, "db-forged"), { database }),
    /bound to different content/i,
  );
});

test("OHLQ upload receipts are idempotent and bind upload IDs to one digest", async () => {
  const blob = memoryBlob();
  const generatedAt = new Date(Date.now() - 60_000).toISOString();
  const uploadId = "123e4567-e89b-42d3-a456-426614174003";
  const original = makeEnvelope(generatedAt, uploadId, "one");
  const first = await storeOhlqWorkerEnvelope(original, blob as never);
  const replay = await storeOhlqWorkerEnvelope(original, blob as never);
  assert.equal(replay.digest, first.digest);
  await assert.rejects(() => storeOhlqWorkerEnvelope(makeEnvelope(generatedAt, uploadId, "two"), blob as never), /bound to different content/i);
});
