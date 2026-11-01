import { createDecipheriv, createHash } from "node:crypto";
import { gunzipSync } from "node:zlib";

export interface RemoteSnapshotStorage {
  readPointer(): Promise<Record<string, unknown> | null>;
  readObject(key: string): Promise<string | null>;
}

interface FileDescriptor {
  path: string;
  bytes: number;
  sha256: string;
}

interface SiteSnapshotManifest {
  contractVersion: "bourbon-signal-file-snapshot-v1";
  generatedAt: string;
  snapshotId: string;
  manifestHash: string;
  files: Record<string, FileDescriptor>;
}

const MAX_SNAPSHOT_PLAINTEXT_BYTES = 64 * 1024 * 1024;

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return Object.fromEntries(Object.keys(record).sort().map((key) => [key, canonicalize(record[key])]));
  }
  return value;
}

function sha256(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function decryptObject(serialized: string, encryptionKey: string, expectedBytes: number) {
  const key = Buffer.from(encryptionKey || "", "base64url");
  if (key.length !== 32) throw new Error("Invalid engine snapshot encryption key");
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 || expectedBytes > MAX_SNAPSHOT_PLAINTEXT_BYTES) {
    throw new Error("Engine snapshot file exceeds the plaintext size limit");
  }
  const payload = JSON.parse(serialized) as Record<string, string>;
  if (payload.contractVersion !== "bourbon-signal-encrypted-object-v1" || payload.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted engine snapshot object");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64url"));
  if (payload.encoding === "gzip") decipher.setAAD(Buffer.from("bourbon-signal-encrypted-object-v1:gzip", "utf8"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  const decoded = Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]);
  if (payload.encoding === undefined) return decoded.toString("utf8");
  if (payload.encoding === "gzip") return gunzipSync(decoded, { maxOutputLength: expectedBytes }).toString("utf8");
  throw new Error(`Unsupported encrypted engine snapshot encoding: ${String(payload.encoding)}`);
}

function verifyManifest(value: unknown): SiteSnapshotManifest {
  if (!value || typeof value !== "object") throw new Error("Invalid engine snapshot manifest");
  const manifest = value as SiteSnapshotManifest;
  if (manifest.contractVersion !== "bourbon-signal-file-snapshot-v1") throw new Error("Unsupported engine snapshot manifest contract");
  const { snapshotId, manifestHash, ...unsigned } = manifest;
  const actual = sha256(JSON.stringify(canonicalize(unsigned)));
  if (actual !== manifestHash || !snapshotId.endsWith(manifestHash.slice(0, 16))) throw new Error("Engine snapshot manifest hash mismatch");
  return manifest;
}

