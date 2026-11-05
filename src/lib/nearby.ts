import reviewedCoordinates from "../data/reviewed-store-coordinates.json";
import { normalizeMapStore } from "./store-map.ts";
import { sightingStoreAddressKey } from "./sighting-store-directory-core.ts";
import {
  miles,
  validPoint,
  type NearbyStore,
  type Point,
} from "../../shared/nearby.ts";
import type { Signal } from "../../apps/mobile/src/api/types.ts";
const reviewedById = new Map(
  reviewedCoordinates.stores.map((store) => [store.id, store]),
);
export function nearbyStoreIndex(raw: Record<string, unknown>[]) {
  const index = new Map<string, ReturnType<typeof normalizeMapStore>>(),
    conflicts = new Set<string>();
  for (const row of raw) {
    const normalized = normalizeMapStore(row);
    const proof = reviewedById.get(normalized.id);
    const needsCoordinates =
      !Number.isFinite(normalized.lat) ||
      !Number.isFinite(normalized.lng) ||
      (normalized.lat === 0 && normalized.lng === 0);
    const exactProof =
      proof &&
      normalized.address &&
      sightingStoreAddressKey(
        normalized as { state: string; city: string; address: string },
      ) === sightingStoreAddressKey(proof);
    const s =
      needsCoordinates && exactProof
        ? { ...normalized, lat: proof.lat, lng: proof.lng, isMappable: true }
        : normalized;
    const point = { latitude: s.lat!, longitude: s.lng! };
    if (
      !s.isMappable ||
      s.precision !== "store" ||
      !s.city ||
      !s.state ||
      !validPoint(point) ||
      (point.latitude === 0 && point.longitude === 0)
    )
      continue;
    const key = sightingStoreAddressKey({
      state: s.state,
      address: s.address!,
      city: s.city,
    });
    const previous = index.get(key);
    if (
      previous &&
      miles(point, { latitude: previous.lat!, longitude: previous.lng! }) > 0.25
    ) {
      conflicts.add(key);
      continue;
    }
    index.set(key, s);
  }
  for (const key of conflicts) index.delete(key);
  return index;
}
export function addNearbySignals(
  signals: Signal[],
  index: ReturnType<typeof nearbyStoreIndex>,
  origin: Point,
  radius: number,
  found: Map<string, NearbyStore>,
) {
  let unmapped = 0;
  for (const signal of signals) {
    if (signal.location.scope !== "exact_store") continue;
    const store = signal.location.store;
    if (!store?.address || !store.state || !store.city) {
      unmapped++;
      continue;
    }
    const key = sightingStoreAddressKey({
        state: store.state,
        address: store.address,
        city: store.city,
      }),
      s = index.get(key);
    if (!s) {
      unmapped++;
      continue;
    }
    const point = { latitude: s.lat!, longitude: s.lng! },
      distance = miles(origin, point);
    if (distance > radius) continue;
    const entry = found.get(key) || {
      ...point,
      id: key,
      name: s.displayLabel,
      address: s.address!,
      city: s.city,
      state: s.state,
      distance,
      signals: [],
    };
    if (!entry.signals.some((item) => item.id === signal.id))
      entry.signals.push(signal);
    found.set(key, entry);
  }
  return unmapped;
}
