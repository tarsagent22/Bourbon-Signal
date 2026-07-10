import { createDecipheriv, createHash } from "node:crypto";

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

function decryptObject(serialized: string, encryptionKey: string) {
  const key = Buffer.from(encryptionKey || "", "base64url");
  if (key.length !== 32) throw new Error("Invalid engine snapshot encryption key");
  const payload = JSON.parse(serialized) as Record<string, string>;
  if (payload.contractVersion !== "bourbon-signal-encrypted-object-v1" || payload.algorithm !== "aes-256-gcm") {
    throw new Error("Unsupported encrypted engine snapshot object");
  }
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(payload.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(payload.tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(payload.ciphertext, "base64url")),
    decipher.final(),
  ]).toString("utf8");
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

export function createRemoteSiteSnapshotReader(options: { storage: RemoteSnapshotStorage; encryptionKey: string }) {
  return {
    async read(name: string) {
      const pointer = await options.storage.readPointer();
      const snapshotId = typeof pointer?.active === "string" ? pointer.active : "";
      if (!snapshotId) throw new Error("Remote engine snapshot has no active pointer");
      const manifestRaw = await options.storage.readObject(`engine/snapshots/${snapshotId}/manifest.json`);
      if (!manifestRaw) throw new Error(`Remote engine snapshot manifest missing: ${snapshotId}`);
      const manifest = verifyManifest(JSON.parse(manifestRaw));
      if (manifest.snapshotId !== snapshotId) throw new Error("Remote engine snapshot pointer identity mismatch");
      const filePath = name.endsWith(".json") ? name : `${name}.json`;
      const descriptor = manifest.files[filePath];
      if (!descriptor) throw new Error(`Engine snapshot file is not declared: ${filePath}`);
      const encrypted = await options.storage.readObject(`engine/snapshots/${snapshotId}/files/${filePath}.enc`);
      if (!encrypted) throw new Error(`Engine snapshot file is missing: ${filePath}`);
      const plaintext = decryptObject(encrypted, options.encryptionKey);
      if (Buffer.byteLength(plaintext) !== descriptor.bytes || sha256(plaintext) !== descriptor.sha256) {
        throw new Error(`Engine snapshot file hash mismatch: ${filePath}`);
      }
      return {
        source: "remote" as const,
        snapshotId,
        generatedAt: manifest.generatedAt,
        snapshotUploadedAt: typeof pointer?.snapshotUploadedAt === "string" ? pointer.snapshotUploadedAt : null,
        snapshotActivatedAt: typeof pointer?.snapshotActivatedAt === "string" ? pointer.snapshotActivatedAt : null,
        appCommit: typeof (manifest as unknown as Record<string, unknown>).appCommit === "string" ? (manifest as unknown as Record<string, string>).appCommit : null,
        engineCommit: typeof (manifest as unknown as Record<string, unknown>).engineCommit === "string" ? (manifest as unknown as Record<string, string>).engineCommit : null,
        collectionRunId: typeof (manifest as unknown as Record<string, unknown>).collectionRunId === "string" ? (manifest as unknown as Record<string, string>).collectionRunId : null,
        payload: JSON.parse(plaintext) as Record<string, unknown>,
      };
    },
  };
}
