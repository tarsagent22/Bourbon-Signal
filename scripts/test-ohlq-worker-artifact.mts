import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { createHash, generateKeyPairSync } from "node:crypto";
import path from "node:path";
import test from "node:test";

import {
  OHLQ_WORKER_CONTRACT,
  authorizeOhlqWorkerBearer,
  getOhlqWorkerArtifactSecret,
  ohlqWorkerArtifactDigest,
  ohlqWorkerSignature,
  sanitizeOhlqWorkerEnvelope,
  verifyOhlqWorkerUploadSignature,
} from "../src/lib/ohlq-worker-artifact.ts";
import { decryptOhlqWorkerBlob, encryptOhlqWorkerBlob } from "../src/lib/ohlq-worker-blob-crypto.ts";
import { ohlqArtifactDigest, validateOhlqArtifactDownload } from "./lib/ohlq-worker-handoff.mjs";
import { classifyOhlqBrowserState, deterministicOhlqUploadId, resolveOhlqWorkerPaths } from "./lib/ohlq-worker-runtime.mjs";
import { ohlqBlockedReason, ohlqResultIsAccessBlocked } from "../engine/src/sources/ohlq-access-policy.mjs";

const now = Date.parse("2026-08-15T15:00:00.000Z");
const secret = "0123456789abcdef0123456789abcdef";

function inventory(index: number) {
  return {
    AgencyId: String(index), AgencyName: `Agency ${index}`, VariantCode: "abc-750", LocationTypes: ["OHLQ"],
    DeliveryAvailable: false, PickupAvailable: true, Latitude: 40, Longitude: -82,
    Address1: `${index} Main St`, Address2: null, City: "Columbus", State: "OH", Zip: "43215",
    I: "availability-bucket", Distance: index, LastModified: "2026-08-15T14:55:00Z",
    PhoneNumber: "5555555555", EcommerceUrls: [], Url: "https://www.ohlq.com/locations", Price: 49.99, LimitOne: false,
  };
}

function envelope(overrides: Record<string, unknown> = {}) {
  const generatedAt = "2026-08-15T14:55:00.000Z";
  const products = Array.from({ length: 10 }, (_, productIndex) => {
    const inventories = Array.from({ length: 50 }, (_, rowIndex) => inventory(productIndex * 50 + rowIndex + 1));
    return {
      ok: true, status: 200, endpoint: `/api/product-availability/sku-${productIndex}?sku=sku-${productIndex}`,
      pageUrl: `https://www.ohlq.com/liquor/whiskey/american/bourbon/product-${productIndex}`,
      title: `Product ${productIndex}`, productName: `Product ${productIndex}`, sku: `sku-${productIndex}`,
      baseSku: `sku-${productIndex}`, preferredVariantSku: `sku-${productIndex}`, isExclusive: false,
      displayStatus: "Active", inventoryCount: inventories.length, inventories, error: null,
    };
  });
  return {
    contractVersion: OHLQ_WORKER_CONTRACT,
    uploadId: "123e4567-e89b-42d3-a456-426614174000",
    generatedAt,
    artifact: { generatedAt, cdpUrl: "http://127.0.0.1:18801", products, summary: { productCount: 10, okProductCount: 10, inventoryRowCount: 500 } },
    ...overrides,
  };
}

test("OHLQ worker artifact strips local browser metadata and preserves complete Ohio evidence", () => {
  const normalized = sanitizeOhlqWorkerEnvelope(envelope(), { now });
  assert.equal("cdpUrl" in normalized.artifact, false);
  assert.equal(normalized.artifact.products.length, 10);
  assert.equal(normalized.artifact.summary.inventoryRowCount, 500);
  assert.match(ohlqWorkerArtifactDigest(normalized.artifact), /^[a-f0-9]{64}$/);
});

