import assert from "node:assert/strict";
import { createCipheriv } from "node:crypto";
import { readFile } from "node:fs/promises";
import { gzipSync } from "node:zlib";
import { createRemoteSiteSnapshotReader } from "../src/lib/remote-site-snapshot.ts";
import { createSiteSnapshotManifest } from "../engine/src/data-plane/site-snapshot-contract.mjs";

const [routeSource, snapshotSource, repositorySource, feedSource, retailerPublicSource] = await Promise.all([
  readFile(new URL("../src/app/api/drops/route.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/site-engine-contract.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/retailer-repository.ts", import.meta.url), "utf8"),
  readFile(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/lib/retailer-public-submissions.ts", import.meta.url), "utf8"),
]);

assert.match(snapshotSource, /const readActivePointer = unstable_cache\([\s\S]*?revalidate:\s*15/, "the mutable snapshot pointer should use a short server data cache instead of a Blob round trip on every private feed request");
assert.doesNotMatch(repositorySource, /ensureSchema|CREATE TABLE|ALTER TABLE|CREATE INDEX/i, "retailer repository request paths must remain DML-only");
assert.match(routeSource, /readCachedPublicRetailerSubmissions/, "the Drop Feed reads the shared migration-provisioned retailer schema reader");
assert.match(retailerPublicSource, /listPublicSubmissions\(\)/, "the shared retailer reader queries the migration-provisioned retailer schema");
assert.match(retailerPublicSource, /unstable_cache\([\s\S]*?public-retailer-submissions-v3[\s\S]*?revalidate:\s*15/, "public retailer rows should be shared briefly across feed and coverage requests");
assert.match(routeSource, /retailerSubmissions\.length > 0\s*\? await getBourbonBible\(\)\s*:\s*\[\]/, "the Drop Feed should not fetch the bottle catalog when there are no retailer submissions to enrich");
assert.match(feedSource, /const dropFeedResponseCache = new Map/, "recent filter responses should be reusable during the browser session");
assert.match(feedSource, /new AbortController\(\)[\s\S]*?controller\.abort\(\)/, "superseded filter requests should be aborted");
assert.match(feedSource, /fetchDropFeedPage\([^)]*signal[^)]*forceRefresh/, "filter loading should use the cached, cancellable page fetcher");

const encryptionKey = Buffer.alloc(32, 7).toString("base64url");
const generatedAt = "2026-07-23T14:00:00.000Z";
const plaintext = JSON.stringify({ contractVersion: "bourbon-signal-site-v0.1", generatedAt, drops: Array.from({ length: 400 }, (_, index) => ({ id: index, state: "NC", bottleName: "Buffalo Trace Bourbon" })) });
const files = { "drops.json": plaintext };
const manifest = createSiteSnapshotManifest(files, { generatedAt, appCommit: "test", engineCommit: "test", collectionRunId: "test" });
function encryptGzip(value: string, ivByte: number) {
  const iv = Buffer.alloc(12, ivByte);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(encryptionKey, "base64url"), iv);
  cipher.setAAD(Buffer.from("bourbon-signal-encrypted-object-v1:gzip", "utf8"));
  const compressed = gzipSync(Buffer.from(value, "utf8"), { level: 6 });
  const ciphertext = Buffer.concat([cipher.update(compressed), cipher.final()]);
  return JSON.stringify({
    contractVersion: "bourbon-signal-encrypted-object-v1",
    algorithm: "aes-256-gcm",
    encoding: "gzip",
    iv: iv.toString("base64url"),
    tag: cipher.getAuthTag().toString("base64url"),
    ciphertext: ciphertext.toString("base64url"),
  });
}
const encrypted = encryptGzip(plaintext, 2);
const encryptedEnvelope = JSON.parse(encrypted) as { encoding?: string };
assert.equal(encryptedEnvelope.encoding, "gzip", "the staged reader fixture must exercise gzip transport");
assert.ok(Buffer.byteLength(encrypted) < Buffer.byteLength(plaintext) / 2, "compressed snapshot transport should be materially smaller than plaintext");

const objects = new Map<string, string>([
  [`engine/snapshots/${manifest.snapshotId}/manifest.json`, JSON.stringify(manifest)],
  [`engine/snapshots/${manifest.snapshotId}/files/drops.json.enc`, encrypted],
]);
const remoteReader = createRemoteSiteSnapshotReader({
  encryptionKey,
  storage: {
    readPointer: async () => ({ active: manifest.snapshotId }),
    readObject: async (key: string) => objects.get(key) ?? null,
  },
});
const decoded = await remoteReader.read("drops");
assert.deepEqual(decoded.payload, JSON.parse(plaintext), "the web reader must transparently decode compressed snapshots");

objects.set(`engine/snapshots/${manifest.snapshotId}/files/drops.json.enc`, encryptGzip(`${plaintext}${" ".repeat(1024)}`, 4));
await assert.rejects(
  () => remoteReader.read("drops"),
  /buffer larger than|plaintext size limit/i,
  "compressed snapshot expansion must stop at the manifest-declared plaintext size",
);

const legacyIv = Buffer.alloc(12, 3);
const legacyCipher = createCipheriv("aes-256-gcm", Buffer.from(encryptionKey, "base64url"), legacyIv);
const legacyCiphertext = Buffer.concat([legacyCipher.update(plaintext, "utf8"), legacyCipher.final()]);
objects.set(`engine/snapshots/${manifest.snapshotId}/files/drops.json.enc`, JSON.stringify({
  contractVersion: "bourbon-signal-encrypted-object-v1",
  algorithm: "aes-256-gcm",
  iv: legacyIv.toString("base64url"),
  tag: legacyCipher.getAuthTag().toString("base64url"),
  ciphertext: legacyCiphertext.toString("base64url"),
}));
const legacyDecoded = await remoteReader.read("drops");
assert.deepEqual(legacyDecoded.payload, JSON.parse(plaintext), "the web reader must remain compatible with active uncompressed snapshots during rollout");

console.log("Drop feed performance contract passed.");
