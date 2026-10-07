import { ADMIN_EMAIL, isAdminEmail } from "../../shared/admin-access.ts";
import { achievementCatalog, achievementDefinition, achievementDescription, canonicalBadgeId, badgeFamily } from "./achievement-catalog.ts";
import type { MemberSighting } from "@/lib/sightings";
import { communityLeaderBadge } from "../../shared/community-leader-badges.ts";

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
  moderationRejectedSightingIds?: string[];
}

export interface BadgeProgress {
  id: string;
  label: string;
  tier?: BadgeTier;
  current: number;
  target: number;
  earned: boolean;
  description?: string;
  category?: string;
  unit?: string;
  rules?: string;
  pointsAwarded?: number;
  context?: string;
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
  featuredBadgeIds?: string[];
  metricsAvailable?: boolean;
}

export const ADMIN_EMAILS = new Set([ADMIN_EMAIL]);
export const SIGHTING_POINTS_BY_RARITY = { unclassified: 10, limited: 10, allocated: 20, unicorn: 30 } as const;
export const BADGE_POINTS_AWARD = 10;
export const WEEKLY_STREAK_POINTS_AWARD = 10;

export const BADGE_DESCRIPTIONS = Object.fromEntries(achievementCatalog.map(item => [item.id,item.description]));
export const badgeDescription = achievementDescription;
export interface AchievementMetrics { availabilityUpdates?: number; qualifiedReferrals?: number; available?: boolean; featuredBadgeIds?: string[]; leaderAwards?: MemberBadgeAward[] }

export function isRewardsAdminEmail(email?: string | null) {
  return isAdminEmail(email);
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
  const definition=achievementDefinition(badge.id);
  return { ...badge, ...(definition ? {label:definition.name} : {}), ...(/^(spotter|unicorn_hunter)_diamond$/u.test(badge.id) ? {tier:"gold" as BadgeTier} : {}) };
}

function normalizeRewards(input: unknown): MemberRewardsProfile {
  const source = (input && typeof input === "object" ? input : {}) as Partial<MemberRewardsProfile>;
  return {
    points: typeof source.points === "number" && Number.isFinite(source.points) ? source.points : 0,
    ledger: Array.isArray(source.ledger) ? source.ledger.filter((entry): entry is MemberRewardLedgerEntry => Boolean(entry && typeof entry === "object" && entry.id)) : [],
    badges: Array.isArray(source.badges) ? source.badges.filter((badge): badge is MemberBadgeAward => Boolean(badge && typeof badge === "object" && badge.id)).map(normalizeBadgeAward).slice(0, 200) : [],
    currentWeeklyStreak: typeof source.currentWeeklyStreak === "number" ? source.currentWeeklyStreak : 0,
    longestWeeklyStreak: typeof source.longestWeeklyStreak === "number" ? source.longestWeeklyStreak : 0,
    moderationRejectedSightingIds: Array.isArray(source.moderationRejectedSightingIds) ? source.moderationRejectedSightingIds.filter(id=>typeof id==="string") : [],
    lastStreakWeek: typeof source.lastStreakWeek === "string" ? source.lastStreakWeek : undefined,
  };
}

function badgeAward(id: string, label: string, earnedAt: string, tier?: BadgeTier): MemberBadgeAward {
  return { id, label, tier, earnedAt, pointsAwarded: BADGE_POINTS_AWARD };
}

