import { canonicalBottleKey } from "./bottleIdentity.ts";

export type RecommendationFeedbackSignal = "useful" | "not_for_me" | "already_own" | "saved";

export const MAX_RECOMMENDATION_FEEDBACK_ENTRIES = 200;
export const MAX_RECOMMENDATION_CANONICAL_KEY_LENGTH = 180;
export const MAX_RECOMMENDATION_FEEDBACK_TAGS = 12;
export const MAX_RECOMMENDATION_FEEDBACK_TAG_LENGTH = 48;
export const MAX_RECOMMENDATION_TAG_ADJUSTMENT = 3;
export const MAX_RECOMMENDATION_CANDIDATE_ADJUSTMENT = 6;

export interface RecommendationFeedbackEntry {
  bottleId: string;
  bottleName: string;
  canonicalKey?: string;
  signal: RecommendationFeedbackSignal;
  matchedTags: string[];
  score?: number;
  createdAt: string;
}

export interface RecommendationFeedbackModel {
  directSignals: Record<string, RecommendationFeedbackSignal>;
  suppressedKeys: string[];
  tagAdjustments: Record<string, number>;
}

export interface RecommendationMarketSignal {
  timestamp?: string;
  exactStore?: boolean;
  alertGrade?: boolean;
}

export interface RecommendationCandidate {
  canonicalKey: string;
  bottleName: string;
  producer?: string;
  baseScore: number;
  matchedTags: string[];
  profileConfidence: "low" | "medium" | "high";
  profileMethod: "curated" | "inferred" | "user_augmented";
  fallbackOnly?: boolean;
  mashBillFamily?: string;
  recentSignals: RecommendationMarketSignal[];
}

export type RecommendationLane = "best_match" | "local_opportunity" | "try_something_different" | "strong_match";

export interface RankedRecommendation extends RecommendationCandidate {
  tasteScore: number;
  adjustedScore: number;
  marketScore: number;
  lane: RecommendationLane;
  laneLabel: string;
}

function normalizeLabel(value: string) {
  return value
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function canonicalRecommendationKey(value: unknown) {
  if (typeof value !== "string") return "";
  if (value.length > 512) return "";
  const key = canonicalBottleKey(value);
  return key.length > 0 && key.length <= MAX_RECOMMENDATION_CANONICAL_KEY_LENGTH ? key : "";
}

function normalizeFeedbackTags(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set<string>(value
    .filter((tag): tag is string => typeof tag === "string")
    .map((tag) => tag.trim().slice(0, MAX_RECOMMENDATION_FEEDBACK_TAG_LENGTH))
    .filter(Boolean)))
    .slice(0, MAX_RECOMMENDATION_FEEDBACK_TAGS);
}

function clamp(value: number, minimum: number, maximum: number) {
  return Math.max(minimum, Math.min(maximum, value));
}

function normalizeFeedbackSignal(value: unknown): RecommendationFeedbackSignal | null {
  return value === "useful" || value === "not_for_me" || value === "already_own" || value === "saved" ? value : null;
}

export function normalizeRecommendationFeedbackEntries(input: unknown): RecommendationFeedbackEntry[] {
  const source = input && typeof input === "object" ? input as Record<string, unknown> : {};
  const rawEntries = Array.isArray(source.entries) ? source.entries : [];
  const entries: RecommendationFeedbackEntry[] = [];

  for (const raw of rawEntries) {
    const item = raw && typeof raw === "object" ? raw as Record<string, unknown> : {};
    const bottleId = typeof item.bottleId === "string" ? item.bottleId.trim().slice(0, 180) : "";
    const bottleName = typeof item.bottleName === "string" ? item.bottleName.trim().slice(0, 180) : "";
    const signal = normalizeFeedbackSignal(item.signal);
    if (!bottleId || !bottleName || !signal) continue;
    const canonicalKey = canonicalRecommendationKey(typeof item.canonicalKey === "string" ? item.canonicalKey : bottleName);
    if (!canonicalKey) continue;
    entries.push({
      bottleId,
      bottleName,
      canonicalKey,
      signal,
      matchedTags: normalizeFeedbackTags(item.matchedTags),
      score: typeof item.score === "number" && Number.isFinite(item.score) ? clamp(item.score, -100, 100) : undefined,
      createdAt: typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : new Date(0).toISOString(),
    });
  }

  const newestByBottle = new Map<string, RecommendationFeedbackEntry>();
  for (const entry of entries) {
    const canonicalKey = entry.canonicalKey || canonicalRecommendationKey(entry.bottleName);
    const current = newestByBottle.get(canonicalKey);
    if (!current || Date.parse(entry.createdAt) > Date.parse(current.createdAt)) newestByBottle.set(canonicalKey, { ...entry, canonicalKey });
  }
  return Array.from(newestByBottle.values())
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .slice(0, MAX_RECOMMENDATION_FEEDBACK_ENTRIES);
}

