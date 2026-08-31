import type { SignalAreaDirectory, SignalFeedFilters } from "../signals/feed-filters";

export const TRIP_MODE_STORAGE_KEY = "bourbon-signal.home.trip-mode.v1";

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
