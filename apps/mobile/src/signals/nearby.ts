import { COVERAGE_STATES } from "../../../../shared/coverage-states.ts";
import type { Point, NearbyStore } from "../../../../shared/nearby";
export function placeLookupPath(value: string, defaultState = "") {
  const input = value.trim();
  if (/^\d{5}$/.test(input)) return `/us/${input}`;
  const match = input.match(/^(.+?)[,\s]+([a-z]{2})$/i);
  const city = match?.[1].trim() || input,
    state = (match?.[2] || defaultState).toLowerCase();
  if (!city || !/^[a-z]{2}$/.test(state))
    throw Error("Enter a ZIP code or a city and state, such as Raleigh, NC.");
  return `/us/${state}/${encodeURIComponent(city.toLowerCase())}`;
}
export function parsePlace(value: unknown): Point & { label: string } {
  const d = value as {
    places?: Array<Record<string, string>>;
    state?: string;
    "place name"?: string;
    "state abbreviation"?: string;
  };
  const rows = d?.places || [];
  const valid = rows
    .map((p) => ({
      latitude: Number(p.latitude),
      longitude: Number(p.longitude),
    }))
    .filter(
      (p) =>
        Number.isFinite(p.latitude) &&
        Number.isFinite(p.longitude) &&
        Math.abs(p.latitude) <= 90 &&
        Math.abs(p.longitude) <= 180,
    );
  if (!valid.length) throw Error("Location not found. Try a nearby ZIP code.");
  return {
    latitude: valid.reduce((n, p) => n + p.latitude, 0) / valid.length,
    longitude: valid.reduce((n, p) => n + p.longitude, 0) / valid.length,
    label: [
      d["place name"] || rows[0]["place name"],
      d["state abbreviation"] || rows[0]["state abbreviation"] || d.state,
    ]
      .filter(Boolean)
      .join(", "),
  };
}
export function storeMapUrl(
  store: Pick<NearbyStore, "address" | "city" | "state">,
  directions = false,
) {
  return `https://www.google.com/maps/${directions ? "dir" : "search"}/?api=1&${directions ? "destination" : "query"}=${encodeURIComponent(`${store.address}, ${store.city}, ${store.state}`)}`;
}
export function nearbyVisible(
  stores: NearbyStore[],
  radius: number,
  watchOnly: boolean,
  watched: string[],
) {
  const names = new Set(watched.map((n) => n.trim().toLowerCase()));
  return stores
    .filter((s) => s.distance <= radius)
    .map((s) => ({
      ...s,
      signals: s.signals.filter(
        (signal) =>
          !watchOnly || names.has(signal.bottle.name.trim().toLowerCase()),
      ),
    }))
    .filter((s) => s.signals.length);
}

// Use the installed location module, bounded so a slow geocoder cannot hold the map.
export async function currentPlaceWithCity(
  point: Point,
  reverse: (point: Point) => Promise<
    Array<{
      city?: string | null;
      region?: string | null;
      isoCountryCode?: string | null;
    }>
  >,
  budgetMs = 1200,
): Promise<Point & { label: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const results = await Promise.race([
      reverse(point),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), budgetMs);
      }),
    ]);
    const address = results?.[0];
    const region = address?.region?.trim().toLowerCase();
    const state = COVERAGE_STATES.find(
      (s) => s.code.toLowerCase() === region || s.name.toLowerCase() === region,
    );
    if (address?.isoCountryCode === "US" && address.city?.trim() && state)
      return { ...point, label: `${address.city.trim()}, ${state.code}` };
  } catch {
    /* Coordinates remain useful when reverse geocoding is unavailable. */
  } finally {
    clearTimeout(timer);
  }
  return { ...point, label: "Current location" };
}

export function appleStoreDirectionsUrl(
  store: Pick<
    NearbyStore,
    | "address"
    | "city"
    | "state"
    | "latitude"
    | "longitude"
    | "approximateLocation"
  >,
) {
  const destination = store.approximateLocation
    ? `${store.address}, ${store.city}, ${store.state}`
    : `${store.latitude},${store.longitude}`;
  return `https://maps.apple.com/?daddr=${encodeURIComponent(destination)}&dirflg=d`;
}