test("OHLQ worker artifact fails closed on stale, partial, non-Ohio, mismatched, or sensitive evidence", () => {
  const stale = envelope({ generatedAt: "2026-08-15T13:00:00.000Z" });
  (stale.artifact as Record<string, unknown>).generatedAt = stale.generatedAt;
  assert.throws(() => sanitizeOhlqWorkerEnvelope(stale, { now }), /stale/i);

  const partial = envelope();
  (partial.artifact as Record<string, unknown>).products = (partial.artifact as Record<string, unknown>).products instanceof Array
    ? ((partial.artifact as Record<string, unknown>).products as unknown[]).slice(0, 9) : [];
  assert.throws(() => sanitizeOhlqWorkerEnvelope(partial, { now }), /product set/i);

  const outside = envelope();
  (((outside.artifact as Record<string, unknown>).products as Record<string, unknown>[])[0].inventories as Record<string, unknown>[])[0].State = "PA";
  assert.throws(() => sanitizeOhlqWorkerEnvelope(outside, { now }), /outside Ohio/i);

  const mismatched = envelope();
  ((mismatched.artifact as Record<string, unknown>).summary as Record<string, unknown>).inventoryRowCount = 499;
  assert.throws(() => sanitizeOhlqWorkerEnvelope(mismatched, { now }), /summary/i);

  const sensitive = envelope();
  ((sensitive.artifact as Record<string, unknown>).products as Record<string, unknown>[])[0].headers = { cookie: "forbidden" };
  assert.throws(() => sanitizeOhlqWorkerEnvelope(sensitive, { now }), /forbidden/i);

  const fakeSuccess = envelope();
  for (const product of (fakeSuccess.artifact as Record<string, unknown>).products as Record<string, unknown>[]) {
    product.ok = "false";
    product.status = 500;
  }
  assert.throws(() => sanitizeOhlqWorkerEnvelope(fakeSuccess, { now }), /summary/i);

  const queryToken = envelope();
  const queryProduct = ((queryToken.artifact as Record<string, unknown>).products as Record<string, unknown>[])[0];
  queryProduct.endpoint = `${String(queryProduct.endpoint)}&token=forbidden`;
  assert.throws(() => sanitizeOhlqWorkerEnvelope(queryToken, { now }), /query parameter/i);

  const fakeInventoryBoolean = envelope();
  const firstProduct = ((fakeInventoryBoolean.artifact as Record<string, unknown>).products as Record<string, unknown>[])[0];
  const firstInventory = (firstProduct.inventories as Record<string, unknown>[])[0];
  firstInventory.PickupAvailable = "false";
  assert.throws(() => sanitizeOhlqWorkerEnvelope(fakeInventoryBoolean, { now }), /must be boolean/i);
});

test("OHLQ upload authentication requires a complete bearer and fresh body signature", () => {
  const derived = getOhlqWorkerArtifactSecret({ CRON_SECRET: secret });
  assert.ok(derived && derived.length >= 32);
  assert.notEqual(derived, secret);
  assert.equal(derived, getOhlqWorkerArtifactSecret({ CRON_SECRET: secret }));
  const body = JSON.stringify(envelope());
  const timestamp = new Date(now).toISOString();
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const signature = ohlqWorkerSignature(privateKey, timestamp, body);
  const expectedDigest = createHash("sha256").update(secret).digest("hex");
  assert.equal(authorizeOhlqWorkerBearer(`Bearer ${secret}`, expectedDigest), true);
  assert.equal(authorizeOhlqWorkerBearer(secret, expectedDigest), false);
  assert.equal(verifyOhlqWorkerUploadSignature({ body, timestamp, signature, publicKey, now }), true);
  assert.equal(verifyOhlqWorkerUploadSignature({ body: `${body} `, timestamp, signature, publicKey, now }), false);
  assert.equal(verifyOhlqWorkerUploadSignature({ body, timestamp: "2026-08-15T14:00:00Z", signature, publicKey, now }), false);
});

test("OHLQ blob storage encrypts public objects and rejects tampering", () => {
  const value = { digest: "inventory-digest", artifact: { products: 10 } };
  const encrypted = encryptOhlqWorkerBlob(value, secret);
  assert.equal(encrypted.includes("inventory-digest"), false);
  assert.deepEqual(decryptOhlqWorkerBlob(encrypted, secret), value);
  const parsed = JSON.parse(encrypted);
  const midpoint = Math.floor(parsed.ciphertext.length / 2);
  parsed.ciphertext = `${parsed.ciphertext.slice(0, midpoint)}${parsed.ciphertext[midpoint] === "A" ? "B" : "A"}${parsed.ciphertext.slice(midpoint + 1)}`;
  assert.throws(() => decryptOhlqWorkerBlob(JSON.stringify(parsed), secret));
});

