import { createHash } from "node:crypto";

export const ENGINE_SNAPSHOT_CONTRACT_VERSION = "bourbon-signal-snapshot-v1";

type JsonObject = Record<string, unknown>;

export interface EngineSnapshot<TData extends JsonObject = JsonObject> {
  contractVersion: typeof ENGINE_SNAPSHOT_CONTRACT_VERSION;
  generatedAt: string;
  provenance: {
    engineVersion: string;
    gitSha: string;
    runId: string;
    sources: Array<Record<string, unknown>>;
  };
  stateHealth: Record<string, Record<string, unknown>>;
  data: TData;
  snapshotId: string;
  hash: string;
}

export interface EngineSnapshotPointer {
  active: string;
  previous: string | null;
  revision: number;
}

export interface EngineSnapshotReadStorage {
  readPointer(): Promise<EngineSnapshotPointer | null>;
  readImmutable(key: string): Promise<string | null>;
}

export type EngineSnapshotReadMode = "bundled" | "shadow" | "remote";

export interface EngineSnapshotReadResult<TData extends JsonObject> {
  source: "bundled" | "remote" | "bundled-fallback";
  snapshot: EngineSnapshot<TData>;
  reason?: string;
  shadow?: { hash?: string; valid: boolean; reason?: string };
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize((value as JsonObject)[key])]));
  }
  return value;
}

function verifySnapshot<TData extends JsonObject>(value: unknown): { valid: true; snapshot: EngineSnapshot<TData> } | { valid: false; reason: string } {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { valid: false, reason: "invalid_snapshot" };
  const snapshot = value as EngineSnapshot<TData>;
  if (snapshot.contractVersion !== ENGINE_SNAPSHOT_CONTRACT_VERSION) return { valid: false, reason: "unsupported_contract_version" };
  if (!snapshot.data || typeof snapshot.data !== "object" || Array.isArray(snapshot.data)) return { valid: false, reason: "invalid_data" };
  if (!snapshot.provenance || !snapshot.stateHealth || typeof snapshot.hash !== "string" || snapshot.snapshotId !== snapshot.hash) {
    return { valid: false, reason: "invalid_contract" };
  }
  const { hash, snapshotId, ...unsigned } = snapshot;
  const actual = createHash("sha256").update(JSON.stringify(canonicalize(unsigned))).digest("hex");
  if (actual !== hash) return { valid: false, reason: "hash_mismatch" };
  return { valid: true, snapshot };
}

async function readRemote<TData extends JsonObject>(storage: EngineSnapshotReadStorage) {
  const pointer = await storage.readPointer();
  if (!pointer?.active) return { valid: false as const, reason: "missing_active_pointer" };
  const raw = await storage.readImmutable(`snapshots/${pointer.active}.json`);
  if (!raw) return { valid: false as const, reason: "missing_active_snapshot" };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { valid: false as const, reason: "invalid_json" };
  }
  const result = verifySnapshot<TData>(parsed);
  if (!result.valid) return result;
  if (result.snapshot.hash !== pointer.active) return { valid: false as const, reason: "pointer_identity_mismatch" };
  return result;
}

export function engineSnapshotReadMode(value = process.env.ENGINE_SNAPSHOT_READ_MODE): EngineSnapshotReadMode {
  return value === "shadow" || value === "remote" ? value : "bundled";
}

export function createEngineSnapshotReader<TData extends JsonObject>(options: {
  bundledSnapshot: EngineSnapshot<TData>;
  mode?: EngineSnapshotReadMode;
  storage?: EngineSnapshotReadStorage;
}) {
  const bundled = verifySnapshot<TData>(options.bundledSnapshot);
  if (bundled.valid === false) throw new Error(`Invalid bundled engine snapshot: ${bundled.reason}`);
  const mode = options.mode ?? engineSnapshotReadMode();

  return {
    async read(): Promise<EngineSnapshotReadResult<TData>> {
      if (mode === "bundled") return { source: "bundled", snapshot: bundled.snapshot };
      if (!options.storage) return { source: "bundled-fallback", snapshot: bundled.snapshot, reason: "storage_unavailable" };
      try {
        const remote = await readRemote<TData>(options.storage);
        if (mode === "shadow") {
          return {
            source: "bundled",
            snapshot: bundled.snapshot,
            shadow: remote.valid === true ? { valid: true, hash: remote.snapshot.hash } : { valid: false, reason: remote.reason },
          };
        }
        if (remote.valid === true) return { source: "remote", snapshot: remote.snapshot };
        return { source: "bundled-fallback", snapshot: bundled.snapshot, reason: remote.reason };
      } catch (error) {
        return {
          source: "bundled-fallback",
          snapshot: bundled.snapshot,
          reason: error instanceof Error ? error.message : "remote_read_failed",
        };
      }
    },
  };
}
