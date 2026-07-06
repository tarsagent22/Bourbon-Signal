import type { MemberSighting } from "@/lib/sightings";

export type SightingVerificationSource = "photo" | "community";
export type SightingPhotoReviewStatus = "none" | "pending" | "verified_public" | "verified_private" | "rejected";
export type BadgeTier = "bronze" | "silver" | "gold" | "platinum" | "diamond";

export interface SightingPhotoProof {
  url: string;
  pathname?: string;
  uploadedAt: string;
  status: SightingPhotoReviewStatus;
  reviewedAt?: string;
  reviewedBy?: string;
  rejectionReason?: string;
  publicUrl?: string | null;
}

export interface SightingRewardState {
  basePointsAwarded?: number;
  verificationPointAwarded?: boolean;
  unicornPointAwarded?: boolean;
  revokedPoints?: number;
  removedAt?: string;
  rejectedAt?: string;
  helpfulAt?: string;
  verificationSources?: SightingVerificationSource[];
  verifiedAt?: string;
  photoProof?: SightingPhotoProof;
}

export interface MemberRewardLedgerEntry {
  id: string;
  sightingId?: string;
  badgeId?: string;
  reason: string;
  points: number;
  createdAt: string;
  revokedAt?: string;
}

export interface MemberBadgeAward {
  id: string;
  label: string;
  tier?: BadgeTier;
  earnedAt: string;
  pointsAwarded: number;
}

export interface MemberRewardsProfile {
  points: number;
  ledger: MemberRewardLedgerEntry[];
  badges: MemberBadgeAward[];
  currentWeeklyStreak: number;
  longestWeeklyStreak: number;
  lastStreakWeek?: string;
}

export interface BadgeProgress {
  id: string;
  label: string;
  tier?: BadgeTier;
  current: number;
  target: number;
  earned: boolean;
}

export interface MemberRewardsSummary {
  points: number;
  currentWeeklyStreak: number;
  longestWeeklyStreak: number;
  badges: MemberBadgeAward[];
  badgeProgress: BadgeProgress[];
  eligibleSightings: number;
  helpfulSightings: number;
  photoSightings: number;
  /** @deprecated Member sightings no longer use verification. Kept for old clients. */
  verifiedSightings: number;
}

export const ADMIN_EMAILS = new Set(["chandler@bourbonsignal.com", "chandlertodd22@gmail.com"]);

export function isRewardsAdminEmail(email?: string | null) {
  return Boolean(email && ADMIN_EMAILS.has(email.trim().toLowerCase()));
}

export function isEligibleRewardsTier(tier?: MemberSighting["rarityTier"]) {
  return tier === "allocated" || tier === "unicorn";
}

export function basePointsForSighting(sighting: Pick<MemberSighting, "rarityTier">) {
  if (sighting.rarityTier === "unicorn") return 2;
  if (sighting.rarityTier === "allocated") return 1;
  return 0;
}

export function communityVerified(upCount = 0, downCount = 0) {
  return upCount >= 3 && upCount - downCount >= 3;
}

export function isSightingVerified(sighting: Pick<MemberSighting, "rewardState" | "upCount" | "downCount">) {
  const sources = sighting.rewardState?.verificationSources || [];
  return sources.includes("photo") || sources.includes("community") || communityVerified(sighting.upCount || 0, sighting.downCount || 0);
}

export function publicProofUrl(sighting: Pick<MemberSighting, "rewardState">) {
  const proof = sighting.rewardState?.photoProof;
  if (!proof) return null;
  if (proof.status !== "verified_public") return null;
  return proof.publicUrl || proof.url || null;
}

export function localWeekKey(dateValue: string, timeZone?: string) {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timeZone || "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const local = new Date(Date.UTC(Number(parts.year), Number(parts.month) - 1, Number(parts.day)));
  const day = local.getUTCDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  local.setUTCDate(local.getUTCDate() + mondayOffset);
  return `${local.getUTCFullYear()}-${String(local.getUTCMonth() + 1).padStart(2, "0")}-${String(local.getUTCDate()).padStart(2, "0")}`;
}

