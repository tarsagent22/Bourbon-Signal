import type { NearbyResult } from "../../../../shared/nearby";
import { validPoint } from "../../../../shared/nearby";

const MAX_AGE = 60 * 60 * 1000;
const MAX_BYTES = 600_000;

async function cacheKey(account: string, scope: string) {
  if (!/^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+:\d+$/.test(account)) return null;
  const fs = await import("expo-file-system/legacy");
  const crypto = await import("expo-crypto");
  if (!fs.cacheDirectory) return null;
  const owner = await crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, account);
  const key = await crypto.digestStringAsync(crypto.CryptoDigestAlgorithm.SHA256, scope);
  return { fs, path: fs.cacheDirectory + "nearby-" + owner + ".json", key };
}

export async function loadNearbyPins(account: string, scope: string): Promise<NearbyResult | null> {
  const cache = await cacheKey(account, scope);
  if (!cache) return null;
  const raw = await cache.fs.readAsStringAsync(cache.path).catch(() => "");
  if (!raw || raw.length > MAX_BYTES) return null;
  const { key, savedAt, result } = JSON.parse(raw);
  if (key !== cache.key || !Number.isFinite(savedAt) || savedAt > Date.now() || Date.now() - savedAt >= MAX_AGE) return null;
  const valid = (rows: NearbyResult["stores"]) => Array.isArray(rows) && rows.every(row => validPoint(row) && Array.isArray(row.signals));
  return result && !result.previewLocked && !result.partial && valid(result.stores) && valid(result.boards || []) ? result : null;
}

export async function saveNearbyPins(account: string, scope: string, result: NearbyResult | null) {
  const cache = await cacheKey(account, scope);
  if (!cache) return;
  if (!result || result.previewLocked) {
    await cache.fs.deleteAsync(cache.path, { idempotent: true });
  } else if (!result.partial) {
    const raw = JSON.stringify({ key: cache.key, savedAt: Date.now(), result });
    if (raw.length <= MAX_BYTES) await cache.fs.writeAsStringAsync(cache.path, raw);
  }
}
