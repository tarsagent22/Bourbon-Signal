import type { MemberPreferences, RadarAreaPreferences } from "../api/types";
import { canonicalBottleKey } from "../interactions/member-interactions";

export const RADAR_AREA_KEYS: Record<string, keyof RadarAreaPreferences> = {
  NC: "ncBoards", GA: "gaAreas", TN: "tnAreas", VA: "vaCities", OH: "ohCities", IA: "iaCities", ID: "idCities",
  SC: "scAreas", CA: "caAreas", NV: "nvAreas", NY: "nyAreas", CO: "coAreas", PA: "paCounties",
};

export function watchedBottleCount(preferences: MemberPreferences) {
  return new Set([...preferences.bottleAlertPreferences.bottleKeys, ...preferences.bottleAlertPreferences.bottleNames.map(canonicalBottleKey)].filter(Boolean)).size;
}

export function setBottleWatched(preferences: MemberPreferences, bottleName: string, watched: boolean) {
  const name = bottleName.trim();
  const key = canonicalBottleKey(name);
  const currentNames = preferences.bottleAlertPreferences.bottleNames.filter((value) => canonicalBottleKey(value) !== key);
  const currentKeys = preferences.bottleAlertPreferences.bottleKeys.filter((value) => canonicalBottleKey(value) !== key);
  if (!watched) return { bottleNames: currentNames, bottleKeys: currentKeys };
  const limit = preferences.entitlements?.trackedBottleLimit;
  if (typeof limit === "number" && watchedBottleCount(preferences) >= limit) throw new Error(`Your membership includes ${limit} watched bottle${limit === 1 ? "" : "s"}.`);
  return { bottleNames: [...currentNames, name], bottleKeys: [...currentKeys, key] };
}

export function radarAreasForState(preferences: RadarAreaPreferences, state: string) {
  const key = RADAR_AREA_KEYS[state];
  return key ? preferences[key] : [];
}

export function setRadarState(preferences: RadarAreaPreferences, state: string, enabled: boolean): RadarAreaPreferences {
  const code = state.trim().toUpperCase();
  const states = enabled ? Array.from(new Set([...preferences.states, code])) : preferences.states.filter((value) => value !== code);
  const next = { ...preferences, states };
  const key = RADAR_AREA_KEYS[code];
  return !enabled && key ? { ...next, [key]: [] } : next;
}

export function toggleRadarArea(preferences: RadarAreaPreferences, state: string, area: string): RadarAreaPreferences {
  const code = state.trim().toUpperCase();
  const key = RADAR_AREA_KEYS[code];
  if (!key) return setRadarState(preferences, code, true);
  const current = preferences[key];
  const selected = current.includes(area) ? current.filter((value) => value !== area) : [...current, area];
  return { ...preferences, states: Array.from(new Set([...preferences.states, code])), [key]: selected };
}

export function radarAreaCount(preferences: RadarAreaPreferences) {
  return preferences.states.reduce((count, state) => count + Math.max(1, radarAreasForState(preferences, state).length), 0);
}

export function alertIsStale(alert: { signalAt?: string; createdAt: string; freshnessLimitHours?: number }, now = new Date()) {
  const observed = Date.parse(alert.signalAt || alert.createdAt);
  const limit = typeof alert.freshnessLimitHours === "number" && alert.freshnessLimitHours > 0 ? alert.freshnessLimitHours : 72;
  return Number.isFinite(observed) && now.getTime() - observed >= limit * 60 * 60 * 1_000;
}