export function isWeekendWarriorWindow(dateValue: string, timeZone?: string) {
  const date = new Date(dateValue);
  if (!Number.isFinite(date.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timeZone || "America/New_York",
    weekday: "short",
    hour: "numeric",
    hour12: false,
  }).formatToParts(date).reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const weekday = parts.weekday;
  const hour = Number(parts.hour || 0);
  return weekday === "Sat" || weekday === "Sun" || (weekday === "Fri" && hour >= 17);
}

function areaKey(sighting: MemberSighting) {
  const state = (sighting.storeState || "").toUpperCase();
  const city = (sighting.storeCity || "").toLowerCase().trim();
  return [state, city].filter(Boolean).join(":") || state || "unknown";
}

function tierProgress(id: string, label: string, current: number, thresholds: Array<[BadgeTier, number]>, awards: MemberBadgeAward[]): BadgeProgress[] {
  return thresholds.map(([tier, target]) => ({
    id: `${id}_${tier}`,
    label,
    tier,
    current: Math.min(current, target),
    target,
    earned: awards.some((award) => award.id === `${id}_${tier}`),
  }));
}

function normalizeBadgeAward(badge: MemberBadgeAward): MemberBadgeAward {
  if (badge.id === "verified_scout") return { ...badge, id: "helpful_neighbor", label: "Helpful Neighbor" };
  if (/verified/i.test(badge.label)) return { ...badge, label: badge.label.replace(/Verified Scout/gi, "Helpful Neighbor").replace(/verified/gi, "helpful") };
  return badge;
}

function normalizeRewards(input: unknown): MemberRewardsProfile {
  const source = (input && typeof input === "object" ? input : {}) as Partial<MemberRewardsProfile>;
  return {
    points: typeof source.points === "number" && Number.isFinite(source.points) ? source.points : 0,
    ledger: Array.isArray(source.ledger) ? source.ledger.filter((entry): entry is MemberRewardLedgerEntry => Boolean(entry && typeof entry === "object" && entry.id)).slice(0, 1000) : [],
    badges: Array.isArray(source.badges) ? source.badges.filter((badge): badge is MemberBadgeAward => Boolean(badge && typeof badge === "object" && badge.id)).map(normalizeBadgeAward).slice(0, 200) : [],
    currentWeeklyStreak: typeof source.currentWeeklyStreak === "number" ? source.currentWeeklyStreak : 0,
    longestWeeklyStreak: typeof source.longestWeeklyStreak === "number" ? source.longestWeeklyStreak : 0,
    lastStreakWeek: typeof source.lastStreakWeek === "string" ? source.lastStreakWeek : undefined,
  };
}

function badgeAward(id: string, label: string, earnedAt: string, tier?: BadgeTier): MemberBadgeAward {
  return { id, label, tier, earnedAt, pointsAwarded: 1 };
}

