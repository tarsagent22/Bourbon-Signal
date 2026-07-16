export interface RadarFollowPreference {
  releaseSlug: string;
  marketCodes: string[];
  followedAt: string;
}

export interface RadarPreferences {
  followedReleases: RadarFollowPreference[];
}

export const EMPTY_RADAR_PREFERENCES: RadarPreferences = { followedReleases: [] };

function normalizeSlug(value: unknown) {
  if (typeof value !== "string") return "";
  const slug = value.trim().toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100 ? slug : "";
}

function normalizeMarketCodes(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((market): market is string => typeof market === "string")
    .map((market) => market.trim().toUpperCase())
    .filter((market) => /^(?:[A-Z]{2}|US|MD-MONTGOMERY)$/.test(market))))
    .slice(0, 24);
}

function normalizeTimestamp(value: unknown) {
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) return "";
  return new Date(value).toISOString();
}

export function normalizeRadarPreferences(input: unknown): RadarPreferences {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rows = Array.isArray(source.followedReleases) ? source.followedReleases : [];
  const bySlug = new Map<string, RadarFollowPreference>();

  for (const row of rows) {
    const item = row && typeof row === "object" ? row as Record<string, unknown> : {};
    const releaseSlug = normalizeSlug(item.releaseSlug);
    const followedAt = normalizeTimestamp(item.followedAt);
    if (!releaseSlug || !followedAt) continue;
    const existing = bySlug.get(releaseSlug);
    bySlug.set(releaseSlug, {
      releaseSlug,
      marketCodes: Array.from(new Set([...(existing?.marketCodes || []), ...normalizeMarketCodes(item.marketCodes)])).sort(),
      followedAt: existing && existing.followedAt < followedAt ? existing.followedAt : followedAt,
    });
  }

  return { followedReleases: Array.from(bySlug.values()).slice(0, 100) };
}

export function followRadarRelease(
  current: RadarPreferences,
  releaseSlug: string,
  marketCodes: string[],
  followedAt = new Date().toISOString(),
) {
  const normalized = normalizeRadarPreferences(current);
  const slug = normalizeSlug(releaseSlug);
  const timestamp = normalizeTimestamp(followedAt);
  if (!slug || !timestamp) return normalized;
  const existing = normalized.followedReleases.find((follow) => follow.releaseSlug === slug);
  const next: RadarFollowPreference = {
    releaseSlug: slug,
    marketCodes: Array.from(new Set([...(existing?.marketCodes || []), ...normalizeMarketCodes(marketCodes)])).sort(),
    followedAt: existing?.followedAt || timestamp,
  };
  return {
    followedReleases: [next, ...normalized.followedReleases.filter((follow) => follow.releaseSlug !== slug)].slice(0, 100),
  };
}
