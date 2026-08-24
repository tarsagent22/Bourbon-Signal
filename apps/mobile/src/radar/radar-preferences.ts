import type { MemberPreferences, MonitoringScope, RadarAreaPreferences } from "../api/types";
import { canonicalBottleKey } from "../interactions/member-interactions";

export const RADAR_AREA_KEYS: Record<string, keyof RadarAreaPreferences> = {
  NC: "ncBoards", GA: "gaAreas", TN: "tnAreas", VA: "vaCities", OH: "ohCities", IA: "iaCities", ID: "idCities",
  SC: "scAreas", CA: "caAreas", NV: "nvAreas", NY: "nyAreas", CO: "coAreas", PA: "paCounties",
};

export function radarStateDisplayCode(state: string) {
  const code = state.trim().toUpperCase();
  return code === "MD-MONTGOMERY" ? "MD" : code;
}

export function radarAreaSummary(areas: string[], statewideLabel = "Statewide") {
  if (!areas.length) return statewideLabel;
  if (areas.length <= 2) return areas.join(" · ");
  return `${areas.slice(0, 2).join(" · ")} +${areas.length - 2} more`;
}

export function memberAlertBottleNames(alert: { bottleName: string; bottleNames?: string[] }, knownBottleNames: string[] = []) {
  const structured = (alert.bottleNames || []).map((value) => value.trim()).filter(Boolean);
  if (structured.length) return Array.from(new Set(structured));
  const summary = alert.bottleName.trim();
  const lowerSummary = summary.toLowerCase();
  const matches: Array<{ name: string; start: number; end: number }> = [];
  for (const name of Array.from(new Set(knownBottleNames.map((value) => value.trim()).filter(Boolean))).sort((left, right) => right.length - left.length)) {
    const needle = name.toLowerCase();
    let start = lowerSummary.indexOf(needle);
    while (start >= 0) {
      const end = start + needle.length;
      if (!matches.some((match) => start < match.end && end > match.start)) {
        matches.push({ name, start, end });
        break;
      }
      start = lowerSummary.indexOf(needle, start + 1);
    }
  }
  if (matches.length) return matches.sort((left, right) => left.start - right.start).map((match) => match.name);
  return [summary || "Bottle signal"];
}

export function maskedPhoneNumber(phone?: string) {
  const digits = String(phone || "").replace(/\D/g, "");
  return digits.length >= 4 ? `••• ••• ${digits.slice(-4)}` : "Verified mobile";
}

export function formatPhoneNumber(phone: string) {
  const digits = phone.replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}

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

export function clearRadarAreas(preferences: RadarAreaPreferences, state: string): RadarAreaPreferences {
  const key = RADAR_AREA_KEYS[state.trim().toUpperCase()];
  return key ? { ...preferences, [key]: [] } : preferences;
}

export function radarAreaCount(preferences: RadarAreaPreferences) {
  return preferences.states.reduce((count, state) => count + Math.max(1, radarAreasForState(preferences, state).length), 0);
}

export function radarMonitoringSummary(scopes: MonitoringScope[]) {
  const states = new Set(scopes.map((scope) => scope.state)).size;
  const locals = scopes.filter((scope) => scope.type !== "state").length;
  return `${states} state${states === 1 ? "" : "s"} · ${locals} local filter${locals === 1 ? "" : "s"}`;
}

export function scopesForState(scopes: MonitoringScope[], state: string) {
  const code = state.trim().toUpperCase();
  return scopes.filter((scope) => scope.state === code);
}

export function setStatewideScope(scopes: MonitoringScope[], state: { code: string; name: string }) {
  return [...scopes.filter((scope) => scope.state !== state.code), { type: "state" as const, id: `state:${state.code}`, state: state.code, label: state.name }];
}

export function toggleMonitoringScope(scopes: MonitoringScope[], scope: MonitoringScope) {
  const withoutStatewide = scopes.filter((item) => !(item.state === scope.state && item.type === "state"));
  return withoutStatewide.some((item) => item.id === scope.id)
    ? withoutStatewide.filter((item) => item.id !== scope.id)
    : [...withoutStatewide, scope];
}

export function stopMonitoringState(scopes: MonitoringScope[], state: string) {
  return scopes.filter((scope) => scope.state !== state.trim().toUpperCase());
}

export function alertIsStale(alert: { signalAt?: string; createdAt: string; freshnessLimitHours?: number }, now = new Date()) {
  const observed = Date.parse(alert.signalAt || alert.createdAt);
  const limit = typeof alert.freshnessLimitHours === "number" && alert.freshnessLimitHours > 0 ? alert.freshnessLimitHours : 72;
  return Number.isFinite(observed) && now.getTime() - observed >= limit * 60 * 60 * 1_000;
}
