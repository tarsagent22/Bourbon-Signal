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
export const SIGHTING_POINTS_BY_RARITY = { unclassified: 10, limited: 10, allocated: 20, unicorn: 30 } as const;
export const BADGE_POINTS_AWARD = 10;
export const WEEKLY_STREAK_POINTS_AWARD = 10;

export const BADGE_DESCRIPTIONS = {
  first_sighting: "Post 1 eligible bottle sighting that remains active.",
  helpful_neighbor: "Post 1 active sighting that receives at least 3 upvotes and maintains a net score of at least 3.",
  photo_finish: "Attach a photo to 1 sighting that remains active and is not rejected.",
  spotter: "Post eligible bottle sightings. Badge tiers unlock at 5, 25, and 50 sightings.",
  unicorn_hunter: "Post unicorn-tier sightings. Badge tiers unlock at 1, 5, and 15 unicorn sightings.",
  sharp_eye: "Post active sightings that each receive at least 3 upvotes and maintain a net score of at least 3. Badge tiers unlock at 5, 25, and 75 helpful sightings.",
  local_scout: "Post eligible sightings with the same recorded state and city. Badge tiers unlock at 5, 15, and 40 sightings in one location.",
  weekend_warrior: "Post during separate weekend weeks, from Friday at 5 p.m. local time through Sunday. Badge tiers unlock at 3, 8, 20, and 40 weekends.",
  clean_signal: "Post eligible sightings that remain active. Badge tiers unlock at 10, 25, and 50 active sightings.",
  streak: "Post at least 1 eligible sighting in consecutive weeks. Badge tiers unlock at 2, 4, and 8 weeks.",
} as const;

export function badgeDescription(id: string) {
  const key = id.replace(/_(bronze|silver|gold|platinum|diamond)$/u, "") as keyof typeof BADGE_DESCRIPTIONS;
  return BADGE_DESCRIPTIONS[key] || "Badge requirements are not available.";
}

export function isRewardsAdminEmail(email?: string | null) {
  return Boolean(email && ADMIN_EMAILS.has(email.trim().toLowerCase()));
}

export function isEligibleRewardsTier(tier?: MemberSighting["rarityTier"]) {
  return tier == null || tier === "limited" || tier === "allocated" || tier === "unicorn";
}

export function basePointsForSighting(sighting: Pick<MemberSighting, "rarityTier">) {
  if (sighting.rarityTier === "unicorn") return SIGHTING_POINTS_BY_RARITY.unicorn;
  if (sighting.rarityTier === "allocated") return SIGHTING_POINTS_BY_RARITY.allocated;
  if (sighting.rarityTier === "limited") return SIGHTING_POINTS_BY_RARITY.limited;
  return SIGHTING_POINTS_BY_RARITY.unclassified;
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
  return state && city ? `${state}:${city}` : null;
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
    ledger: Array.isArray(source.ledger) ? source.ledger.filter((entry): entry is MemberRewardLedgerEntry => Boolean(entry && typeof entry === "object" && entry.id)) : [],
    badges: Array.isArray(source.badges) ? source.badges.filter((badge): badge is MemberBadgeAward => Boolean(badge && typeof badge === "object" && badge.id)).map(normalizeBadgeAward).slice(0, 200) : [],
    currentWeeklyStreak: typeof source.currentWeeklyStreak === "number" ? source.currentWeeklyStreak : 0,
    longestWeeklyStreak: typeof source.longestWeeklyStreak === "number" ? source.longestWeeklyStreak : 0,
    lastStreakWeek: typeof source.lastStreakWeek === "string" ? source.lastStreakWeek : undefined,
  };
}

function badgeAward(id: string, label: string, earnedAt: string, tier?: BadgeTier): MemberBadgeAward {
  return { id, label, tier, earnedAt, pointsAwarded: BADGE_POINTS_AWARD };
}