export function createRemoteSiteSnapshotReader(options: { storage: RemoteSnapshotStorage; encryptionKey: string; cacheImmutable?: boolean; cacheBytes?: number }) {
  // Reader-local storage/key boundary. Only verified immutable objects are reused;
  // the active pointer and all consumer policy/expiry checks remain live.
  const manifests = new Map<string, Promise<SiteSnapshotManifest>>();
  const payloads = new Map<string, { promise: Promise<Record<string, unknown>>; bytes: number }>();
  const maximumBytes = Math.max(0, options.cacheBytes ?? 32 * 1024 * 1024);
  async function manifestFor(snapshotId: string) {
    const hit = options.cacheImmutable && manifests.get(snapshotId);
    if (hit) return hit;
    const attempt = (async () => {
      const raw = await options.storage.readObject(`engine/snapshots/${snapshotId}/manifest.json`);
      if (!raw) throw new Error(`Remote engine snapshot manifest missing: ${snapshotId}`);
      const manifest = verifyManifest(JSON.parse(raw));
      if (manifest.snapshotId !== snapshotId) throw new Error("Remote engine snapshot pointer identity mismatch");
      return manifest;
    })();
    if (options.cacheImmutable) {
      manifests.set(snapshotId, attempt);
      while (manifests.size > 2) manifests.delete(manifests.keys().next().value!);
    }
    try { return await attempt; }
    catch (error) { if (manifests.get(snapshotId) === attempt) manifests.delete(snapshotId); throw error; }
  }
  async function payloadFor(snapshotId: string, filePath: string, descriptor: FileDescriptor) {
    const key = `${snapshotId}:${filePath}:${descriptor.sha256}:${descriptor.bytes}`;
    const hit = options.cacheImmutable && payloads.get(key);
    if (hit) return structuredClone(await hit.promise);
    const attempt = (async () => {
      const encrypted = await options.storage.readObject(`engine/snapshots/${snapshotId}/files/${filePath}.enc`);
      if (!encrypted) throw new Error(`Engine snapshot file is missing: ${filePath}`);
      const plaintext = decryptObject(encrypted, options.encryptionKey, descriptor.bytes);
      if (Buffer.byteLength(plaintext) !== descriptor.bytes || sha256(plaintext) !== descriptor.sha256) {
        throw new Error(`Engine snapshot file hash mismatch: ${filePath}`);
      }
      return JSON.parse(plaintext) as Record<string, unknown>;
    })();
    if (options.cacheImmutable && descriptor.bytes >= 0 && descriptor.bytes <= maximumBytes) {
      payloads.set(key, { promise: attempt, bytes: descriptor.bytes });
      let bytes = [...payloads.values()].reduce((sum, entry) => sum + entry.bytes, 0);
      while (bytes > maximumBytes || payloads.size > 16) {
        const oldest = payloads.keys().next().value!;
        bytes -= payloads.get(oldest)!.bytes;
        payloads.delete(oldest);
      }
    }
    try { return structuredClone(await attempt); }
    catch (error) { if (payloads.get(key)?.promise === attempt) payloads.delete(key); throw error; }
  }
  return {
    async read(name: string, pinnedPointer?: Record<string, unknown> | null) {
      const pointer = pinnedPointer === undefined ? await options.storage.readPointer() : pinnedPointer;
      const snapshotId = typeof pointer?.active === "string" ? pointer.active : "";
      if (!snapshotId) throw new Error("Remote engine snapshot has no active pointer");
      const manifest = await manifestFor(snapshotId);
      const filePath = name.endsWith(".json") ? name : `${name}.json`;
      const descriptor = manifest.files[filePath];
      if (!descriptor) throw new Error(`Engine snapshot file is not declared: ${filePath}`);
      const payload = await payloadFor(snapshotId, filePath, descriptor);
      const rollback = pointer?.lastRollback && typeof pointer.lastRollback === "object"
        ? pointer.lastRollback as Record<string, unknown>
        : null;
      return {
        source: "remote" as const,
        snapshotId,
        generatedAt: manifest.generatedAt,
        snapshotUploadedAt: typeof pointer?.snapshotUploadedAt === "string" ? pointer.snapshotUploadedAt : null,
        snapshotActivatedAt: typeof pointer?.snapshotActivatedAt === "string" ? pointer.snapshotActivatedAt : null,
        appCommit: typeof (manifest as unknown as Record<string, unknown>).appCommit === "string" ? (manifest as unknown as Record<string, string>).appCommit : null,
        engineCommit: typeof (manifest as unknown as Record<string, unknown>).engineCommit === "string" ? (manifest as unknown as Record<string, string>).engineCommit : null,
        collectionRunId: typeof (manifest as unknown as Record<string, unknown>).collectionRunId === "string" ? (manifest as unknown as Record<string, string>).collectionRunId : null,
        lastRollbackAt: typeof rollback?.at === "string" ? rollback.at : null,
        lastRollbackFrom: typeof rollback?.from === "string" ? rollback.from : null,
        lastRollbackTo: typeof rollback?.to === "string" ? rollback.to : null,
        payload,
      };
    },
  };
}
