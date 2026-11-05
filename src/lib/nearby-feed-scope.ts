import { AsyncLocalStorage } from "node:async_hooks";
import { sightingStoreAddressKey } from "./sighting-store-directory-core.ts";
import { miles, type Point } from "../../shared/nearby.ts";
import type { nearbyStoreIndex } from "./nearby.ts";

// Server-only, request-local scope. Never supplied by a client header and never
// changes membership, freshness, visibility, or source policy checks.
const scope = new AsyncLocalStorage<ReadonlySet<string>>();
export function withNearbyFeedScope<T>(
  index: ReturnType<typeof nearbyStoreIndex>,
  origin: Point,
  radius: number,
  work: () => T,
): T {
  const keys = new Set<string>();
  for (const [key, store] of index) {
    if (
      miles(origin, { latitude: store.lat!, longitude: store.lng! }) <= radius
    )
      keys.add(key);
  }
  return scope.run(keys, work);
}
export function filterNearbyFeedDrops<T extends Record<string, unknown>>(
  drops: T[],
): T[] {
  const keys = scope.getStore();
  if (!keys) return drops;
  return drops.filter((drop) => {
    const state = String(drop.state ?? drop.state_code ?? drop.region ?? "")
      .trim()
      .toUpperCase();
    const address = String(drop.store_address ?? drop.storeAddress ?? "");
    const city = String(drop.store_city ?? drop.storeCity ?? drop.city ?? "");
    return Boolean(
      state &&
      address &&
      city &&
      keys.has(sightingStoreAddressKey({ state, address, city })),
    );
  });
}

// The map already bounded its scan to 10,000 rows. Read the geographically
// narrowed retailer slice once instead of repeatedly rebuilding it per 100 rows.
export function nearbyFeedPageLimit(ordinaryLimit: number) {
  return scope.getStore() ? 10_000 : ordinaryLimit;
}