export function summarizeMemberRewards(sightings: MemberSighting[], existing?: unknown, metrics: AchievementMetrics = {}): MemberRewardsSummary {
  const rewards = normalizeRewards(existing);
  const activeSightings = sightings.filter((sighting) => !sighting.rewardState?.removedAt && !sighting.rewardState?.rejectedAt);
  const eligible = activeSightings.filter((sighting) => isEligibleRewardsTier(sighting.rarityTier));
  const helpful = activeSightings.filter((sighting) => communityVerified(Number(sighting.upCount || 0), Number(sighting.downCount || 0)));
  const photoSightings = activeSightings.filter((sighting) => {
    const status = sighting.rewardState?.photoProof?.status;
    return Boolean(sighting.rewardState?.photoProof?.url && status && status !== "none" && status !== "rejected");
  });
  const unicornSightings = eligible.filter((sighting) => sighting.rarityTier === "unicorn");
  const weekendWeeks = new Set(eligible.filter((sighting) => isWeekendWarriorWindow(sighting.createdAt, sighting.storeTimeZone)).map((sighting) => localWeekKey(sighting.createdAt, sighting.storeTimeZone)).filter(Boolean));
  const areaCounts = new Map<string, number>();
  for (const sighting of eligible) {
    const key = areaKey(sighting);
    if (key) areaCounts.set(key, (areaCounts.get(key) || 0) + 1);
  }
  const bestAreaCount = Math.max(0, ...Array.from(areaCounts.values()));

  const bestArea = [...areaCounts].sort((a,b)=>b[1]-a[1] || a[0].localeCompare(b[0]))[0]?.[0];
  const areaSighting=eligible.find(sighting=>areaKey(sighting)===bestArea);
  const city=areaSighting ? `${areaSighting.storeCity}, ${areaSighting.storeState}` : undefined;
  const stores = new Set(eligible.filter(s => s.sightingType === "seen_in_store").map(s => s.storeId || [s.storeName,s.storeAddress,s.storeCity,s.storeState].filter(Boolean).join("|").toLowerCase().trim()).filter(Boolean));
  const counts: Record<string,number> = {first_sighting:eligible.length,photo_finish:photoSightings.length,spotter:eligible.length,helpful_neighbor:helpful.length,unicorn_hunter:unicornSightings.length,local_scout:bestAreaCount,store_explorer:stores.size,availability_scout:metrics.availabilityUpdates ?? 0,community_builder:metrics.qualifiedReferrals ?? 0,weekend_warrior:weekendWeeks.size,streak:rewards.longestWeeklyStreak};
  const earned=new Set(rewards.badges.map(badge=>canonicalBadgeId(badge.id)));
  const progress: BadgeProgress[] = achievementCatalog.flatMap(definition => definition.milestones.map(milestone => {
    const id=milestone.tier ? `${definition.id}_${milestone.tier}` : definition.id;
    const isEarned=earned.has(id);
    return {id,label:definition.name,...(milestone.tier ? {tier:milestone.tier as BadgeTier} : {}),current:isEarned ? milestone.target : Math.min(counts[definition.id] ?? 0,milestone.target),target:milestone.target,earned:isEarned,description:achievementDescription(id),category:definition.category,unit:definition.unit,rules:definition.rules,pointsAwarded:milestone.points,...(definition.id==="local_scout" && city ? {context:city} : {})};
  }));

  for(const award of rewards.badges) {
    if(progress.some(item=>item.id===canonicalBadgeId(award.id)))continue;
    const weekend=award.id==="weekend_warrior_platinum";
    const target=weekend?40:1;
    progress.push({id:award.id,label:award.label,...(award.tier?{tier:award.tier}:{}),current:target,target,earned:true,description:weekend?"Post sightings on 40 different weekends.":"Earned this milestone in the original badge program.",category:weekend?"Consistency":"Legacy",unit:weekend?"weekends":"milestones",rules:"This milestone was earned in the original program. It remains in your collection; new progress uses the current badge families.",pointsAwarded:award.pointsAwarded});
  }
  const leaderAwards = (metrics.leaderAwards || []).filter(award => communityLeaderBadge(award.id) && award.pointsAwarded === 0);
  const badges = [...rewards.badges, ...leaderAwards.filter(award => !rewards.badges.some(existing => existing.id === award.id))];
  for (const award of leaderAwards) {
    const definition = communityLeaderBadge(award.id)!;
    progress.push({ id: award.id, label: definition.label, current: 1, target: 1, earned: true, description: definition.description, category: "Leaders", unit: "awards", rules: definition.rules, pointsAwarded: 0 });
  }
  return {
    points: rewards.points,
    currentWeeklyStreak: rewards.currentWeeklyStreak,
    longestWeeklyStreak: rewards.longestWeeklyStreak,
    badges,
    badgeProgress: progress,
    featuredBadgeIds: (metrics.featuredBadgeIds || []).filter(id => badges.some(badge=>badge.id===id)).slice(0,3),
    metricsAvailable: metrics.available !== false,
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

function updateWeeklyStreak(rewards: MemberRewardsProfile, activeSightings: MemberSighting[], now: string) {
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

  const latest=activeSightings.filter(s=>isEligibleRewardsTier(s.rarityTier)).sort((a,b)=>b.createdAt.localeCompare(a.createdAt))[0];
  const currentWeek=localWeekKey(now,latest?.storeTimeZone);
  const previousDate=new Date(`${currentWeek}T00:00:00Z`);previousDate.setUTCDate(previousDate.getUTCDate()-7);
  const previousWeek=previousDate.toISOString().slice(0,10);
  rewards.currentWeeklyStreak = weeks[weeks.length-1]===currentWeek || weeks[weeks.length-1]===previousWeek ? current : 0;
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

export function reconcileMemberRewards(sightings: MemberSighting[], existing?: unknown, now = new Date().toISOString(), metrics: AchievementMetrics = {}) {
  const rewards = normalizeRewards(existing);
  const previousBadges = new Map(rewards.badges.map((badge) => [canonicalBadgeId(badge.id), badge]));
  const previousBest = rewards.longestWeeklyStreak;
  const rejectedIds = sightings.filter(sighting=>Boolean(sighting.rewardState?.rejectedAt)).map(sighting=>sighting.id);
  const moderationChanged = rejectedIds.some(id=>!rewards.moderationRejectedSightingIds?.includes(id));
  rewards.moderationRejectedSightingIds = rejectedIds;
  deactivateManagedRewards(rewards, now);
  rewards.badges = [];
  rewards.currentWeeklyStreak = 0;
  rewards.longestWeeklyStreak = 0;
  rewards.lastStreakWeek = undefined;

  const activeSightings = sightings.filter((sighting) => !sighting.rewardState?.removedAt && !sighting.rewardState?.rejectedAt);
  for (const sighting of activeSightings) reconcileSightingBasePoints(rewards, sighting);
  const streakBonusPoints = updateWeeklyStreak(rewards, activeSightings, now);
  if (!moderationChanged) rewards.longestWeeklyStreak=Math.max(previousBest,rewards.longestWeeklyStreak);

  const summary = summarizeMemberRewards(activeSightings, rewards, metrics);
  const awardIf = (condition: boolean, award: MemberBadgeAward) => {
    if (!condition || rewards.badges.some((badge) => badge.id === award.id)) return;
    const previous = previousBadges.get(canonicalBadgeId(award.id));
    const nextAward = previous ? { ...award, earnedAt: previous.earnedAt } : award;
    rewards.badges = [nextAward, ...rewards.badges].slice(0, 200);
    addLedger(rewards, { badgeId: nextAward.id, reason: "badge_v3", points: nextAward.pointsAwarded, createdAt: nextAward.earnedAt });
  };

  // Ordinary expiry, deletion, vote changes and broken streaks do not erase recognition.
  // Explicit moderation can remove a milestone whose supporting count no longer qualifies.
  const qualification=new Map(summary.badgeProgress.map(progress=>[progress.id,progress.current>=progress.target]));
  for(const previous of previousBadges.values()) {
    const family=badgeFamily(previous.id);
    const external=family==="availability_scout" || family==="community_builder";
    const retired=family==="clean_signal" || family==="sharp_eye";
    if(!moderationChanged || external || (qualification.get(canonicalBadgeId(previous.id)) ?? (retired && summary.eligibleSightings>0))) {
      rewards.badges.push(previous);
      addLedger(rewards,{badgeId:previous.id,reason:"badge_v3",points:previous.pointsAwarded,createdAt:previous.earnedAt});
    }
  }
  for (const progress of summary.badgeProgress) {
    if (communityLeaderBadge(progress.id)) continue; // Award storage is separate from Signal Points.
    if(rewards.badges.some(badge=>canonicalBadgeId(badge.id)===progress.id)) continue;
    const award=badgeAward(progress.id,progress.label,now,progress.tier);
    award.pointsAwarded=progress.pointsAwarded ?? 0;
    awardIf(progress.current >= progress.target, award);
  }

  const unmanagedPoints = rewards.ledger
    .filter((entry) => !entry.revokedAt && !isManagedRewardEntry(entry))
    .reduce((total, entry) => total + entry.points, 0);
  const basePoints = activeSightings.reduce((total, sighting) => total + basePointsForSighting(sighting), 0);
  const badgePoints = rewards.badges.reduce((total, badge) => total + badge.pointsAwarded, 0);
  rewards.points = Math.max(0, unmanagedPoints + basePoints + streakBonusPoints + badgePoints);
  return rewards;
}
