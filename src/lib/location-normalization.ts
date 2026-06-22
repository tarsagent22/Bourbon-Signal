export function normalizeStateCodeParam(value?: string | null) {
  const raw = String(value || "").trim().toUpperCase();
  if (!raw || raw === "ALL") return null;
  if (raw === "MD") return "MD-MONTGOMERY";
  return raw;
}

export function publicStateCode(value?: string | null) {
  const code = String(value || "").trim().toUpperCase();
  if (code === "MD-MONTGOMERY") return "MD";
  return code;
}

export function normalizeLocationText(value?: string | null) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripLocationSuffixes(value: string) {
  return value
    .replace(/\babc\b/g, " ")
    .replace(/\babs\b/g, " ")
    .replace(/\bboard\b/g, " ")
    .replace(/\bcounty\b/g, " ")
    .replace(/\bco\b/g, " ")
    .replace(/\bstores?\b/g, " ")
    .replace(/\bstore\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function locationMatchKeys(value?: string | null) {
  const normalized = normalizeLocationText(value);
  if (!normalized) return [];
  const keys = new Set<string>([normalized]);
  const stripped = stripLocationSuffixes(normalized);
  if (stripped && stripped.length >= 4) keys.add(stripped);
  const abcMatch = normalized.match(/^(.+?)\s+abc(?:\s+board)?$/);
  if (abcMatch?.[1] && abcMatch[1].trim().length >= 4) keys.add(abcMatch[1].trim());
  const countyMatch = normalized.match(/^(.+?)\s+county(?:\s+abc(?:\s+board)?)?$/);
  if (countyMatch?.[1] && countyMatch[1].trim().length >= 4) keys.add(countyMatch[1].trim());
  return Array.from(keys).filter((key) => key.length >= 2);
}

export function locationLabelsMatch(a?: string | null, b?: string | null) {
  const aKeys = locationMatchKeys(a);
  const bKeys = locationMatchKeys(b);
  if (!aKeys.length || !bKeys.length) return false;
  return aKeys.some((left) =>
    bKeys.some((right) =>
      left === right ||
      (left.length >= 4 && right.includes(left)) ||
      (right.length >= 4 && left.includes(right))
    )
  );
}

export function locationMatchesAny(haystackValues: Array<unknown>, needles: string[]) {
  const haystack = haystackValues
    .filter((value): value is string => typeof value === "string" && value.trim().length > 0);
  return needles.some((needle) => haystack.some((value) => locationLabelsMatch(value, needle)));
}