function entryKey(entry: RecommendationFeedbackEntry) {
  return canonicalRecommendationKey(entry.canonicalKey || entry.bottleName || entry.bottleId);
}

function feedbackTime(entry: RecommendationFeedbackEntry) {
  const value = Date.parse(entry.createdAt);
  return Number.isFinite(value) ? value : 0;
}

export function buildRecommendationFeedbackModel(entries: RecommendationFeedbackEntry[]): RecommendationFeedbackModel {
  const newestByBottle = new Map<string, RecommendationFeedbackEntry>();
  for (const entry of entries) {
    const key = entryKey(entry);
    if (!key) continue;
    const current = newestByBottle.get(key);
    if (!current || feedbackTime(entry) >= feedbackTime(current)) newestByBottle.set(key, entry);
  }

  const directSignals: Record<string, RecommendationFeedbackSignal> = {};
  const tagAdjustments: Record<string, number> = {};
  const suppressedKeys: string[] = [];
  const tagWeight: Record<RecommendationFeedbackSignal, number> = {
    useful: 0.9,
    saved: 0.75,
    not_for_me: -1.25,
    already_own: 0,
  };

  for (const [key, entry] of Array.from(newestByBottle.entries())) {
    directSignals[key] = entry.signal;
    suppressedKeys.push(key);
    const uniqueTags = normalizeFeedbackTags(entry.matchedTags);
    for (const tag of uniqueTags) {
      tagAdjustments[tag] = clamp(
        (tagAdjustments[tag] || 0) + tagWeight[entry.signal],
        -MAX_RECOMMENDATION_TAG_ADJUSTMENT,
        MAX_RECOMMENDATION_TAG_ADJUSTMENT,
      );
    }
  }

  return { directSignals, suppressedKeys, tagAdjustments };
}

export function recommendationReadiness(ratedBottleCount: number) {
  const target = 3;
  const normalizedCount = Math.max(0, Math.floor(Number.isFinite(ratedBottleCount) ? ratedBottleCount : 0));
  return {
    target,
    ratedBottleCount: normalizedCount,
    remaining: Math.max(0, target - normalizedCount),
    ready: normalizedCount >= target,
  };
}

export function scoreMarketSignals(signals: RecommendationMarketSignal[], now = Date.now()) {
  const scores = signals.flatMap((signal) => {
    const observedAt = signal.timestamp ? Date.parse(signal.timestamp) : Number.NaN;
    if (!Number.isFinite(observedAt)) return [];
    const ageHours = Math.max(0, (now - observedAt) / 3_600_000);
    let freshness = 0;
    if (ageHours <= 24) freshness = 1.2;
    else if (ageHours <= 72) freshness = 0.8;
    else if (ageHours <= 168) freshness = 0.4;
    else if (ageHours <= 336) freshness = 0.15;
    if (!freshness) return [];
    return [freshness + (signal.exactStore ? 0.35 : 0) + (signal.alertGrade ? 0.25 : 0)];
  });

  return Math.round(Math.min(3.6, scores.sort((a, b) => b - a).slice(0, 3).reduce((sum, score) => sum + score, 0)) * 10) / 10;
}

function confidenceMultiplier(candidate: RecommendationCandidate) {
  if (candidate.fallbackOnly) return 0.35;
  if (candidate.profileMethod === "curated") return 1;
  if (candidate.profileConfidence === "high") return 0.96;
  if (candidate.profileConfidence === "medium") return 0.82;
  return 0.6;
}

function laneLabel(lane: RecommendationLane) {
  if (lane === "best_match") return "Best match";
  if (lane === "local_opportunity") return "Seen nearby";
  if (lane === "try_something_different") return "Worth exploring";
  return "Strong match";
}

