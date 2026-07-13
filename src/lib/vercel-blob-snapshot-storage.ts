import { list } from "@vercel/blob";
import type { RemoteSnapshotStorage } from "./remote-site-snapshot";

async function exactBlob(pathname: string) {
  const result = await list({ prefix: pathname, limit: 100, token: process.env.BLOB_READ_WRITE_TOKEN });
  return result.blobs.find((blob) => blob.pathname === pathname) ?? null;
}

export class VercelBlobSnapshotStorage implements RemoteSnapshotStorage {
  async readObject(pathname: string) {
    const blob = await exactBlob(pathname);
    if (!blob) return null;
    const url = new URL(blob.url);
    if (pathname === "engine/active.json") {
      url.searchParams.set("_engine_pointer", `${Date.now()}-${Math.random().toString(16).slice(2)}`);
    }
    const response = await fetch(url, { cache: "no-store", headers: { "cache-control": "no-cache" } });
    if (!response.ok) throw new Error(`Engine snapshot object read failed with HTTP ${response.status}`);
    return response.text();
  }

  async readPointer() {
    const raw = await this.readObject("engine/active.json");
    return raw ? JSON.parse(raw) as Record<string, unknown> : null;
  }
}
