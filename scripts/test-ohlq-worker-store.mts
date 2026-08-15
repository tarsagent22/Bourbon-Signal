import assert from "node:assert/strict";
import test from "node:test";

import { OHLQ_WORKER_CONTRACT } from "../src/lib/ohlq-worker-artifact.ts";
import { readLatestOhlqWorkerEnvelope, storeOhlqWorkerEnvelope } from "../src/lib/ohlq-worker-artifact-store.ts";

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
