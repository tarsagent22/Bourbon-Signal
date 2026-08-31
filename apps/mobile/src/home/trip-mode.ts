import type { SignalAreaDirectory, SignalFeedFilters } from "../signals/feed-filters";

const TRIP_MODE_STORAGE_PREFIX = "bourbon-signal.home.trip-mode.v1";

function accountKeyHash(value: string) {
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193);
    second = Math.imul(second ^ code, 0x85ebca6b);
  }
  return `${(first >>> 0).toString(16).padStart(8, "0")}${(second >>> 0).toString(16).padStart(8, "0")}`;
}

export function tripModeStorageKeyForUser(userId: string) {
  return `${TRIP_MODE_STORAGE_PREFIX}.${accountKeyHash(userId)}`;
}

export interface TripModeState {
  state: string;
}

export function tripModeForState(state: string, directory: SignalAreaDirectory | null | undefined): TripModeState | null {
  const code = state.trim().toUpperCase();
  return directory?.states.some((entry) => entry.code === code) ? { state: code } : null;
}

export function parseTripModeState(value: string | null, directory: SignalAreaDirectory | null | undefined): TripModeState | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { version?: unknown; state?: unknown };
    return parsed.version === 1 && typeof parsed.state === "string" ? tripModeForState(parsed.state, directory) : null;
  } catch {
    return null;
  }
}

export function serializeTripModeState(tripMode: TripModeState) {
  return JSON.stringify({ version: 1, state: tripMode.state });
}

export function signalFiltersForTrip(filters: SignalFeedFilters, tripMode: TripModeState | null): SignalFeedFilters {
  if (!tripMode) return filters;
  return { ...filters, state: tripMode.state, area: filters.state === tripMode.state ? filters.area : "" };
}