export function summarizeMemberRewards(sightings: MemberSighting[], existing?: unknown): MemberRewardsSummary {
  const rewards = normalizeRewards(existing);
  const activeSightings = sightings.filter((sighting) => !sighting.rewardState?.removedAt && !sighting.rewardState?.rejectedAt);
  const eligible = activeSightings.filter((sighting) => isEligibleRewardsTier(sighting.rarityTier));
  const helpful = activeSightings.filter((sighting) => Boolean(sighting.rewardState?.helpfulAt) || (sighting.upCount || 0) >= 3);
  const photoSightings = activeSightings.filter((sighting) => {
    const status = sighting.rewardState?.photoProof?.status;
    return Boolean(status && status !== "rejected");
  });
  const unicornSightings = eligible.filter((sighting) => sighting.rarityTier === "unicorn");
  const weekendWeeks = new Set(eligible.filter((sighting) => isWeekendWarriorWindow(sighting.createdAt, sighting.storeTimeZone)).map((sighting) => localWeekKey(sighting.createdAt, sighting.storeTimeZone)).filter(Boolean));
  const areaCounts = new Map<string, number>();
  for (const sighting of eligible) areaCounts.set(areaKey(sighting), (areaCounts.get(areaKey(sighting)) || 0) + 1);
  const bestAreaCount = Math.max(0, ...Array.from(areaCounts.values()));

  const progress: BadgeProgress[] = [
    { id: "first_sighting", label: "First Sighting", current: Math.min(eligible.length, 1), target: 1, earned: rewards.badges.some((badge) => badge.id === "first_sighting") },
    { id: "helpful_neighbor", label: "Helpful Neighbor", current: Math.min(helpful.length, 1), target: 1, earned: rewards.badges.some((badge) => badge.id === "helpful_neighbor") },
    { id: "photo_finish", label: "Photo Finish", current: Math.min(photoSightings.length, 1), target: 1, earned: rewards.badges.some((badge) => badge.id === "photo_finish") },
    ...tierProgress("spotter", "Spotter", eligible.length, [["bronze", 5], ["silver", 25], ["diamond", 50]], rewards.badges),
    ...tierProgress("unicorn_hunter", "Unicorn Hunter", unicornSightings.length, [["bronze", 1], ["silver", 5], ["diamond", 15]], rewards.badges),
    ...tierProgress("sharp_eye", "Sharp Eye", helpful.length, [["bronze", 5], ["silver", 25], ["gold", 75]], rewards.badges),
    ...tierProgress("local_scout", "Local Scout", bestAreaCount, [["bronze", 5], ["silver", 15], ["gold", 40]], rewards.badges),
    ...tierProgress("weekend_warrior", "Weekend Warrior", weekendWeeks.size, [["bronze", 3], ["silver", 8], ["gold", 20], ["platinum", 40]], rewards.badges),
    { id: "clean_signal_bronze", label: "Clean Signal", tier: "bronze", current: Math.min(eligible.length, 10), target: 10, earned: rewards.badges.some((badge) => badge.id === "clean_signal_bronze") },
    { id: "clean_signal_silver", label: "Clean Signal", tier: "silver", current: Math.min(eligible.length, 25), target: 25, earned: rewards.badges.some((badge) => badge.id === "clean_signal_silver") },
    { id: "clean_signal_gold", label: "Clean Signal", tier: "gold", current: Math.min(eligible.length, 50), target: 50, earned: rewards.badges.some((badge) => badge.id === "clean_signal_gold") },
    ...tierProgress("streak", "Streak", rewards.currentWeeklyStreak, [["bronze", 2], ["silver", 4], ["gold", 8]], rewards.badges),
  ];

  return {
    points: rewards.points,
    currentWeeklyStreak: rewards.currentWeeklyStreak,
    longestWeeklyStreak: rewards.longestWeeklyStreak,
    badges: rewards.badges,
    badgeProgress: progress,
    eligibleSightings: eligible.length,
    helpfulSightings: helpful.length,
    photoSightings: photoSightings.length,
    verifiedSightings: 0,
  };
}

function addLedger(rewards: MemberRewardsProfile, entry: Omit<MemberRewardLedgerEntry, "id" | "createdAt"> & { createdAt?: string }) {
  const createdAt = entry.createdAt || new Date().toISOString();
  const id = `${entry.reason}:${entry.sightingId || entry.badgeId || "member"}:${createdAt}`;
  if (rewards.ledger.some((item) => item.id === id || (!item.revokedAt && item.reason === entry.reason && item.sightingId === entry.sightingId && item.badgeId === entry.badgeId))) return;
  rewards.ledger = [{ id, createdAt, ...entry }, ...rewards.ledger].slice(0, 1000);
  rewards.points += entry.points;
}

