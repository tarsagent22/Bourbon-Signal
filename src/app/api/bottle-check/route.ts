import { NextResponse } from "next/server";
import { getBottleById, normalizeBottleKey, searchBourbonBible, type AvailabilityTier, type BibleBottle } from "@/lib/bourbonBible";
import { captureSearchEvent } from "@/lib/search-capture";
import { normalizeDropForSite, readSiteExport, siteExportHeaders } from "@/lib/site-engine-contract";

interface LocalSignal {
  state: string;
  localScore: number;
  scoreStatus: "bible_baseline" | "local_adjusted";
  scoreBasis: string;
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
  const keys = [bottle.id, bottle.canonicalName, ...bottle.aliases].map(normalizeBottleKey).filter(Boolean);
  return names.some((name) => keys.some((key) => name === key || (key.length >= 12 && name.includes(key)) || (name.length >= 12 && key.includes(name))));
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

function getBibleBaselineScore(bottle: BibleBottle) {
  return getAvailabilityScore(bottle, bottle.availability);
}

function getAvailabilityScore(bottle: BibleBottle, availability: AvailabilityTier) {
  const availabilityBase: Record<string, number> = {
    common: 22,
    regional: 40,
    seasonal: 48,
    limited: 62,
    allocated: 76,
    highly_allocated: 88,
    unicorn: 97,
  };

  const verdictBoost: Record<string, number> = {
    safe_to_pass: -4,
    fair_buy: 0,
    good_buy: 5,
    grab_at_msrp: 8,
    special_find: 10,
    unknown: 0,
  };

  const proofBoost = typeof bottle.proof === "number" && bottle.proof >= 115 ? 3 : typeof bottle.proof === "number" && bottle.proof >= 100 ? 1 : 0;
  const ageText = `${bottle.ageStatement || ""}`.toLowerCase();
  const ageMatch = ageText.match(/(\d+)/);
  const ageBoost = ageMatch ? Math.min(4, Math.max(0, Number(ageMatch[1]) - 8)) : 0;
  const alertBoost = bottle.isAlertEligible ? 2 : 0;

  const raw = (availabilityBase[availability] ?? 45) + (verdictBoost[bottle.buyerVerdict] ?? 0) + proofBoost + ageBoost + alertBoost;
  const capped = availability === "common" ? Math.min(35, raw) : raw;
  return Math.max(1, Math.min(100, Math.round(capped)));
}

const CONTROLLED_OR_ALLOCATED_MARKETS = new Set(["NC", "VA", "PA", "AL", "MD-MONTGOMERY"]);

const LOCAL_SCARCITY_RULES: { pattern: RegExp; states?: string[]; floor: AvailabilityTier; reason: string }[] = [
  {
    pattern: /\bbuffalo trace\b/i,
    states: ["NC", "VA", "PA", "MD-MONTGOMERY"],
    floor: "allocated",
    reason: "Buffalo Trace is nationally common, but controlled/allocated markets often treat it like an allocated bottle.",
  },
  {
    pattern: /\b(weller|blanton|eagle rare|e\.?h\.?\s*taylor|stagg|elmer t\.? lee|rock hill farms|van winkle|pappy|sazerac 18|thomas h\.? handy|william larue)\b/i,
    floor: "allocated",
    reason: "High-demand allocated family; local shelves can be meaningfully tighter than national availability labels imply.",
  },
  {
    pattern: /\b(michter'?s 10|old fitzgerald|birthday bourbon|parker'?s heritage|four roses limited|blood oath|little book|jack daniel'?s (10|12))\b/i,
    floor: "limited",
    reason: "Limited/seasonal release with hunter demand; local availability can be uneven.",
  },
];

const availabilityRank: Record<AvailabilityTier, number> = {
  common: 1,
  regional: 2,
  seasonal: 3,
  limited: 4,
  allocated: 5,
  highly_allocated: 6,
  unicorn: 7,
};

function higherAvailability(a: AvailabilityTier, b: AvailabilityTier): AvailabilityTier {
  return availabilityRank[b] > availabilityRank[a] ? b : a;
}

function getMarketAdjustedAvailability(bottle: BibleBottle, state: string) {
  const haystack = [bottle.id, bottle.canonicalName, bottle.brand, bottle.producer, bottle.summary, ...bottle.aliases]
    .filter(Boolean)
    .join(" ");
  const normalizedState = state.toUpperCase();
  let availability = bottle.availability;
  const reasons: string[] = [];

  for (const rule of LOCAL_SCARCITY_RULES) {
    if (rule.states && !rule.states.includes(normalizedState)) continue;
    if (!rule.pattern.test(haystack)) continue;
    const next = higherAvailability(availability, rule.floor);
    if (next !== availability) {
      availability = next;
      reasons.push(rule.reason);
    }
  }

  const locallyUnevenCommon = bottle.availability === "common" && /uneven|scarce|not always|varies by market|rarely/i.test(`${bottle.summary} ${bottle.guidance}`);
  if (locallyUnevenCommon && CONTROLLED_OR_ALLOCATED_MARKETS.has(normalizedState)) {
    const next = higherAvailability(availability, "regional");
    if (next !== availability) {
      availability = next;
      reasons.push("This bottle is marked common nationally, but its own profile says distribution is uneven by market.");
    }
  }

  return {
    availability,
    adjusted: availability !== bottle.availability,
    reasons,
  };
}

function userFacingBottle(bottle: BibleBottle) {
  return {
    ...bottle,
    summary: bottle.summary.replace(/Bourbon Bible/g, "Bottle Check index"),
    guidance: bottle.guidance.replace(/Bourbon Bible/g, "Bottle Check"),
  };
}

function getLocalSignal(bottle: BibleBottle, state: string): LocalSignal {
  const drops = getDropsForBottle(bottle, state);
  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  const recent90 = drops.filter((drop) => now - asTime(drop.timestamp) <= 90 * day);
  const recent30 = drops.filter((drop) => now - asTime(drop.timestamp) <= 30 * day);
  const lastSeenAt = drops[0]?.timestamp ? String(drops[0].timestamp) : null;
  const uniqueLocations = new Set(recent90.map((drop) => String(drop.store_id || drop.store_name || drop.display_location || drop.board_name || drop.store_city || "")).filter(Boolean));

  const marketAvailability = getMarketAdjustedAvailability(bottle, state);
  const baselineScore = getAvailabilityScore(bottle, marketAvailability.availability);
  const hasLocalSignal = recent90.length > 0;
  const ageDays = hasLocalSignal && lastSeenAt ? Math.floor((now - asTime(lastSeenAt)) / day) : null;
  const recencyBoost = ageDays == null ? 0 : Math.max(0, 8 - ageDays / 7);
  const opportunityBoost = hasLocalSignal ? Math.min(8, recent30.length * 1.2 + uniqueLocations.size * 0.6) : 0;
  const scarcityLift = !hasLocalSignal && marketAvailability.availability !== "common" ? 4 : 0;
  const abundancePenalty = marketAvailability.availability === "common" && recent90.length >= 12 && uniqueLocations.size >= 6 ? 5 : 0;
  const commonLocalCap = marketAvailability.availability === "common" ? 38 : 100;
  const localScore = hasLocalSignal
    ? Math.max(1, Math.min(commonLocalCap, Math.round(baselineScore + recencyBoost + opportunityBoost - abundancePenalty)))
    : Math.max(1, Math.min(commonLocalCap, Math.round(baselineScore + scarcityLift)));
  const scoreStatus: LocalSignal["scoreStatus"] = hasLocalSignal || marketAvailability.adjusted ? "local_adjusted" : "bible_baseline";
  const scoreBasis = hasLocalSignal
    ? `Bottle profile adjusted by recent Bourbon Signal sightings${marketAvailability.adjusted ? " and state-specific scarcity context" : ""}.`
    : marketAvailability.adjusted
      ? `Bottle profile adjusted for ${state} market scarcity. ${marketAvailability.reasons[0] || "Local availability differs from the national label."}`
      : "Bottle profile based on availability, buyer guidance, proof/age context, and alert eligibility.";

  const confidence: LocalSignal["confidence"] = recent90.length >= 8 ? "high" : recent90.length >= 2 ? "medium" : "low";
  let label = "Not enough local signal";
  if (marketAvailability.adjusted && bottle.availability === "common") label = "Common nationally, scarce locally";
  else if (marketAvailability.availability === "common") label = "Common shelf bottle";
  else if (localScore >= 90) label = hasLocalSignal ? "Extremely rare local find" : "Extremely rare bottle";
  else if (localScore >= 75) label = hasLocalSignal ? "Rare in your area" : "Rare bottle";
  else if (localScore >= 58) label = hasLocalSignal ? "Worth checking locally" : "Limited or allocated bottle";
  else if (localScore >= 36) label = hasLocalSignal ? "Moderate local signal" : "Regional or situational bottle";

  let verdict = "Check price and local context before deciding.";
  if (marketAvailability.adjusted && bottle.availability === "common") verdict = "This may be easy to dismiss nationally, but in your selected market it can behave like an allocated bottle. Good buy near MSRP if you actually want it; do not chase secondary pricing.";
  else if (marketAvailability.availability === "common") verdict = "Usually safe to pass unless you specifically want it.";
  else if (!hasLocalSignal) verdict = "Solid bottle if priced fairly. Bourbon Signal does not have recent local sightings for it yet, so this score is based on bottle profile rather than confirmed local availability.";
  else if (localScore >= 82) verdict = "Grab near MSRP if this is a bottle you want.";
  else if (localScore >= 62) verdict = "Worth considering at a fair shelf price.";
  else if (confidence === "low") verdict = "Not enough local history yet; use the national bottle context as a guide.";

  const canTrack = Boolean(bottle.isAlertEligible && bottle.availability !== "common");

  return {
    state,
    localScore,
    scoreStatus,
    scoreBasis,
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
    captureSearchEvent({
      surface: "bottle-check",
      query,
      state,
      outcome: "unmatched",
      suggestionCount: suggestions.length,
      localScore: null,
      scoreStatus: "unmatched",
    });

    return NextResponse.json(
      {
        query,
        state,
        bottle: null,
        suggestions,
        message: "We do not have this bottle in the Bottle Check index yet. Try a different spelling or check back as the list expands.",
      },
      { headers: siteExportHeaders("local-export") }
    );
  }

  const localSignal = getLocalSignal(bottle, state);
  const matchedBottle = bottle as BibleBottle & { matchScore?: number };
  const matchScore = typeof matchedBottle.matchScore === "number" ? matchedBottle.matchScore : 120;

  captureSearchEvent({
    surface: "bottle-check",
    query: query || bottle.canonicalName,
    state,
    outcome: "matched",
    matchedBottleId: bottle.id,
    matchedBottleName: bottle.canonicalName,
    suggestionCount: suggestions.length,
    confidence: localSignal.confidence,
    localScore: localSignal.localScore,
    scoreStatus: localSignal.scoreStatus,
  });

  return NextResponse.json(
    {
      query,
      state,
      bottle: userFacingBottle(bottle),
      localSignal,
      suggestions: suggestions.map(userFacingBottle),
      showSuggestions: matchScore < 95,
    },
    { headers: siteExportHeaders("local-export") }
  );
}
