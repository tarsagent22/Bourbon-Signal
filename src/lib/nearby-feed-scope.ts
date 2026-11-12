import { AsyncLocalStorage } from "node:async_hooks";
import { sightingStoreAddressKey } from "./sighting-store-directory-core.ts";
import { miles, type Point } from "../../shared/nearby.ts";
import type { nearbyStoreIndex } from "./nearby.ts";
import { boardDropName } from "./nearby-boards.ts";

// Server-only, request-local scope. Never supplied by a client header and never
// changes membership, freshness, visibility, or source policy checks.
const scope = new AsyncLocalStorage<{
  keys: ReadonlySet<string>;
  mapped: ReadonlySet<string>;
  cities: ReadonlySet<string>;
  boards: ReadonlySet<string>;
}>();
export const nearbyCityKey = (state: string, city: string) =>
  sightingStoreAddressKey({
    state: state.trim().toUpperCase(),
    city,
    address: "",
  });
export function withNearbyFeedScope<T>(
  index: ReturnType<typeof nearbyStoreIndex>,
  origin: Point,
  radius: number,
  work: () => T,
  place?: { state: string; city: string },
  boards: ReadonlySet<string> = new Set(),
): T {
  const keys = new Set<string>();
  const cities = new Set<string>();
  if (
    place &&
    /^[A-Z]{2}$/.test(place.state) &&
    place.city.trim() &&
    place.city.length <= 100
  )
    cities.add(nearbyCityKey(place.state, place.city));
  for (const [key, store] of index) {
    if (
      miles(origin, { latitude: store.lat!, longitude: store.lng! }) <= radius
    ) {
      keys.add(key);
      cities.add(nearbyCityKey(store.state, store.city));
    }
  }
  return scope.run(
    { keys, mapped: new Set(index.keys()), cities, boards },
    work,
  );
}
export function nearbyMemberSightingFilter() {
  const selection = scope.getStore();
  if (!selection) return undefined;
  return (sighting: import("./sightings.ts").MemberSighting) => {
    if (sighting.sightingType === "online_social") return false;
    const state = sighting.storeState?.trim().toUpperCase() || "";
    const city = sighting.storeCity || "";
    const address = sighting.storeAddress || "";
    return Boolean(state && city && address && selection.keys.has(sightingStoreAddressKey({ state, city, address })));
  };
}

export function filterNearbyFeedDrops<T extends Record<string, unknown>>(
  drops: T[],
): T[] {
  const selection = scope.getStore();
  if (!selection) return drops;
  return drops.filter((drop) => {
    const board = boardDropName(drop);
    if (board) return selection.boards.has(board);
    const state = String(drop.state ?? drop.state_code ?? drop.region ?? "")
      .trim()
      .toUpperCase();
    const address = String(drop.store_address ?? drop.storeAddress ?? "");
    const city = String(drop.store_city ?? drop.storeCity ?? drop.city ?? "");
    if (!state || !city) return false;
    const key = address
      ? sightingStoreAddressKey({ state, address, city })
      : "";
    return (
      selection.keys.has(key) ||
      (!selection.mapped.has(key) &&
        selection.cities.has(nearbyCityKey(state, city)))
    );
  });
}

// The map already bounded its scan to 10,000 rows. Read the geographically
// narrowed retailer slice once instead of repeatedly rebuilding it per 100 rows.
export function nearbyFeedPageLimit(ordinaryLimit: number) {
  return scope.getStore() ? 10_000 : ordinaryLimit;
}

export function nearbySearchCities(
  index: ReturnType<typeof nearbyStoreIndex>,
  origin: Point,
  radius: number,
  place?: { state: string; city: string },
) {
  const cities = new Set<string>();
  if (
    place &&
    /^[A-Z]{2}$/.test(place.state) &&
    place.city.trim() &&
    place.city.length <= 100
  )
    cities.add(nearbyCityKey(place.state, place.city));
  for (const store of index.values())
    if (
      miles(origin, { latitude: store.lat!, longitude: store.lng! }) <= radius
    )
      cities.add(nearbyCityKey(store.state, store.city));
  return cities;
}
