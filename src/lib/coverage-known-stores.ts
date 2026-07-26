import type { CoverageStoreInput } from "./coverage-model";

function normalizedIdentity(value: unknown) {
  return typeof value === "string"
    ? value.toLowerCase().replace(/[^a-z0-9]+/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function storeKey(store: CoverageStoreInput) {
  const state = normalizedIdentity(store.state).toUpperCase();
  const id = normalizedIdentity(store.id || store.sourceStoreId);
  return state && id ? `${state}:${id}` : "";
}

function sameReviewedIdentity(reviewed: CoverageStoreInput, runtime: CoverageStoreInput) {
  return normalizedIdentity(reviewed.name) === normalizedIdentity(runtime.name)
    && normalizedIdentity(reviewed.address) === normalizedIdentity(runtime.address)
    && normalizedIdentity(reviewed.city) === normalizedIdentity(runtime.city)
    && normalizedIdentity(reviewed.county) === normalizedIdentity(runtime.county);
}

export function mergeCoverageStores(
  reviewedStores: readonly CoverageStoreInput[],
  runtimeStores: readonly CoverageStoreInput[],
) {
  const byKey = new Map<string, CoverageStoreInput>();
  for (const store of reviewedStores) {
    const key = storeKey(store);
    if (key) byKey.set(key, { ...store });
  }
  for (const runtime of runtimeStores) {
    const key = storeKey(runtime);
    if (!key) continue;
    const reviewed = byKey.get(key);
    if (String(runtime.state || "").toUpperCase() === "MS") {
      if (!reviewed || !sameReviewedIdentity(reviewed, runtime)) continue;
      byKey.set(key, {
        ...reviewed,
        sourceStoreId: runtime.sourceStoreId || reviewed.sourceStoreId,
        source: runtime.source || reviewed.source,
        signalCount: Math.max(Number(reviewed.signalCount || 0), Number(runtime.signalCount || 0)),
      });
      continue;
    }
    byKey.set(key, { ...(reviewed || {}), ...runtime });
  }
  return Array.from(byKey.values());
}
