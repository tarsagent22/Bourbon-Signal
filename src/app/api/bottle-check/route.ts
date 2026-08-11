import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { getBottleById, normalizeBottleKey, searchBourbonBible, type AvailabilityTier, type BibleBottle } from "@/lib/bourbonBible";
import { captureSearchEvent } from "@/lib/search-capture";
import { normalizeDropForSite, readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";
import { getEntitlements } from "@/lib/entitlements";
import { getMemberTasteScore } from "@/lib/member-taste-score";
import { getRarityProfile } from "@/lib/bottle-rarity-score";
import { getPublicScarcityLabel, getScarcityBadges, normalizeBottleScarcity, resolveBottleScarcity, scarcityTierToAvailability, type ScarcityTier } from "@/lib/bottle-scarcity";
import { searchFastBottleSuggestions } from "@/lib/bottle-suggestion-index";


const FREE_BOTTLE_CHECK_LIMIT = 3;

type BottleCheckUsage = { used?: number; updatedAt?: string };

function normalizeUsage(value: unknown): BottleCheckUsage {
  const source = value && typeof value === "object" ? value as Record<string, unknown> : {};
  const used = typeof source.used === "number" && Number.isFinite(source.used) ? Math.max(0, Math.floor(source.used)) : 0;
  return { used, updatedAt: typeof source.updatedAt === "string" ? source.updatedAt : undefined };
}

async function consumeFreeBottleCheckIfNeeded(intent: string) {
  if (intent !== "check") return { limited: false as const, usage: null as null | { used: number; limit: number; remaining: number } };
  const { userId } = await auth();
  if (!userId) return { limited: false as const, usage: null as null | { used: number; limit: number; remaining: number } };
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const entitlements = getEntitlements(user.publicMetadata);
  if (entitlements.bottleCheckLimit === null) return { limited: false as const, usage: null as null | { used: number; limit: number; remaining: number } };
  const limit = entitlements.bottleCheckLimit ?? FREE_BOTTLE_CHECK_LIMIT;
  const current = normalizeUsage(user.publicMetadata?.bottleCheckUsage);
  if ((current.used || 0) >= limit) {
    return { limited: true as const, usage: { used: current.used || 0, limit, remaining: 0 } };
  }
  const next = { used: (current.used || 0) + 1, updatedAt: new Date().toISOString() };
  await client.users.updateUserMetadata(userId, { publicMetadata: { bottleCheckUsage: next } });
  return { limited: false as const, usage: { used: next.used, limit, remaining: Math.max(0, limit - next.used) } };
}

interface LocalSignal {
  state: string;
  rarityScore: number;
  nationalRarityScore: number;
  localScore: number;
  scoreStatus: "bible_baseline" | "local_adjusted";
  scoreBasis: string;
  label: string;
  verdict: string;
  confidence: "high" | "medium" | "low";
  signalConfidence: "high" | "medium" | "low";
  classificationConfidence: "high" | "medium" | "low";
  nationalTier: ScarcityTier;
  marketTier: ScarcityTier;
  nationalLabel: string;
  marketLabel: string;
  nationalConfidence: "high" | "medium" | "low";
  localConfidence: "high" | "medium" | "low" | null;
  nationalReason: string;
  localReason: string | null;
  releaseBadges: string[];
  localClassificationEstablished: boolean;
  classificationSource: "national_baseline" | "state_override";
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
  const keys = [bottle.id, bottle.canonicalName, ...bottle.aliases].map(normalizeBottleKey).filter(Boolean);
  return names.some((name) => keys.some((key) => name === key || (key.length >= 12 && name.includes(key)) || (name.length >= 12 && key.includes(name))));
}

async function getDropsForBottle(bottle: BibleBottle, state?: string) {
  try {
    const exportPayload = await readSiteExport("drops");
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

const availabilityRank: Record<AvailabilityTier, number> = {
  common: 1,
  regional: 2,
  seasonal: 3,
  limited: 4,
  allocated: 5,
  highly_allocated: 6,
  unicorn: 7,
};


function userFacingBottle(bottle: BibleBottle) {
  return {
    ...bottle,
    scarcityLabel: getPublicScarcityLabel(bottle),
    releaseBadges: getScarcityBadges(bottle),
    summary: bottle.summary.replace(/Bourbon Bible/g, "Bottle Check index"),
    guidance: bottle.guidance.replace(/Bourbon Bible/g, "Bottle Check"),
  };
}

function suggestionDedupeKey(bottle: BibleBottle) {
  return normalizeBottleKey(bottle.canonicalName)
    .replace(/\b(\d+)y\b/g, "$1 year")
    .replace(/^w l weller\b/g, "weller")
    .replace(/\bc y p b\b/g, "cypb")
    .replace(/\b(kentucky|ky|straight|bourbon|whiskey|whisky)\b/g, " ")
    .replace(/\b(750ml|1l|liter|litre|\.75l|1\.00l)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim() || normalizeBottleKey(bottle.canonicalName);
}

function suggestionRank(bottle: BibleBottle & { matchScore?: number }) {
  return (typeof bottle.matchScore === "number" ? bottle.matchScore : 0) * 10 + (availabilityRank[bottle.availability] || 0);
}

function dedupeBottleSuggestions(suggestions: BibleBottle[]) {
  const byKey = new Map<string, BibleBottle>();
  for (const suggestion of suggestions) {
    const key = suggestionDedupeKey(suggestion);
    const existing = byKey.get(key);
    if (!existing || suggestionRank(suggestion) > suggestionRank(existing)) {
      byKey.set(key, suggestion);
    }
  }
  return Array.from(byKey.values());
}

async function getLocalSignal(bottle: BibleBottle, state: string): Promise<LocalSignal> {
  const drops = await getDropsForBottle(bottle, state);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const recent90 = drops.filter((drop) => now - asTime(drop.timestamp) <= 90 * day);
  const recent30 = drops.filter((drop) => now - asTime(drop.timestamp) <= 30 * day);
  const lastSeenAt = drops[0]?.timestamp ? String(drops[0].timestamp) : null;

  const scarcity = resolveBottleScarcity(normalizeBottleScarcity(bottle as unknown as Record<string, unknown>), state);
  const nationalRarityProfile = getRarityProfile(scarcityTierToAvailability(scarcity.nationalTier));
  const rarityProfile = getRarityProfile(scarcityTierToAvailability(scarcity.marketTier));
  const classificationSupported = scarcity.classificationSource === "state_override"
    || scarcity.nationalConfidence !== "low"
    || scarcity.nationalTier === "regular";
  const rarityScore = classificationSupported ? rarityProfile.score : 20;
  const hasLocalSignal = recent90.length > 0;
  const scoreStatus: LocalSignal["scoreStatus"] = scarcity.classificationSource === "state_override" ? "local_adjusted" : "bible_baseline";
  const scoreBasis = !classificationSupported
    ? "The national scarcity tier is under evidence review. Local sightings and price context remain available, but the rarity score is not treated as verified."
    : scarcity.classificationSource === "state_override"
    ? `National baseline: ${scarcity.nationalLabel}. Local evidence: ${scarcity.localReason}`
    : `National baseline: ${scarcity.nationalLabel}. ${scarcity.localLabel}.`;

  const confidence: LocalSignal["confidence"] = recent90.length >= 8 ? "high" : recent90.length >= 2 ? "medium" : "low";
  const label = scarcity.classificationSource === "state_override" ? scarcity.localLabel : scarcity.nationalLabel;

  let verdict = "Check price and local context before deciding.";
  if (!classificationSupported) verdict = "This bottle's scarcity tier is still being sourced. Use recent local sightings and price context; do not treat the current tier as verified.";
  else if (scarcity.marketTier === "regular") verdict = "Usually safe to pass unless you specifically want it.";
  else if (scarcity.marketTier === "unicorn") verdict = "A true unicorn retail find. Verify provenance and price before treating it as actionable.";
  else if (scarcity.marketTier === "highly_allocated") verdict = "Extremely difficult to find at retail. Act quickly near MSRP if it is a bottle you want.";
  else if (scarcity.marketTier === "allocated") verdict = "A meaningful allocated find. Worth considering near MSRP if it fits your collection.";
  else if (!hasLocalSignal) verdict = "The rarity tier is based on the bottle profile. Bourbon Signal does not have recent sightings for it in this market yet.";
  else if (scarcity.marketTier === "limited") verdict = "Worth considering at a fair shelf price.";
  else if (confidence === "low") verdict = "Not enough local history yet; use the national rarity tier as a guide.";

  const canTrack = Boolean(bottle.isAlertEligible && scarcity.marketTier !== "regular");

  return {
    state,
    rarityScore,
    nationalRarityScore: scarcity.nationalConfidence === "low" && scarcity.nationalTier !== "regular" ? 20 : nationalRarityProfile.score,
    localScore: rarityScore,
    scoreStatus,
    scoreBasis,
    label,
    verdict,
    confidence,
    signalConfidence: confidence,
    classificationConfidence: scarcity.confidence,
    nationalTier: scarcity.nationalTier,
    marketTier: scarcity.marketTier,
    nationalLabel: scarcity.nationalLabel,
    marketLabel: scarcity.marketLabel,
    nationalConfidence: scarcity.nationalConfidence,
    localConfidence: scarcity.localConfidence,
    nationalReason: `National baseline: ${scarcity.nationalLabel} (${scarcity.nationalConfidence} confidence).`,
    localReason: scarcity.localReason,
    releaseBadges: getScarcityBadges(scarcity),
    localClassificationEstablished: scarcity.localClassificationEstablished,
    classificationSource: scarcity.classificationSource,
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
    trackDisabledReason: canTrack ? undefined : scarcity.marketTier === "regular" ? "Alert settings are intentionally disabled for regularly available bottles in this market." : "Tracking is not enabled for this bottle yet.",
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const query = url.searchParams.get("q") || "";
  const id = url.searchParams.get("id") || "";
  const state = (url.searchParams.get("state") || "NC").toUpperCase();
  const intent = url.searchParams.get("intent") || "suggest";

  if (intent === "suggest" || intent === "suggest-authoritative") {
    const suggestionRows: BibleBottle[] = intent === "suggest-authoritative"
      ? await searchBourbonBible(query, 8)
      : searchFastBottleSuggestions(query, 8);
    const suggestions = dedupeBottleSuggestions(suggestionRows);
    const bottle = suggestions[0] || null;
    const scoredBottle = bottle as (BibleBottle & { matchScore?: number }) | null;
    const matchScore = scoredBottle && typeof scoredBottle.matchScore === "number" ? scoredBottle.matchScore : 0;
    return NextResponse.json(
      {
        query,
        bottle: bottle ? userFacingBottle(bottle) : null,
        suggestions: suggestions.map(userFacingBottle),
        showSuggestions: !bottle || matchScore < 95,
        usage: null,
      },
      {
        headers: {
          ...siteExportHeaders("local-export"),
          "Cache-Control": "public, max-age=300, s-maxage=86400, stale-while-revalidate=604800",
        },
      },
    );
  }

  const usageGate = await consumeFreeBottleCheckIfNeeded(intent);
  if (usageGate.limited) {
    return NextResponse.json({ bottle: null, suggestions: [], message: "Free includes 3 Bottle Checks. Upgrade for unlimited Bottle Check access.", usage: usageGate.usage }, { status: 403, headers: siteExportHeaders("local-export") });
  }

  let bottle: BibleBottle | null;
  let suggestionRows: BibleBottle[];
  if (id) {
    [bottle, suggestionRows] = await Promise.all([
      getBottleById(id),
      query ? searchBourbonBible(query, 16) : Promise.resolve([]),
    ]);
  } else {
    suggestionRows = query ? await searchBourbonBible(query, 16) : [];
    bottle = suggestionRows[0] || null;
  }
  const suggestions = dedupeBottleSuggestions(suggestionRows).slice(0, 8);


  if (!bottle) {
    captureSearchEvent({
      surface: "bottle-check",
      state,
      outcome: "unmatched",
      suggestionCount: suggestions.length,
    });

    return NextResponse.json(
      {
        query,
        state,
        bottle: null,
        suggestions,
        message: "We do not have this bottle in the Bottle Check index yet. Try a different spelling or check back as the list expands.",
        usage: usageGate.usage,
      },
      { headers: siteExportHeaders("local-export") }
    );
  }

  const localSignal = await getLocalSignal(bottle, state);
  const memberTasteScore = await getMemberTasteScore(bottle);
  const matchedBottle = bottle as BibleBottle & { matchScore?: number };
  const matchScore = typeof matchedBottle.matchScore === "number" ? matchedBottle.matchScore : 120;

  captureSearchEvent({
    surface: "bottle-check",
    state,
    outcome: "matched",
    canonicalBottleId: bottle.id,
    suggestionCount: suggestions.length,
  });

  return NextResponse.json(
    {
      query,
      state,
      bottle: userFacingBottle(bottle),
      localSignal,
      memberTasteScore,
      suggestions: suggestions.map(userFacingBottle),
      showSuggestions: matchScore < 95,
      usage: usageGate.usage,
    },
    { headers: siteExportHeaders("local-export") }
  );
}
