export const RETAILER_TIME_ZONES = [
  { value: "America/New_York", label: "Eastern Time" },
  { value: "America/Chicago", label: "Central Time" },
  { value: "America/Denver", label: "Mountain Time" },
  { value: "America/Phoenix", label: "Arizona Time" },
  { value: "America/Los_Angeles", label: "Pacific Time" },
  { value: "America/Anchorage", label: "Alaska Time" },
  { value: "Pacific/Honolulu", label: "Hawaii Time" },
] as const;

export type RetailerTimeZone = typeof RETAILER_TIME_ZONES[number]["value"];

const allowedTimeZones = new Set<string>(RETAILER_TIME_ZONES.map((zone) => zone.value));

const stateTimeZones: Record<string, RetailerTimeZone> = {
  AL: "America/Chicago", AR: "America/Chicago", AZ: "America/Phoenix", CA: "America/Los_Angeles",
  CO: "America/Denver", CT: "America/New_York", DC: "America/New_York", DE: "America/New_York",
  FL: "America/New_York", GA: "America/New_York", HI: "Pacific/Honolulu", IA: "America/Chicago",
  ID: "America/Denver", IL: "America/Chicago", IN: "America/New_York", KS: "America/Chicago",
  KY: "America/New_York", LA: "America/Chicago", MA: "America/New_York", MD: "America/New_York",
  ME: "America/New_York", MI: "America/New_York", MN: "America/Chicago", MO: "America/Chicago",
  MS: "America/Chicago", MT: "America/Denver", NC: "America/New_York", ND: "America/Chicago",
  NE: "America/Chicago", NH: "America/New_York", NJ: "America/New_York", NM: "America/Denver",
  NV: "America/Los_Angeles", NY: "America/New_York", OH: "America/New_York", OK: "America/Chicago",
  OR: "America/Los_Angeles", PA: "America/New_York", RI: "America/New_York", SC: "America/New_York",
  SD: "America/Chicago", TN: "America/Chicago", TX: "America/Chicago", UT: "America/Denver",
  VA: "America/New_York", VT: "America/New_York", WA: "America/Los_Angeles", WI: "America/Chicago",
  WV: "America/New_York", WY: "America/Denver", AK: "America/Anchorage",
};

const MULTI_ZONE_STATES = new Set(["FL", "ID", "IN", "KS", "KY", "MI", "NE", "ND", "OR", "SD", "TN", "TX"]);

function stateFromAddress(address: string) {
  return address.toUpperCase().match(/\b([A-Z]{2})\s+\d{5}(?:-\d{4})?\b/)?.[1] || "";
}

export function retailerTimeZoneNeedsChoice(address: string) {
  return MULTI_ZONE_STATES.has(stateFromAddress(address));
}

export function normalizeRetailerTimeZone(value: unknown, fallback: RetailerTimeZone = "America/New_York") {
  return typeof value === "string" && allowedTimeZones.has(value) ? value as RetailerTimeZone : fallback;
}

export function inferRetailerTimeZone(address: string): RetailerTimeZone {
  return stateTimeZones[stateFromAddress(address)] || "America/New_York";
}

function partsAt(timestamp: number, timeZone: RetailerTimeZone) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(timestamp));
  const values = Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, Number(part.value)]));
  return {
    year: values.year,
    month: values.month,
    day: values.day,
    hour: values.hour,
    minute: values.minute,
    second: values.second,
  };
}

export function zonedLocalDateTimeToIso(value: string, requestedTimeZone: unknown) {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/.test(value)) {
    const absolute = new Date(value);
    return Number.isNaN(absolute.getTime()) ? null : absolute.toISOString();
  }

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
  if (!match) return null;
  const timeZone = normalizeRetailerTimeZone(requestedTimeZone);
  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] || 0),
  };
  const desiredAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, desired.second);
  let candidate = desiredAsUtc;

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = partsAt(candidate, timeZone);
    const actualAsUtc = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    const adjustment = desiredAsUtc - actualAsUtc;
    candidate += adjustment;
    if (adjustment === 0) break;
  }

  const verified = partsAt(candidate, timeZone);
  const matchesDesired = (parts: ReturnType<typeof partsAt>) => !Object.entries(desired)
    .some(([key, number]) => parts[key as keyof typeof parts] !== number);
  if (!matchesDesired(verified)) return null;

  // Fall-back transitions repeat a block of local time. Reject those rare ambiguous
  // values rather than guessing which occurrence the retailer intended.
  for (let offsetMinutes = -180; offsetMinutes <= 180; offsetMinutes += 15) {
    if (offsetMinutes === 0) continue;
    if (matchesDesired(partsAt(candidate + offsetMinutes * 60_000, timeZone))) return null;
  }

  return new Date(candidate).toISOString();
}