export function rankRecommendationCandidates(
  candidates: RecommendationCandidate[],
  feedback: RecommendationFeedbackModel,
  options: { limit?: number; now?: number } = {},
): RankedRecommendation[] {
  const limit = Math.max(1, Math.min(24, Math.floor(options.limit || 12)));
  const now = options.now ?? Date.now();
  const suppressed = new Set(feedback.suppressedKeys.map(canonicalRecommendationKey).filter(Boolean));

  const scored = candidates
    .filter((candidate) => !suppressed.has(canonicalRecommendationKey(candidate.canonicalKey)))
    .map((candidate) => {
      const marketScore = scoreMarketSignals(candidate.recentSignals, now);
      const feedbackScore = clamp(
        Array.from(new Set(candidate.matchedTags)).reduce((sum, tag) => sum + (feedback.tagAdjustments[tag] || 0), 0) * 1.5,
        -MAX_RECOMMENDATION_CANDIDATE_ADJUSTMENT,
        MAX_RECOMMENDATION_CANDIDATE_ADJUSTMENT,
      );
      const tasteScore = candidate.baseScore * confidenceMultiplier(candidate) + feedbackScore;
      const adjustedScore = tasteScore + marketScore;
      return {
        ...candidate,
        tasteScore: Math.round(tasteScore * 10) / 10,
        adjustedScore: Math.round(adjustedScore * 10) / 10,
        marketScore,
      };
    })
    .filter((candidate) => candidate.adjustedScore > 0)
    .sort((a, b) => b.adjustedScore - a.adjustedScore || a.bottleName.localeCompare(b.bottleName));

  const selected: typeof scored = [];
  const producerCounts = new Map<string, number>();
  const mashBillCounts = new Map<string, number>();

  const canSelect = (candidate: (typeof scored)[number], strict: boolean) => {
    const producer = normalizeLabel(candidate.producer || "");
    const mashBill = normalizeLabel(candidate.mashBillFamily || "");
    const producerCount = producer ? producerCounts.get(producer) || 0 : 0;
    const mashBillCount = mashBill ? mashBillCounts.get(mashBill) || 0 : 0;
    if (strict && selected.length < 2 && producerCount > 0) return false;
    if (producerCount >= 2 || mashBillCount >= 2) return false;
    return true;
  };

  const addCandidate = (candidate: (typeof scored)[number]) => {
    selected.push(candidate);
    const producer = normalizeLabel(candidate.producer || "");
    const mashBill = normalizeLabel(candidate.mashBillFamily || "");
    if (producer) producerCounts.set(producer, (producerCounts.get(producer) || 0) + 1);
    if (mashBill) mashBillCounts.set(mashBill, (mashBillCounts.get(mashBill) || 0) + 1);
  };

  for (const strict of [true, false]) {
    for (const candidate of scored) {
      if (selected.length >= limit) break;
      if (selected.some((item) => item.canonicalKey === candidate.canonicalKey)) continue;
      if (canSelect(candidate, strict)) addCandidate(candidate);
    }
  }

  const bestTasteIndex = selected.reduce((bestIndex, candidate, index) => (
    candidate.tasteScore > (selected[bestIndex]?.tasteScore ?? Number.NEGATIVE_INFINITY) ? index : bestIndex
  ), 0);
  if (bestTasteIndex > 0) selected.unshift(selected.splice(bestTasteIndex, 1)[0]);
  const leadingProducer = normalizeLabel(selected[0]?.producer || "");
  if (leadingProducer && normalizeLabel(selected[1]?.producer || "") === leadingProducer) {
    const diverseIndex = selected.findIndex((candidate, index) => index > 1 && normalizeLabel(candidate.producer || "") !== leadingProducer);
    if (diverseIndex > 1) selected.splice(1, 0, selected.splice(diverseIndex, 1)[0]);
  }

  const firstProducer = normalizeLabel(selected[0]?.producer || "");
  return selected.map((candidate, index) => {
    let lane: RecommendationLane = "strong_match";
    if (index === 0) lane = "best_match";
    else if (candidate.marketScore >= 0.8) lane = "local_opportunity";
    else if (index >= 2 && normalizeLabel(candidate.producer || "") !== firstProducer) lane = "try_something_different";
    return { ...candidate, lane, laneLabel: laneLabel(lane) };
  });
}
