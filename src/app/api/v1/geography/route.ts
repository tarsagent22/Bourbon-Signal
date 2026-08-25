import { auth } from "@clerk/nextjs/server";
import { unstable_cache } from "next/cache";
import { ACTIVE_ENGINE_STATE_CODES } from "@/lib/activeStates";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { geographyDisplayName, geographyState, listGeographyMatches, listMonitoringStates, type GeographyLevel } from "@/lib/geography-directory";
import { countCommunityActivity } from "@/lib/geography-community-activity";
import { NC_ABC_BOARD_OPTIONS } from "@/lib/nc-abc-boards";
import { listApprovedLocations } from "@/lib/approved-catalog-service";
import { readSiteExport } from "@/lib/site-engine-contract";
import { PRIVATE_SIGNAL_API_HEADERS, signalApiError } from "@/lib/signals/signal-api-route";
import { canonicalCommunityStoreKey, canonicalCommunityStoreMatches, type CanonicalCommunityStore } from "@/lib/community-alert-candidates";

type ApiLevel = GeographyLevel | "board" | "store";
const LEVELS = new Set<ApiLevel>(["state", "county", "city", "board", "store"]);
const INVITE_MESSAGE = "Bourbon Signal sources are still expanding in this area. Invite friends to boost community activity.";

function slug(value: string) { return value.toLowerCase().replace(/&/g, " and ").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""); }
function text(value: unknown) { return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : ""; }

const readGeographyStores = unstable_cache(async () => {
  try {
    const payload = await readSiteExport("stores");
    const engine = Array.isArray(payload?.stores) ? payload.stores as Array<Record<string, unknown>> : [];
    const approved = await listApprovedLocations().catch(() => []);
    const combined: Array<Record<string, unknown>> = [...engine, ...approved.map((store) => store as unknown as Record<string, unknown>)];
    return [...new Map(combined.flatMap((store) => {
      const id = text(store.id || store.sourceStoreId);
      const state = geographyState(text(store.state || store.state_code))?.state || "";
      const name = text(store.name || store.displayLabel);
      const address = text(store.address);
      const city = text(store.city || store.storeCity);
      const zip = text(store.zip || store.postalCode || store.postal_code);
      return id && state && name && address && city ? [[`${state}:${id}`, { id, state, name, address, city, zip }] as const] : [];
    })).values()];
  } catch (error) {
    console.warn("Radar geography store directory unavailable", error instanceof Error ? error.message : "unknown error");
    return [];
  }
}, ["radar-geography-stores-v1"], { revalidate: 300 });

const readRecentGeographyActivity = unstable_cache(async (state: string) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    return await createCommunitySightingsRepository().listRecentGeographyActivity(state, since);
  } catch (error) {
    console.warn("Radar geography Community activity unavailable", error instanceof Error ? error.message : "unknown error");
    return [];
  }
}, ["radar-geography-community-activity-v1"], { revalidate: 60 });

export async function GET(request: Request) {
  const { userId } = await auth();
  if (!userId) return signalApiError(401, "UNAUTHORIZED", "Sign in to search monitoring geography.");
  const url = new URL(request.url);
  const state = text(url.searchParams.get("state")).toUpperCase();
  if (state && !/^[A-Z]{2}$/.test(state)) return signalApiError(400, "INVALID_REQUEST", "State must use a two-letter code.");
  const requestedLevels = text(url.searchParams.get("levels") || "state,county,city,board,store").split(",").filter((level): level is ApiLevel => LEVELS.has(level as ApiLevel));
  if (!requestedLevels.length) return signalApiError(400, "INVALID_REQUEST", "At least one valid geography level is required.");
  const query = text(url.searchParams.get("query") || url.searchParams.get("q")).slice(0, 120);
  const limit = Math.max(1, Math.min(50, Number(url.searchParams.get("limit")) || 25));
  const offset = Math.max(0, Math.min(10_000, Number(url.searchParams.get("offset")) || 0));
  const staticLevels = requestedLevels.filter((level): level is GeographyLevel => level === "state" || level === "county" || level === "city");
  const staticResults = staticLevels.length ? listGeographyMatches({ state: state || undefined, levels: staticLevels, query }) : [];

  const [stores, recentActivityRows] = await Promise.all([
    readGeographyStores(),
    readRecentGeographyActivity(state),
  ]);
  const canonicalStores = new Map<string, CanonicalCommunityStore>(stores.map((store) => [canonicalCommunityStoreKey(store.state, store.id), store]));
  const recentSightings = recentActivityRows.filter((row) => {
    const canonical = canonicalStores.get(canonicalCommunityStoreKey(row.storeState, row.storeId));
    return Boolean(canonical && canonicalCommunityStoreMatches(canonical, row));
  });
  const activeEngineStates = new Set(ACTIVE_ENGINE_STATE_CODES.map((code) => geographyState(code)?.state || code));
  const decorate = (entry: { id: string; level: ApiLevel; state: string; name: string; subtitle: string | null; rawId?: string; address?: string; city?: string; zip?: string }) => {
    const count = countCommunityActivity(recentSightings, entry);
    const engineStatus = activeEngineStates.has(entry.state) ? "active" as const : "expanding" as const;
    return {
      id: entry.id, level: entry.level, state: entry.state, name: entry.name,
      displayName: entry.level === "city" ? geographyDisplayName(entry.name) : entry.name,
      subtitle: entry.subtitle,
      storeId: entry.rawId,
      address: entry.address,
      city: entry.city,
      zip: entry.zip || undefined,
      coverage: {
        engine: { status: engineStatus },
        community: { active: count > 0, recentSightings: count, windowDays: 7 },
      },
      message: engineStatus === "expanding" && count === 0 ? INVITE_MESSAGE : null,
    };
  };
  const dynamic = [
    ...(requestedLevels.includes("board") && (!state || state === "NC") ? NC_ABC_BOARD_OPTIONS.map((name) => ({ id: `board:NC:${slug(name)}`, level: "board" as const, state: "NC", name, subtitle: null })) : []),
    ...(requestedLevels.includes("store") ? stores.map((store) => ({ id: `store:${store.state}:${store.id}`, level: "store" as const, state: store.state, name: store.name, subtitle: `${store.city} · ${store.address}`, rawId: store.id, address: store.address, city: store.city, zip: store.zip })) : []),
  ].filter((entry) => (!state || entry.state === state) && (!query || `${entry.name} ${entry.subtitle || ""}`.toLowerCase().includes(query.toLowerCase())));
  const combined = [...staticResults.map((entry) => ({ ...entry, name: entry.name, subtitle: null })), ...dynamic]
    .sort((left, right) => left.state.localeCompare(right.state) || left.level.localeCompare(right.level) || left.name.localeCompare(right.name));
  const results = combined.slice(offset, offset + limit).map(decorate);
  return Response.json({
    contractVersion: "bourbon-signal/mobile-api@1",
    states: listMonitoringStates(),
    results,
    offset,
    limit,
    hasMore: offset + results.length < combined.length,
  }, { headers: PRIVATE_SIGNAL_API_HEADERS });
}