test("OHLQ upload IDs are deterministic UUIDs for idempotent artifact retries", () => {
  const first = deterministicOhlqUploadId({ generatedAt: "a", rows: [1, 2] });
  assert.match(first, /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  assert.equal(first, deterministicOhlqUploadId({ generatedAt: "a", rows: [1, 2] }));
  assert.notEqual(first, deterministicOhlqUploadId({ generatedAt: "b", rows: [1, 2] }));
});

test("OHLQ browser readiness never treats a Cloudflare challenge as collection-ready", () => {
  assert.equal(classifyOhlqBrowserState({ title: "Just a moment...", text: "Performing security verification" }), "needs_human");
  assert.equal(classifyOhlqBrowserState({ title: "Product", text: "Verify you are human Cloudflare", hasCsrf: true, hasProduct: true }), "needs_human");
  assert.equal(classifyOhlqBrowserState({ title: "Blanton's Gold", hasCsrf: true, hasProduct: true }), "ready");
  assert.equal(classifyOhlqBrowserState({ title: "Blanton's Gold", hasCsrf: false, hasProduct: false }), "not_ready");
  assert.equal(ohlqBlockedReason("Cloudflare error 1015"), true);
  assert.equal(ohlqResultIsAccessBlocked({ status: 429 }), true);
  assert.equal(ohlqResultIsAccessBlocked({ status: 200, title: "OHLQ product" }), false);
});

test("OHLQ browser profile defaults to durable local state outside the repository", () => {
  const paths = resolveOhlqWorkerPaths({ LOCALAPPDATA: "C:/Users/test/AppData/Local" }, "C:/Users/test");
  assert.match(paths.profileDir.replaceAll("\\", "/"), /AppData\/Local\/BourbonSignal\/ohlq-worker\/browser-profile$/);
  assert.equal(paths.profileDir.includes("bs-ohlq-worker"), false);
  const overrideRoot = path.resolve("durable-test", "ohlq");
  const override = resolveOhlqWorkerPaths({ OHLQ_WORKER_STATE_DIR: overrideRoot }, "C:/Users/chand");
  assert.equal(override.profileDir, path.join(overrideRoot, "browser-profile"));
});

test("production handoff rejects stale and tampered downloads before replacing the cache", () => {
  const artifact = sanitizeOhlqWorkerEnvelope(envelope(), { now }).artifact;
  const valid = {
    contractVersion: OHLQ_WORKER_CONTRACT,
    generatedAt: artifact.generatedAt,
    digest: ohlqArtifactDigest(artifact),
    artifact,
  };
  assert.equal(validateOhlqArtifactDownload(valid, { now, maximumAgeMs: 20 * 60_000 }), artifact);
  assert.throws(() => validateOhlqArtifactDownload({ ...valid, digest: "0".repeat(64) }, { now }), /digest/i);
  assert.throws(() => validateOhlqArtifactDownload(valid, { now: now + 7 * 60 * 60_000, maximumAgeMs: 6 * 60 * 60_000 }), /stale/i);
});

test("scheduled handoff tolerates network failure but targeted Ohio fails closed case-insensitively", () => {
  const baseEnv = {
    ...process.env,
    OHLQ_WORKER_API_URL: "http://127.0.0.1:9",
    OHLQ_WORKER_ARTIFACT_SECRET: secret,
  };
  const optional = spawnSync(process.execPath, ["scripts/fetch-ohlq-worker-artifact.mjs"], { cwd: process.cwd(), env: baseEnv, encoding: "utf8", timeout: 10_000 });
  assert.equal(optional.status, 0, optional.stderr);
  const required = spawnSync(process.execPath, ["scripts/fetch-ohlq-worker-artifact.mjs"], {
    cwd: process.cwd(), env: { ...baseEnv, OHLQ_WORKER_TARGET_STATES: "fl,oh" }, encoding: "utf8", timeout: 10_000,
  });
  assert.notEqual(required.status, 0);
  assert.match(required.stderr, /fetch failed|ECONNREFUSED/i);
});
