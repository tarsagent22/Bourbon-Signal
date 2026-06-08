import { NextResponse } from "next/server";
import { getBottleById, normalizeBottleKey, searchBourbonBible, type BibleBottle } from "@/lib/bourbonBible";
import { normalizeDropForSite, readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";

interface LocalSignal {
  state: string;
  localScore: number;
  label: string;
  verdict: string;
  confidence: "high" | "medium" | "low";
  recentCount90d: number;
  recentCount30d: number;
  lastSeenAt: string | null;
  recentLocations: { label: string; city?: string; state?: string; seenAt: string; signalLabel?: string }[];
  canTrack: boolean;
  trackDisabledReason?: string;
}

function asTime(value: unknown) {
  const time = Date.parse(String(value || ""));
  return Number.isFinite(time) ? time : 0;
}

function dropName(drop: Record<string, unknown>) {
  return String(drop.canonical_name || drop.brand_name || drop.raw_name || drop.tracked_brand_name || "");
}

function dropMatchesBottle(drop: Record<string, unknown>, bottle: BibleBottle) {
  const names = [dropName(drop), String(drop.canonical_id || ""), String(drop.bottle_id || ""), ...(Array.isArray(drop.aliases) ? drop.aliases.map(String) : [])]
    .map(normalizeBottleKey)
    .filter(Boolean);
  const keys = [bottle.id, bottle.canonicalName, bottle.brand, ...bottle.aliases].map(normalizeBottleKey).filter(Boolean);
  return names.some((name) => keys.some((key) => name === key || name.includes(key) || key.includes(name)));
}

function getDropsForBottle(bottle: BibleBottle, state?: string) {
  try {
    const exportPayload = readSiteExport("drops");
    const rawDrops = Array.isArray(exportPayload?.drops) ? exportPayload.drops : [];
    const normalized = rawDrops.map((drop) => normalizeDropForSite(drop as Record<string, unknown>));
    return normalized
      .filter((drop) => !state || String(drop.state || drop.state_code || "").toUpperCase() === state.toUpperCase())
      .filter((drop) => dropMatchesBottle(drop as Record<string, unknown>, bottle))
      .sort((a, b) => asTime(b.timestamp) - asTime(a.timestamp));
  } catch {
    return [];
  }
}

function getLocalSignal(bottle: BibleBottle, state: string): LocalSignal {
  const drops = getDropsForBottle(bottle, state);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const recent90 = drops.filter((drop) => now - asTime(drop.timestamp) <= 90 * day);
  const recent30 = drops.filter((drop) => now - asTime(drop.timestamp) <= 30 * day);
  const lastSeenAt = drops[0]?.timestamp ? String(drops[0].timestamp) : null;
  const uniqueLocations = new Set(recent90.map((drop) => String(drop.store_id || drop.store_name || drop.display_location || drop.board_name || drop.store_city || "")).filter(Boolean));

  const availabilityBase: Record<string, number> = {
    common: 18,
    regional: 34,
    seasonal: 42,
    limited: 58,
    allocated: 72,
    highly_allocated: 84,
    unicorn: 96,
  };

  const recencyBoost = lastSeenAt ? Math.max(0, 18 - Math.floor((now - asTime(lastSeenAt)) / day) / 3) : 0;
  const sightingBoost = Math.min(18, recent90.length * 2.4);
  const spreadBoost = Math.min(10, uniqueLocations.size * 1.5);
  const commonPenalty = bottle.availability === "common" ? Math.min(14, recent90.length * 1.5) : 0;
  const rawLocalScore = Math.max(0, Math.min(100, Math.round((availabilityBase[bottle.availability] ?? 40) + recencyBoost + sightingBoost + spreadBoost - commonPenalty)));
  const localScore = bottle.availability === "common" ? Math.min(32, rawLocalScore) : rawLocalScore;

  const confidence: LocalSignal["confidence"] = recent90.length >= 8 ? "high" : recent90.length >= 2 ? "medium" : "low";
  let label = "Not enough local signal";
  if (bottle.availability === "common") label = "Common shelf bottle";
  else if (localScore >= 90) label = "Extremely rare local find";
  else if (localScore >= 75) label = "Rare in your area";
  else if (localScore >= 58) label = "Worth checking locally";
  else if (localScore >= 36) label = "Moderate local signal";

  let verdict = "Check price and local context before deciding.";
  if (bottle.availability === "common") verdict = "Usually safe to pass unless you specifically want it.";
  else if (localScore >= 82) verdict = "Grab near MSRP if this is a bottle you want.";
  else if (localScore >= 62) verdict = "Worth considering at a fair shelf price.";
  else if (confidence === "low") verdict = "Not enough local history yet; use the national bottle context as a guide.";

  const canTrack = Boolean(bottle.isAlertEligible && bottle.availability !== "common");

  return {
    state,
    localScore,
    label,
    verdict,
    confidence,
    recentCount90d: recent90.length,
    recentCount30d: recent30.length,
    lastSeenAt,
    recentLocations: recent90.slice(0, 5).map((drop) => ({
      label: String(drop.store_name || drop.display_location || drop.board_name || drop.store_city || "Local signal"),
      city: typeof drop.store_city === "string" ? drop.store_city : undefined,
      state: String(drop.state || drop.state_code || ""),
      seenAt: String(drop.timestamp),
      signalLabel: typeof drop.signal_label === "string" ? drop.signal_label : undefined,
    })),
    canTrack,
    trackDisabledReason: canTrack ? undefined : bottle.availability === "common" ? "Alert settings are intentionally disabled for common shelf bottles." : "Tracking is not enabled for this bottle yet.",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const id = url.searchParams.get("id") || "";
  const state = (url.searchParams.get("state") || "NC").toUpperCase();

  const bottle = id ? getBottleById(id) : searchBourbonBible(query, 1)[0] || null;
  const suggestions = query ? searchBourbonBible(query, 8) : [];

  if (!bottle) {
    return NextResponse.json(
      {
        query,
        state,
        bottle: null,
        suggestions,
        message: "We do not have this bottle in the Bourbon Bible yet. Try a different spelling or check back as the list expands.",
      },
      { headers: siteExportHeaders("local-export") }
    );
  }

  const localSignal = getLocalSignal(bottle, state);

  return NextResponse.json(
    {
      query,
      state,
      bottle,
      localSignal,
      suggestions,
    },
    { headers: siteExportHeaders("local-export") }
  );
}
