import { list } from "@vercel/blob";
import type { RemoteSnapshotStorage } from "./remote-site-snapshot";

const ACTIVE_POINTER = "engine/active.json";
const ACTIVE_POINTER_EVENTS = "engine/pointer-events/";

async function exactBlob(pathname: string) {
  if (pathname === ACTIVE_POINTER) {
    const events = await list({ prefix: ACTIVE_POINTER_EVENTS, limit: 1000, token: process.env.BLOB_READ_WRITE_TOKEN });
    const newest = events.blobs.slice().sort((left, right) => left.pathname.localeCompare(right.pathname))[0];
    if (newest) return newest;
  }
  const result = await list({ prefix: pathname, limit: 100, token: process.env.BLOB_READ_WRITE_TOKEN });
  return result.blobs.find((blob) => blob.pathname === pathname) ?? null;
}

export class VercelBlobSnapshotStorage implements RemoteSnapshotStorage {
  private origin?: string;

  async readObject(pathname: string) {
    const immutable = pathname.startsWith("engine/snapshots/");
    // The publisher writes immutable files without random suffixes. Reuse the
    // trusted origin returned by Blob list; the manifest and object bytes are
    // still verified by the snapshot reader.
    if (immutable && this.origin && /^[a-zA-Z0-9_./-]+$/.test(pathname) && !pathname.includes("..")) {
      const response = await fetch(new URL(`/${pathname}`, this.origin), { cache: "no-store" });
      if (response.ok) return response.text();
      if (response.status !== 404) throw new Error(`Engine snapshot object read failed with HTTP ${response.status}`);
    }
    const blob = await exactBlob(pathname);
    if (!blob) return null;
    const url = new URL(blob.url);
    this.origin = url.origin;
    if (pathname === ACTIVE_POINTER) {
      url.searchParams.set("_engine_pointer", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    }
    const response = await fetch(url, { cache: "no-store", ...(!immutable && { headers: { "cache-control": "no-cache" } }) });
    if (!response.ok) throw new Error(`Engine snapshot object read failed with HTTP ${response.status}`);
    return response.text();
  }

  async readPointer() {
    const raw = await this.readObject("engine/active.json");
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  }
}