function updateWeeklyStreak(rewards: MemberRewardsProfile, activeSightings: MemberSighting[], now: string) {
  const weeks = Array.from(new Set(activeSightings
    .filter((sighting) => isEligibleRewardsTier(sighting.rarityTier))
    .map((sighting) => localWeekKey(sighting.createdAt, sighting.storeTimeZone))
    .filter(Boolean)))
    .sort();
  if (weeks.length === 0) {
    rewards.currentWeeklyStreak = 0;
    return;
  }
  let current = 1;
  let longest = Math.max(rewards.longestWeeklyStreak || 0, 1);
  for (let index = 1; index < weeks.length; index += 1) {
    const previous = new Date(`${weeks[index - 1]}T00:00:00Z`);
    const expected = new Date(previous);
    expected.setUTCDate(previous.getUTCDate() + 7);
    const expectedKey = `${expected.getUTCFullYear()}-${String(expected.getUTCMonth() + 1).padStart(2, "0")}-${String(expected.getUTCDate()).padStart(2, "0")}`;
    current = weeks[index] === expectedKey ? current + 1 : 1;
    longest = Math.max(longest, current);
  }
  rewards.currentWeeklyStreak = current;
  rewards.longestWeeklyStreak = longest;
  rewards.lastStreakWeek = weeks[weeks.length - 1];
  if (current >= 2) addLedger(rewards, { badgeId: `streak_week_${weeks[weeks.length - 1]}`, reason: "streak_maintained", points: 1, createdAt: now });
}

function revokeInvalidSightingPoints(rewards: MemberRewardsProfile, sightings: MemberSighting[], now: string) {
  const invalidIds = new Set(sightings.filter((sighting) => sighting.rewardState?.removedAt || sighting.rewardState?.rejectedAt).map((sighting) => sighting.id));
  if (!invalidIds.size) return;
  rewards.ledger = rewards.ledger.map((entry) => {
    if (!entry.sightingId || !invalidIds.has(entry.sightingId) || entry.revokedAt) return entry;
    rewards.points -= entry.points;
    return { ...entry, revokedAt: now };
  });
}

export function reconcileMemberRewards(sightings: MemberSighting[], existing?: unknown, now = new Date().toISOString()) {
  const rewards = normalizeRewards(existing);
  revokeInvalidSightingPoints(rewards, sightings, now);
  const activeSightings = sightings.filter((sighting) => !sighting.rewardState?.removedAt && !sighting.rewardState?.rejectedAt);
  for (const sighting of activeSightings) {
    const base = basePointsForSighting(sighting);
    if (base > 0) addLedger(rewards, { sightingId: sighting.id, reason: "sighting_base", points: base, createdAt: sighting.createdAt });
  }
  updateWeeklyStreak(rewards, activeSightings, now);

  const summary = summarizeMemberRewards(activeSightings, rewards);
  const awardIf = (condition: boolean, award: MemberBadgeAward) => {
    if (!condition || rewards.badges.some((badge) => badge.id === award.id)) return;
    rewards.badges = [award, ...rewards.badges].slice(0, 200);
    addLedger(rewards, { badgeId: award.id, reason: "badge", points: award.pointsAwarded, createdAt: award.earnedAt });
  };

  awardIf(summary.eligibleSightings >= 1, badgeAward("first_sighting", "First Sighting", now));
  awardIf(summary.helpfulSightings >= 1, badgeAward("helpful_neighbor", "Helpful Neighbor", now));
  awardIf(summary.photoSightings >= 1, badgeAward("photo_finish", "Photo Finish", now));
  for (const progress of summary.badgeProgress) {
    if (progress.id === "first_sighting" || progress.id === "helpful_neighbor" || progress.id === "photo_finish") continue;
    awardIf(progress.current >= progress.target, badgeAward(progress.id, progress.label, now, progress.tier));
  }

  return rewards;
}