export function summarizeMemberRewards(sightings: MemberSighting[], existing?: unknown): MemberRewardsSummary {
  const rewards = normalizeRewards(existing);
  const activeSightings = sightings.filter((sighting) => !sighting.rewardState?.removedAt && !sighting.rewardState?.rejectedAt);
  const eligible = activeSightings.filter((sighting) => isEligibleRewardsTier(sighting.rarityTier));
  const helpful = activeSightings.filter((sighting) => communityVerified(Number(sighting.upCount || 0), Number(sighting.downCount || 0)));
  const photoSightings = activeSightings.filter((sighting) => {
    const status = sighting.rewardState?.photoProof?.status;
    return Boolean(status && status !== "rejected");
  });
  const unicornSightings = eligible.filter((sighting) => sighting.rarityTier === "unicorn");
  const weekendWeeks = new Set(eligible.filter((sighting) => isWeekendWarriorWindow(sighting.createdAt, sighting.storeTimeZone)).map((sighting) => localWeekKey(sighting.createdAt, sighting.storeTimeZone)).filter(Boolean));
  const areaCounts = new Map<string, number>();
  for (const sighting of eligible) {
    const key = areaKey(sighting);
    if (key) areaCounts.set(key, (areaCounts.get(key) || 0) + 1);
  }
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

const MANAGED_REWARD_REASONS = new Set(["badge", "badge_v2", "badge_v3", "streak_maintained", "streak_maintained_v2", "streak_maintained_v3"]);

function isManagedRewardEntry(entry: MemberRewardLedgerEntry) {
  return entry.reason.startsWith("sighting_") || MANAGED_REWARD_REASONS.has(entry.reason);
}

function deactivateManagedRewards(rewards: MemberRewardsProfile, now: string) {
  rewards.ledger = rewards.ledger.map((entry) => (
    isManagedRewardEntry(entry) && !entry.revokedAt ? { ...entry, revokedAt: now } : entry
  ));
  rewards.points = rewards.ledger.filter((entry) => !entry.revokedAt).reduce((total, entry) => total + entry.points, 0);
}

function addLedger(rewards: MemberRewardsProfile, entry: Omit<MemberRewardLedgerEntry, "id" | "createdAt"> & { createdAt?: string }) {
  const createdAt = entry.createdAt || new Date().toISOString();
  const existingIndex = rewards.ledger.findIndex((item) => item.reason === entry.reason && item.sightingId === entry.sightingId && item.badgeId === entry.badgeId);
  if (existingIndex >= 0) {
    const existing = rewards.ledger[existingIndex];
    rewards.ledger[existingIndex] = { ...existing, ...entry, createdAt: existing.createdAt || createdAt, revokedAt: undefined };
    rewards.points += entry.points;
    return;
  }
  const id = `${entry.reason}:${entry.sightingId || entry.badgeId || "member"}`;
  rewards.ledger = [{ id, createdAt, ...entry }, ...rewards.ledger];
  rewards.points += entry.points;
}

function updateWeeklyStreak(rewards: MemberRewardsProfile, activeSightings: MemberSighting[]) {
  const weeks = Array.from(new Set(activeSightings
    .filter((sighting) => isEligibleRewardsTier(sighting.rarityTier))
    .map((sighting) => localWeekKey(sighting.createdAt, sighting.storeTimeZone))
    .filter(Boolean)))
    .sort();
  if (weeks.length === 0) return 0;

  let current = 1;
  let longest = 1;
  let streakBonusPoints = 0;
  for (let index = 1; index < weeks.length; index += 1) {
    const previous = new Date(`${weeks[index - 1]}T00:00:00Z`);
    const expected = new Date(previous);
    expected.setUTCDate(previous.getUTCDate() + 7);
    const expectedKey = `${expected.getUTCFullYear()}-${String(expected.getUTCMonth() + 1).padStart(2, "0")}-${String(expected.getUTCDate()).padStart(2, "0")}`;
    current = weeks[index] === expectedKey ? current + 1 : 1;
    longest = Math.max(longest, current);
    if (current >= 2) {
      streakBonusPoints += WEEKLY_STREAK_POINTS_AWARD;
      addLedger(rewards, {
        badgeId: `streak_week_${weeks[index]}`,
        reason: "streak_maintained_v3",
        points: WEEKLY_STREAK_POINTS_AWARD,
        createdAt: `${weeks[index]}T00:00:00.000Z`,
      });
    }
  }

  rewards.currentWeeklyStreak = current;
  rewards.longestWeeklyStreak = longest;
  rewards.lastStreakWeek = weeks[weeks.length - 1];
  return streakBonusPoints;
}

function reconcileSightingBasePoints(rewards: MemberRewardsProfile, sighting: MemberSighting) {
  addLedger(rewards, {
    sightingId: sighting.id,
    reason: "sighting_base_v4",
    points: basePointsForSighting(sighting),
    createdAt: sighting.createdAt,
  });
}

export function reconcileMemberRewards(sightings: MemberSighting[], existing?: unknown, now = new Date().toISOString()) {
  const rewards = normalizeRewards(existing);
  const previousBadges = new Map(rewards.badges.map((badge) => [badge.id, badge]));
  deactivateManagedRewards(rewards, now);
  rewards.badges = [];
  rewards.currentWeeklyStreak = 0;
  rewards.longestWeeklyStreak = 0;
  rewards.lastStreakWeek = undefined;

  const activeSightings = sightings.filter((sighting) => !sighting.rewardState?.removedAt && !sighting.rewardState?.rejectedAt);
  for (const sighting of activeSightings) reconcileSightingBasePoints(rewards, sighting);
  const streakBonusPoints = updateWeeklyStreak(rewards, activeSightings);

  const summary = summarizeMemberRewards(activeSightings, rewards);
  const awardIf = (condition: boolean, award: MemberBadgeAward) => {
    if (!condition || rewards.badges.some((badge) => badge.id === award.id)) return;
    const previous = previousBadges.get(award.id);
    const nextAward = previous ? { ...award, earnedAt: previous.earnedAt } : award;
    rewards.badges = [nextAward, ...rewards.badges].slice(0, 200);
    addLedger(rewards, { badgeId: nextAward.id, reason: "badge_v3", points: nextAward.pointsAwarded, createdAt: nextAward.earnedAt });
  };

  awardIf(summary.eligibleSightings >= 1, badgeAward("first_sighting", "First Sighting", now));
  awardIf(summary.helpfulSightings >= 1, badgeAward("helpful_neighbor", "Helpful Neighbor", now));
  awardIf(summary.photoSightings >= 1, badgeAward("photo_finish", "Photo Finish", now));
  for (const progress of summary.badgeProgress) {
    if (progress.id === "first_sighting" || progress.id === "helpful_neighbor" || progress.id === "photo_finish") continue;
    awardIf(progress.current >= progress.target, badgeAward(progress.id, progress.label, now, progress.tier));
  }

  const unmanagedPoints = rewards.ledger
    .filter((entry) => !entry.revokedAt && !isManagedRewardEntry(entry))
    .reduce((total, entry) => total + entry.points, 0);
  const basePoints = activeSightings.reduce((total, sighting) => total + basePointsForSighting(sighting), 0);
  const badgePoints = rewards.badges.reduce((total, badge) => total + badge.pointsAwarded, 0);
  rewards.points = Math.max(0, unmanagedPoints + basePoints + streakBonusPoints + badgePoints);
  return rewards;
}
