import "server-only";

import dropFeedClassification from "@/data/drop-feed-classification.generated.json";
import {
  getDropClassificationIndex,
  resolveDropClassification,
  type DropClassificationBottle,
} from "@/lib/drop-classification";
import { dropFreshnessTime } from "@/lib/drop-feed-policy";
import { selectDropFeedHistory } from "@/lib/drop-feed-history";
import { isFreshPublicDrop, isPublicDropFeedEligible, publicEvidenceStateCode } from "@/lib/public-drop-evidence";
import { readCachedPublicRetailerSubmissions } from "@/lib/retailer-public-submissions";
import { isVerifiedRetailerDrop, retailerSubmissionToFeedCard } from "@/lib/retailer-signal-feed";
import { normalizeDropForSite, readSiteExportResults } from "@/lib/site-engine-contract";

const FUTURE_CLOCK_SKEW_MS = 15 * 60_000;

function degradedEngineStates(statsPayload: Record<string, unknown> | null | undefined) {
  const refreshHealth = statsPayload?.refreshHealth;
  if (!refreshHealth || typeof refreshHealth !== "object") return new Set<string>();
  const states = Array.isArray((refreshHealth as Record<string, unknown>).degradedStates)
    ? (refreshHealth as Record<string, unknown>).degradedStates as Array<Record<string, unknown>>
    : [];
  return new Set(states
    .filter((state) => !String(state.status || "").toLowerCase().startsWith("stale_useful"))
    .map((state) => publicEvidenceStateCode(state.state))
    .filter(Boolean));
}

function eligibleHistoricalDrop(drop: Record<string, unknown>, now: number) {
  if (isVerifiedRetailerDrop(drop)) return false;
  const observedAt = dropFreshnessTime(drop);
  return Number.isFinite(observedAt) && observedAt <= now + FUTURE_CLOCK_SKEW_MS;
}

async function retailerDrops(now: Date) {
  try {
    const submissions = await readCachedPublicRetailerSubmissions();
    return submissions
      .map((submission) => retailerSubmissionToFeedCard(submission, now))
      .filter((drop): drop is NonNullable<typeof drop> => Boolean(drop));
  } catch {
    return [];
  }
}

export async function readWelcomeLocalPreviewInputs(now = new Date()) {
  const [[dropResult, statsResult], publicRetailerDrops] = await Promise.all([
    readSiteExportResults(["drops", "stats"]),
    retailerDrops(now),
  ]);
  const exportPayload = dropResult.payload;
  const statsPayload = statsResult.payload as Record<string, unknown> | null;
  const rawDrops = Array.isArray(exportPayload?.drops) ? exportPayload.drops : [];
  const monitoringDrops = rawDrops.map((drop) => normalizeDropForSite(drop as Record<string, unknown>));
  const classificationIndex = getDropClassificationIndex(
    dropFeedClassification.records as unknown as DropClassificationBottle[],
  );
  const normalized = [...rawDrops, ...publicRetailerDrops]
    .map((drop) => normalizeDropForSite(drop as Record<string, unknown>))
    .map((drop) => {
      const classification = resolveDropClassification(drop, classificationIndex);
      return {
        ...drop,
        tier: classification.tier,
        rarity_tier: classification.tier,
        classification_source: classification.source,
        classification_state: classification.state,
        classification_bottle_id: classification.bottleId,
        national_tier: classification.nationalTier,
      };
    })
    .filter((drop) => isPublicDropFeedEligible(drop, {
      degradedStateCodes: degradedEngineStates(statsPayload),
    }));

  return {
    monitoringDrops,
    eligibleDrops: selectDropFeedHistory(
      normalized,
      true,
      (drop) => isFreshPublicDrop(drop, now.getTime()),
      (drop) => eligibleHistoricalDrop(drop, now.getTime()),
    ),
  };
}
