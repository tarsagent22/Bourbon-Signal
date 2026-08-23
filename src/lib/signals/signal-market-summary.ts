import { dropFreshnessTime } from "../drop-feed-policy.ts";

const WEEK_MS = 7 * 24 * 60 * 60 * 1_000;
const FUTURE_SKEW_MS = 15 * 60 * 1_000;

export interface MarketSummary {
  state: string;
  areaLabel: string;
  signalCount: number;
  bottleNames: string[];
}

type SummaryOptions = {
  now?: string | number | Date;
  stateLabels?: Record<string, string>;
  maxAreas?: number;
  maxBottles?: number;
};

function timestamp(value: SummaryOptions["now"]) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "number") return value;
  if (typeof value === "string") return Date.parse(value);
  return Date.now();
}

function text(value: unknown) {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function stateCode(drop: Record<string, unknown>) {
  const state = text(drop.state ?? drop.state_code ?? drop.stateCode).toUpperCase();
  return /^[A-Z]{2}$/.test(state) ? state : "";
}

function bottleName(drop: Record<string, unknown>) {
  return text(
    drop.canonical_name
      ?? drop.canonicalName
      ?? drop.bottle_name
      ?? drop.bottleName
      ?? drop.bourbonName
      ?? drop.brand_name
      ?? drop.raw_name
      ?? drop.rawName,
  );
}

export function buildWeeklyMarketSummaries(
  drops: Array<Record<string, unknown>>,
  options: SummaryOptions = {},
): MarketSummary[] {
  const now = timestamp(options.now);
  if (!Number.isFinite(now)) return [];
  const cutoff = now - WEEK_MS;
  const maxAreas = Math.max(1, Math.min(12, options.maxAreas ?? 6));
  const maxBottles = Math.max(1, Math.min(6, options.maxBottles ?? 3));
  const buckets = new Map<string, { count: number; bottles: Map<string, number> }>();

  for (const drop of drops) {
    const state = stateCode(drop);
    const canonicalTime = dropFreshnessTime(drop);
    const observedTime = Date.parse(text(drop.observed_at ?? drop.observedAt));
    const observedAt = Number.isFinite(canonicalTime) ? canonicalTime : observedTime;
    if (!state || !Number.isFinite(observedAt) || observedAt < cutoff || observedAt > now + FUTURE_SKEW_MS) continue;
    const bucket = buckets.get(state) || { count: 0, bottles: new Map<string, number>() };
    bucket.count += 1;
    const bottle = bottleName(drop);
    if (bottle) bucket.bottles.set(bottle, (bucket.bottles.get(bottle) || 0) + 1);
    buckets.set(state, bucket);
  }

  return [...buckets.entries()]
    .map(([state, bucket]) => ({
      state,
      areaLabel: options.stateLabels?.[state] || state,
      signalCount: bucket.count,
      bottleNames: [...bucket.bottles.entries()]
        .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
        .slice(0, maxBottles)
        .map(([name]) => name),
    }))
    .sort((left, right) => right.signalCount - left.signalCount || left.areaLabel.localeCompare(right.areaLabel))
    .slice(0, maxAreas);
}
