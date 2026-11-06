import { nearbyCityKey } from "./nearby-feed-scope.ts";
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
const reviewedByPremise = new Map(
  reviewedCoordinates.stores.map((store) => [
    `${store.id}:${sightingStoreAddressKey(store)}`,
    store,
  ]),
);
export function nearbyStoreIndex(
  raw: Record<string, unknown>[],
  supplemental: Record<string, unknown>[] = [],
) {
  const index = new Map<string, ReturnType<typeof normalizeMapStore>>(),
    conflicts = new Set<string>();
  const priorityByKey = new Map<string, number>();
  for (const { row, sourcePriority } of [
    ...raw.map((row) => ({ row, sourcePriority: 2 })),
    ...supplemental.map((row) => ({ row, sourcePriority: 1 })),
  ]) {
    const original = normalizeMapStore(row);
    // These sources identify one physical destination even when their legacy
    // directory type says county_board. Keep broad board/warehouse rows excluded.
    const exactPremise = Boolean(
      original.address &&
      original.city &&
      (row.precision === "store_equivalent_shipment" ||
        (row.precision === "distillery" &&
          /gift shop/i.test(original.displayLabel))),
    );
    const normalized = exactPremise
      ? { ...original, precision: "store" as const }
      : original;
    const proof =
      normalized.address && normalized.city && normalized.state
        ? reviewedByPremise.get(
            `${normalized.id}:${sightingStoreAddressKey({ state: normalized.state, city: normalized.city, address: normalized.address })}`,
          )
        : undefined;
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
        ? {
            ...normalized,
            lat: proof.lat,
            lng: proof.lng,
            isMappable: true,
            coordinateMethod:
              "coordinateMethod" in proof &&
              proof.coordinateMethod === "address_interpolation"
                ? ("address_interpolation" as const)
                : undefined,
          }
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
    const priority = needsCoordinates && exactProof ? 0 : sourcePriority;
    if (previous) {
      if ((priorityByKey.get(key) ?? 0) < priority) {
        // Current source positions win over bundled positions and address fallbacks.
        conflicts.delete(key);
      } else if ((priorityByKey.get(key) ?? 0) > priority) {
        continue;
      } else if (
        miles(point, { latitude: previous.lat!, longitude: previous.lng! }) >
        0.25
      ) {
        conflicts.add(key);
        continue;
      }
    }
    index.set(key, s);
    priorityByKey.set(key, priority);
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
    if (signal.shipment) continue;
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
      approximateLocation: s.coordinateMethod === "address_interpolation",
      signals: [],
    };
    if (!entry.signals.some((item) => item.id === signal.id))
      entry.signals.push(signal);
    found.set(key, entry);
  }
  return unmapped;
}

export function unlocatedNearbySignals(
  signals: Signal[],
  index: ReturnType<typeof nearbyStoreIndex>,
  cities: ReadonlySet<string>,
) {
  return signals.filter((signal) => {
    if (signal.shipment) return false;
    if (signal.location.scope !== "exact_store") return false;
    const store = signal.location.store;
    return Boolean(
      store?.city &&
      store.state &&
      cities.has(nearbyCityKey(store.state, store.city)) &&
      (!store.address ||
        !index.has(
          sightingStoreAddressKey({
            state: store.state,
            city: store.city,
            address: store.address,
          }),
        )),
    );
  });
}
