import { after, NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { getBourbonBible, searchBourbonBible, normalizeBottleKey as normalizeBibleBottleKey, type BibleBottle } from "@/lib/bourbonBible";
import { makeSightingId, normalizeBottleKey, type MemberSighting, type SightingType, type SightingVote, type SightingVoteKind, type SightingsPreferences } from "@/lib/sightings";
import { createCommunitySightingsRepository, type DurableSightingVote, type SightingFeedFilters } from "@/lib/community-sightings-repository";
import { getEntitlements } from "@/lib/entitlements";
import { getServerEntitlements } from "@/lib/server-entitlements";
import { canUseMemberSightingBoundary } from "@/lib/signals/sighting-pagination-policy";
import { isRewardsAdminEmail, reconcileMemberRewards, summarizeMemberRewards, type MemberRewardsSummary } from "@/lib/sighting-rewards";
import { verifiedPrimaryClerkEmail } from "@/lib/owner-auth";
import { memberSightingTierForAvailability, normalizeSightingsForRewards } from "@/lib/sighting-reward-tiers";
import { isLikelyDuplicateSighting, isSameReporterCanonicalDuplicateSighting, sanitizeManualSightingField, SIGHTING_DUPLICATE_WINDOW_MS } from "@/lib/sighting-review";
import { getQaPreviewTierFromRequest, isQaPreviewRequest } from "@/lib/preview-qa";
import { addBottleContribution } from "@/lib/bottle-contributions";
import { COMMUNITY_SIGHTINGS_DURABLE_CUTOVER } from "@/data/community-sightings-cutover";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";
import { publicSignalIdentityFromMetadata } from "@/lib/signals/signal-api-contract";
import { normalizeSignalRarities } from "@/lib/signals/signal-feed-filters";
import { idempotentSightingFingerprint, idempotentSightingId, sameIdempotentSighting } from "@/lib/signals/signal-api-idempotency";
import { communityDisplayNameFromMetadata, communityDisplayNameSeparateFromIdentity } from "@/lib/community-display-name";
import { canonicalSignalFeedAreaSelection, dropFeedStoreQueryMatches } from "@/lib/feed-area-options";
import { communityVoteAllowed } from "@/lib/community-contributor-standing";

function normalizeSightingType(value: unknown): SightingType {
  return value === "online_social" ? "online_social" : "seen_in_store";
}

function normalizeRarityTier(value: unknown): MemberSighting["rarityTier"] {
  return value === "unicorn" || value === "highly_allocated" ? "unicorn" : value === "allocated" || value === "limited" ? value : "limited";
}

function visibleSightingForRequester(sighting: MemberSighting, ownerPointsPreview: boolean) {
  const identity = sighting.reporterPublicIdentity;
  const displayName = communityDisplayNameSeparateFromIdentity(identity?.displayName, identity?.label)
    || communityDisplayNameSeparateFromIdentity(sighting.reporterDisplayName, identity?.label);
  const independentSighting: MemberSighting = {
    ...sighting,
    reporterDisplayName: displayName || "",
    reporterPublicIdentity: identity ? { ...identity, displayName: displayName || undefined } : undefined,
  };
  const { idempotencyFingerprint: _idempotencyFingerprint, ...safeSighting } = independentSighting;
  if (ownerPointsPreview) return safeSighting;
  const { rewardState: _rewardState, reporterBadges: _reporterBadges, ...visible } = safeSighting;
  return visible;
}


async function resolveSubmittedBottle(bottleName: string, bottleId?: string) {
  const matches = await searchBourbonBible(bottleName, 12);
  const normalizedName = normalizeBibleBottleKey(bottleName);
  const idMatch = matches.find((bottle) => bottle.id === bottleId);
  const bottleNameMatches = (bottle: BibleBottle) => normalizeBibleBottleKey(bottle.canonicalName) === normalizedName
    || bottle.aliases.some((alias) => normalizeBibleBottleKey(alias) === normalizedName);
  const exact = (idMatch && bottleNameMatches(idMatch) ? idMatch : null) || matches.find(bottleNameMatches);
  return exact || null;
}

function normalizePrefs(input: unknown): SightingsPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const submittedSightings = Array.isArray(source.submittedSightings) ? source.submittedSightings : [];
  const signalReports = Array.isArray(source.signalReports) ? source.signalReports : [];
  const sightingVotes = Array.isArray(source.sightingVotes) ? source.sightingVotes : [];
  return {
    submittedSightings: submittedSightings.filter((item): item is MemberSighting => Boolean(item && typeof item === "object" && (item as MemberSighting).id && (item as MemberSighting).bottleName)).slice(0, 100),
    signalReports: signalReports as SightingsPreferences["signalReports"],
    sightingVotes: sightingVotes.filter((item): item is SightingVote => Boolean(item && typeof item === "object" && (item as SightingVote).sightingId && ((item as SightingVote).kind === "up" || (item as SightingVote).kind === "down"))).slice(0, 500),
  };
}

function voteCounts(votes: DurableSightingVote[], currentUserId: string) {
  const votesByKey = new Map<string, DurableSightingVote>();
  for (const vote of votes) votesByKey.set(`${vote.sightingId}:${vote.userId}`, vote);
  const counts = new Map<string, { upCount: number; downCount: number; myVote: SightingVoteKind | null }>();
  for (const vote of votesByKey.values()) {
    const row = counts.get(vote.sightingId) || { upCount: 0, downCount: 0, myVote: null };
    if (vote.kind === "up") row.upCount += 1;
    if (vote.kind === "down") row.downCount += 1;
    if (vote.userId === currentUserId) row.myVote = vote.kind;
    counts.set(vote.sightingId, row);
  }
  return counts;
}

async function listUsers() {
  const client = await clerkClient();
  const users: Awaited<ReturnType<typeof client.users.getUserList>> extends { data: infer T } ? T : never = [] as never;
  let offset = 0;
  while (true) {
    const result = await client.users.getUserList({ limit: 100, offset });
    const page = Array.isArray(result) ? result : result.data;
    users.push(...page);
    if (page.length < 100) break;
    offset += page.length;
  }
  return users;
}

function dedupeSightings(items: MemberSighting[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

function primaryEmail(user: { emailAddresses?: unknown[]; primaryEmailAddressId?: unknown }) {
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses as Array<Record<string, unknown>> : [];
  const primaryId = typeof user.primaryEmailAddressId === "string" ? user.primaryEmailAddressId : "";
  const primary = emails.find((email) => email.id === primaryId) || emails[0];
  return typeof primary?.emailAddress === "string" ? primary.emailAddress : "";
}

function memberFacingBadgeLabel(label: unknown) {
  if (typeof label !== "string") return "";
  return label.replace(/Verified Scout/gi, "Helpful Neighbor").replace(/verified/gi, "helpful");
}

function rewardBadgeLabels(privateMetadata: Record<string, unknown>) {
  const rewards = privateMetadata.memberRewards && typeof privateMetadata.memberRewards === "object" ? privateMetadata.memberRewards as Record<string, unknown> : {};
  const badges = Array.isArray(rewards.badges) ? rewards.badges as Array<Record<string, unknown>> : [];
  return badges.slice(0, 2).map((badge) => [memberFacingBadgeLabel(badge.label), badge.tier].filter(Boolean).join(" "));
}

type LegacyReporter = {
  id: string;
  displayName: string;
  badges: string[];
};

type LegacyCommunitySnapshot = {
  sightings: MemberSighting[];
  votes: DurableSightingVote[];
  reporters: LegacyReporter[];
};

async function buildLegacyCommunitySnapshot(): Promise<LegacyCommunitySnapshot> {
  const users = await listUsers();
  const sightings: MemberSighting[] = [];
  const votes: DurableSightingVote[] = [];
  const reporters: LegacyReporter[] = [];

  for (const user of users) {
    const prefs = normalizePrefs(user.publicMetadata?.sightingsPreferences);
    sightings.push(...prefs.submittedSightings.map((sighting) => ({ ...sighting, reporterUserId: user.id })));
    votes.push(...(prefs.sightingVotes || []).map((vote) => ({ ...vote, userId: user.id })));
    reporters.push({
      id: user.id,
      displayName: communityDisplayNameFromMetadata(user.publicMetadata) || "",
      badges: rewardBadgeLabels((user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>),
    });
  }

  return { sightings, votes, reporters };
}

const LEGACY_COMMUNITY_CACHE_TTL_MS = 5 * 60 * 1_000;
let legacyCommunityCache: { snapshot: LegacyCommunitySnapshot; expiresAt: number } | null = null;
let legacyCommunityInFlight: Promise<LegacyCommunitySnapshot> | null = null;

async function readCachedLegacyCommunitySnapshot() {
  const now = Date.now();
  if (legacyCommunityCache && legacyCommunityCache.expiresAt > now) return legacyCommunityCache.snapshot;
  if (legacyCommunityInFlight) return legacyCommunityInFlight;

  legacyCommunityInFlight = buildLegacyCommunitySnapshot()
    .then((snapshot) => {
      legacyCommunityCache = { snapshot, expiresAt: Date.now() + LEGACY_COMMUNITY_CACHE_TTL_MS };
      return snapshot;
    })
    .finally(() => {
      legacyCommunityInFlight = null;
    });
  return legacyCommunityInFlight;
}

async function persistMemberRewardsBestEffort(client: Awaited<ReturnType<typeof clerkClient>>, userId: string, memberRewards: unknown, rewardGeneration: number) {
  await createSignalPointsRepository().reconcileClerkRewards(userId, memberRewards, rewardGeneration);
  await client.users.updateUserMetadata(userId, { privateMetadata: { memberRewards } }).catch((error) => {
    console.error("Durable sighting rewards reconciled, but Clerk projection failed", error);
  });
}

function rewardsNeedPersistence(existing: unknown, next: unknown) {
  return JSON.stringify(existing ?? null) !== JSON.stringify(next ?? null);
}

async function getAggregateSightings(
  currentUserId: string,
  { includeOwned = false, requireLegacy = false, limit = 60, before = null, filters = {} }: { includeOwned?: boolean; requireLegacy?: boolean; limit?: number; before?: { createdAt: string; id: string } | null; filters?: SightingFeedFilters } = {},
) {
  const repository = createCommunitySightingsRepository();
  const legacy = requireLegacy || !COMMUNITY_SIGHTINGS_DURABLE_CUTOVER.completed
    ? await readCachedLegacyCommunitySnapshot()
    : null;
  const legacyIds = [...new Set((legacy?.sightings || []).map((sighting) => sighting.id))];
  const [durableFeed, durableOwned, durableLegacyOverlap] = await Promise.all([
    repository.listSightingsFeed(currentUserId, limit, before, filters),
    includeOwned ? repository.listSightingsForReporter(currentUserId) : Promise.resolve([]),
    repository.countSightingsByIds(legacyIds),
  ]);
  const durableVotes = await repository.listVotesForSightings(durableFeed.sightings.map((sighting) => sighting.id));
  const combinedCounts = voteCounts([...(legacy?.votes || []), ...durableVotes], currentUserId);
  const sightingsById = new Map<string, MemberSighting>();
  const reportersById = new Map<string, LegacyReporter>((legacy?.reporters || []).map((reporter) => [reporter.id, reporter]));
  const filterStates = new Set(filters.states || []);
  const filterRarities = new Set(filters.rarities || []);
  const filterBottle = filters.bottle?.trim().toLowerCase() || "";
  const filterSince = filters.since ? Date.parse(filters.since) : Number.NaN;
  const filterArea = filters.area?.trim() || "";
  const eligibleLegacySightings = (legacy?.sightings || []).filter((sighting) => {
    const beforeMatch = !before || sighting.createdAt < before.createdAt || (sighting.createdAt === before.createdAt && sighting.id > before.id);
    const stateMatch = !filterStates.size || filterStates.has(String(sighting.storeState || "").toUpperCase());
    const sightingRarity = String(sighting.rarityTier || "") === "highly_allocated" ? "unicorn" : String(sighting.rarityTier || "");
    const rarityMatch = !filterRarities.size || filterRarities.has(sightingRarity);
    const bottleMatch = !filterBottle || String(sighting.bottleName || "").toLowerCase().includes(filterBottle);
    const sinceMatch = !Number.isFinite(filterSince) || Date.parse(sighting.createdAt) >= filterSince;
    const areaMatch = !filterArea || dropFeedStoreQueryMatches({
      state: sighting.storeState,
      query: filterArea,
      fields: [sighting.storeName, sighting.storeAddress, sighting.storeCity],
    });
    return beforeMatch && stateMatch && rarityMatch && bottleMatch && sinceMatch && areaMatch;
  });
  for (const sighting of eligibleLegacySightings) sightingsById.set(sighting.id, sighting);
  for (const sighting of durableFeed.sightings) sightingsById.set(sighting.id, sighting);
  const sightings: MemberSighting[] = [];
  for (const sighting of sightingsById.values()) {
    const owner = sighting.reporterUserId ? reportersById.get(sighting.reporterUserId) : undefined;
    const row = combinedCounts.get(sighting.id) || { upCount: 0, downCount: 0, myVote: null };
    const identityLabel = sighting.reporterPublicIdentity?.label || "";
    const reporterDisplayName = communityDisplayNameSeparateFromIdentity(owner?.displayName, identityLabel)
      || communityDisplayNameSeparateFromIdentity(sighting.reporterPublicIdentity?.displayName, identityLabel)
      || communityDisplayNameSeparateFromIdentity(sighting.reporterDisplayName, identityLabel)
      || "";
    sightings.push({
      ...sighting,
      reporterDisplayName,
      reporterPublicIdentity: sighting.reporterPublicIdentity ? {
        ...sighting.reporterPublicIdentity,
        displayName: reporterDisplayName || undefined,
      } : undefined,
      reporterBadges: owner?.badges || sighting.reporterBadges,
      sightingType: normalizeSightingType(sighting.sightingType),
      rarityTier: normalizeRarityTier(sighting.rarityTier),
      rewardState: sighting.rewardState || {},
      upCount: row.upCount,
      downCount: row.downCount,
      myVote: row.myVote,
    });
  }
  const sortedSightings = sightings
    .sort((a, b) => {
      const timeDifference = +new Date(b.createdAt) - +new Date(a.createdAt);
      return timeDifference || a.id.localeCompare(b.id);
    })
    .slice(0, Math.max(1, Math.min(limit, 1_000)));
  return {
    sightings: sortedSightings,
    durableOwned,
    totalSightings: durableFeed.totalSightings + legacyIds.length - durableLegacyOverlap,
  };
}

async function requireSightingsEntitlements(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return getServerEntitlements(user.publicMetadata);
}

export async function GET(req: NextRequest) {
  if (isQaPreviewRequest(req)) {
    const entitlements = getEntitlements(getQaPreviewTierFromRequest(req));
    if (!entitlements.canReadSightings) return NextResponse.json({ error: "Member Sightings are included with Standard Proof and above.", qaPreview: true, qaTier: entitlements.tier }, { status: 403 });
    return NextResponse.json({ sightings: [], states: [], qaPreview: true, qaTier: entitlements.tier });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const ownerPointsPreview = isRewardsAdminEmail(verifiedPrimaryClerkEmail(user));
  const entitlements = await getServerEntitlements(user.publicMetadata);
  if (!entitlements.canReadSightings) {
    return NextResponse.json({ error: "Member Sightings are included with Standard Proof and above." }, { status: 403 });
  }

  const url = new URL(req.url);
  const includeRewards = url.searchParams.get("rewards") !== "0";
  const requestedSightingId = String(url.searchParams.get("sightingId") || "").slice(0, 160);
  if (requestedSightingId) {
    if (!/^[A-Za-z0-9._:-]{1,160}$/.test(requestedSightingId)) return NextResponse.json({ error: "Invalid sightingId" }, { status: 400 });
    const repository = createCommunitySightingsRepository();
    const stored = await repository.getSighting(requestedSightingId);
    if (!stored) return NextResponse.json({ sightings: [], states: [], previewLimit: entitlements.sightingsPreviewLimit, totalSightings: 0 });
    const counts = voteCounts(await repository.listVotesForSightings([requestedSightingId]), userId).get(requestedSightingId);
    const sighting = visibleSightingForRequester({
      ...stored,
      upCount: counts?.upCount || 0,
      downCount: counts?.downCount || 0,
      myVote: counts?.myVote || null,
    }, ownerPointsPreview);
    return NextResponse.json({ sightings: [sighting], states: sighting.storeState ? [sighting.storeState] : [], previewLimit: entitlements.sightingsPreviewLimit, totalSightings: 1 });
  }
  const requestedLimit = Number(url.searchParams.get("limit") || 60);
  const feedLimit = Number.isFinite(requestedLimit) ? Math.max(1, Math.min(Math.floor(requestedLimit), 1_000)) : 60;
  const requestedState = (url.searchParams.get("state") || "").trim().toUpperCase();
  const requestedBottle = (url.searchParams.get("bottle") || "").replace(/\s+/g, " ").trim();
  const requestedArea = (url.searchParams.get("area") || "").replace(/\s+/g, " ").trim();
  const requestedSince = url.searchParams.get("since");
  let requestedRarities: string[];
  try {
    requestedRarities = normalizeSignalRarities(url.searchParams.getAll("tiers"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Invalid rarity filter" }, { status: 400 });
  }
  if (requestedState && !/^[A-Z]{2}$/.test(requestedState)) return NextResponse.json({ error: "Invalid state filter" }, { status: 400 });
  const canonicalArea = requestedArea ? canonicalSignalFeedAreaSelection(requestedState, requestedArea) : null;
  if (requestedArea && !canonicalArea) return NextResponse.json({ error: "Invalid area filter" }, { status: 400 });
  if (requestedBottle.length > 100) return NextResponse.json({ error: "Invalid bottle filter" }, { status: 400 });
  if (requestedSince && !Number.isFinite(Date.parse(requestedSince))) return NextResponse.json({ error: "Invalid since timestamp" }, { status: 400 });
  const feedFilters: SightingFeedFilters = {
    states: requestedState ? [requestedState] : [],
    rarities: requestedRarities,
    bottle: requestedBottle || null,
    since: requestedSince || null,
    area: canonicalArea,
  };
  const beforeCreatedAt = url.searchParams.get("beforeCreatedAt");
  const beforeId = url.searchParams.get("beforeId");
  if (Boolean(beforeCreatedAt) !== Boolean(beforeId)
    || (beforeCreatedAt && !Number.isFinite(Date.parse(beforeCreatedAt)))
    || (beforeId && !/^[A-Za-z0-9._:-]{1,160}$/.test(beforeId))) {
    return NextResponse.json({ error: "Invalid member Signal boundary" }, { status: 400 });
  }
  const before = beforeCreatedAt && beforeId ? { createdAt: beforeCreatedAt, id: beforeId } : null;
  if (!canUseMemberSightingBoundary(entitlements.sightingsPreviewLimit, before)) {
    return NextResponse.json(
      { error: "Full Signal access is required to continue this feed." },
      { status: 403, headers: { "Cache-Control": "private, no-store" } },
    );
  }
  const rewardGeneration = includeRewards ? await createSignalPointsRepository().readRewardGeneration(userId) : 0;
  const aggregate = await getAggregateSightings(userId, { includeOwned: includeRewards, limit: feedLimit, before, filters: feedFilters });

  const allSightings = aggregate.sightings;
  const previewLimit = entitlements.sightingsPreviewLimit;
  const sightings = (previewLimit === null ? allSightings : allSightings.slice(0, previewLimit))
    .map((sighting) => visibleSightingForRequester(sighting, ownerPointsPreview));
  let rewards: MemberRewardsSummary | null = null;
  if (includeRewards) {
    const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
    const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
    const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
    const ownedSightings = dedupeSightings([...prefs.submittedSightings, ...aggregate.durableOwned]);
    const rewardSightings = normalizeSightingsForRewards(ownedSightings, await getBourbonBible());
    const nextRewards = reconcileMemberRewards(rewardSightings, privateMetadata.memberRewards);
    if (rewardsNeedPersistence(privateMetadata.memberRewards, nextRewards)) {
      await persistMemberRewardsBestEffort(client, userId, nextRewards, rewardGeneration);
    }
    rewards = summarizeMemberRewards(rewardSightings, nextRewards);
  }
  const states = Array.from(new Set(sightings.map((sighting) => sighting.storeState).filter(Boolean))).sort();
  return NextResponse.json({
    sightings,
    states,
    ...(includeRewards ? { rewards } : {}),
    previewLimit,
    totalSightings: aggregate.totalSightings,
  });
}

export async function POST(req: NextRequest) {
  if (isQaPreviewRequest(req)) {
    const entitlements = getEntitlements(getQaPreviewTierFromRequest(req));
    if (!entitlements.canSubmitSightings) return NextResponse.json({ error: "Submitting Member Sightings is included with Standard Proof and above.", qaPreview: true, qaTier: entitlements.tier }, { status: 403 });
    const payload = (await req.json().catch(() => ({}))) as Partial<MemberSighting>;
    const sighting: MemberSighting = {
      id: makeSightingId(),
      bottleName: String(payload.bottleName || "QA Preview Sighting"),
      bottleId: typeof payload.bottleId === "string" ? payload.bottleId : normalizeBottleKey(String(payload.bottleName || "QA Preview Sighting")),
      rarityTier: normalizeRarityTier(payload.rarityTier),
      storeId: String(payload.storeId || "qa-preview-store"),
      storeName: String(payload.storeName || "QA Preview Store"),
      storeAddress: String(payload.storeAddress || "Preview-only address"),
      storeCity: typeof payload.storeCity === "string" ? payload.storeCity : "Preview",
      storeState: typeof payload.storeState === "string" ? payload.storeState : "NC",
      storeZip: typeof payload.storeZip === "string" ? payload.storeZip : undefined,
      quantityEstimate: typeof payload.quantityEstimate === "string" ? payload.quantityEstimate : undefined,
      price: typeof payload.price === "number" ? payload.price : null,
      notes: typeof payload.notes === "string" ? payload.notes : "Preview-only QA sighting; not persisted.",
      source: "custom",
      sightingType: normalizeSightingType(payload.sightingType),
      reporterUserId: "qa-preview-user",
      createdAt: new Date().toISOString(),
    };
    return NextResponse.json({ ok: true, sighting, sightings: [sighting], qaPreview: true });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rawIdempotencyKey = req.headers.get("Idempotency-Key");
  const idempotencyKey = rawIdempotencyKey && /^[A-Za-z0-9._:-]{8,120}$/.test(rawIdempotencyKey.trim()) ? rawIdempotencyKey.trim() : null;
  if (rawIdempotencyKey && !idempotencyKey) return NextResponse.json({ error: "Invalid Idempotency-Key" }, { status: 400 });
  const entitlements = await requireSightingsEntitlements(userId);
  if (!entitlements.canSubmitSightings) {
    return NextResponse.json({ error: "Submitting Member Sightings is included with Standard Proof and above." }, { status: 403 });
  }
  const payload = (await req.json().catch(() => ({}))) as Partial<MemberSighting>;
  const requestedBottleName = sanitizeManualSightingField(payload.bottleName, 140);
  const requestedBottleId = typeof payload.bottleId === "string" ? payload.bottleId.slice(0, 160) : undefined;
  const catalogBottle = requestedBottleName ? await resolveSubmittedBottle(requestedBottleName, requestedBottleId) : null;
  const reviewInput = payload.reviewState && typeof payload.reviewState === "object" ? payload.reviewState : {};
  const needsBottleReview = Boolean(reviewInput.needsBottleReview || reviewInput.manualBottleName || !catalogBottle);
  const bottleName = catalogBottle?.canonicalName || requestedBottleName;
  const bottleId = catalogBottle?.id || normalizeBottleKey(bottleName);
  const rarityTier = needsBottleReview ? "limited" : memberSightingTierForAvailability(catalogBottle?.availability);
  const storeName = sanitizeManualSightingField(payload.storeName, 180);
  const storeAddress = sanitizeManualSightingField(payload.storeAddress, 220);
  const storeId = sanitizeManualSightingField(payload.storeId, 160);
  const needsStoreReview = Boolean(reviewInput.needsStoreReview || reviewInput.manualStoreName);
  const manualStoreCity = sanitizeManualSightingField(reviewInput.manualStoreCity || payload.storeCity, 120);
  const manualStoreState = sanitizeManualSightingField(reviewInput.manualStoreState || payload.storeState, 10).toUpperCase();
  if (!bottleName || !storeName || !storeId || (!storeAddress && !needsStoreReview)) {
    return NextResponse.json({ error: "Missing bottle or store details" }, { status: 400 });
  }
  if (needsStoreReview && (!manualStoreCity || !manualStoreState)) {
    return NextResponse.json({ error: "Missing city or state for manual store" }, { status: 400 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const ownerPointsPreview = isRewardsAdminEmail(verifiedPrimaryClerkEmail(user));
  const prefs = normalizePrefs(user.publicMetadata?.sightingsPreferences);
  const publicIdentity = publicSignalIdentityFromMetadata(user.publicMetadata);
  if (!publicIdentity) {
    return NextResponse.json({ error: "A numbered member identity is required before posting." }, { status: 409 });
  }
  const customDisplayName = communityDisplayNameFromMetadata(user.publicMetadata);
  const reporterDisplayName = customDisplayName || "";
  const publicActor = { ...publicIdentity, ...(customDisplayName ? { displayName: customDisplayName } : {}) };
  const sighting: MemberSighting = {
    id: idempotencyKey ? idempotentSightingId(userId, idempotencyKey) : makeSightingId(),
    bottleName,
    bottleId,
    rarityTier,
    storeId,
    storeName,
    storeAddress,
    storeCity: typeof payload.storeCity === "string" ? payload.storeCity.slice(0, 120) : undefined,
    storeState: typeof payload.storeState === "string" ? payload.storeState.slice(0, 10).toUpperCase() : undefined,
    storeZip: typeof payload.storeZip === "string" ? payload.storeZip.slice(0, 20) : undefined,
    quantityEstimate: typeof payload.quantityEstimate === "string" ? payload.quantityEstimate.slice(0, 80) : undefined,
    price: typeof payload.price === "number" && Number.isFinite(payload.price) ? Math.max(0, Math.min(99999, payload.price)) : null,
    notes: typeof payload.notes === "string" ? payload.notes.slice(0, 500) : undefined,
    source: "custom",
    sightingType: normalizeSightingType(payload.sightingType),
    reporterUserId: userId,
    reporterDisplayName,
    reporterBadges: rewardBadgeLabels((user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>),
    reporterPublicIdentity: publicActor,
    idempotencyFingerprint: idempotencyKey ? idempotentSightingFingerprint({ ...payload, reporterUserId: userId }) : undefined,
    storeTimeZone: typeof payload.storeTimeZone === "string" ? payload.storeTimeZone.slice(0, 80) : undefined,
    rewardState: {},
    reviewState: (needsBottleReview || needsStoreReview) ? {
      needsBottleReview,
      needsStoreReview,
      manualBottleName: needsBottleReview ? sanitizeManualSightingField(reviewInput.manualBottleName || bottleName, 140) : undefined,
      manualBottleRarityTier: needsBottleReview ? "limited" : undefined,
      manualStoreName: needsStoreReview ? sanitizeManualSightingField(reviewInput.manualStoreName || storeName, 180) : undefined,
      manualStoreAddress: needsStoreReview ? storeAddress : undefined,
      manualStoreCity: needsStoreReview ? manualStoreCity : undefined,
      manualStoreState: needsStoreReview ? manualStoreState : undefined,
      manualStoreZip: needsStoreReview ? sanitizeManualSightingField(reviewInput.manualStoreZip || payload.storeZip, 20) : undefined,
    } : undefined,
    createdAt: new Date().toISOString(),
  };
  const repository = createCommunitySightingsRepository();
  const requestFingerprint = sighting.idempotencyFingerprint;
  if (idempotencyKey) {
    if (!requestFingerprint) return NextResponse.json({ error: "Unable to bind Idempotency-Key" }, { status: 500 });
    const binding = await repository.reserveIdempotency(sighting.id, userId, requestFingerprint);
    if (binding.reporterUserId !== userId || binding.requestFingerprint !== requestFingerprint) {
      return NextResponse.json({ error: "Idempotency key was already used for a different Signal." }, { status: 409 });
    }
    if (binding.sightingId) {
      const bound = await repository.getSighting(binding.sightingId);
      if (!bound) return NextResponse.json({ error: "The saved Signal is temporarily unavailable." }, { status: 503 });
      return NextResponse.json({ ok: true, created: false, duplicate: true, sighting: visibleSightingForRequester(bound, ownerPointsPreview) });
    }
    const existing = await repository.getSighting(sighting.id);
    if (existing) {
      if (!sameIdempotentSighting(existing, sighting)) {
        return NextResponse.json({ error: "Idempotency key was already used for a different Signal." }, { status: 409 });
      }
      await repository.completeIdempotency(sighting.id, userId, requestFingerprint, existing.id);
      return NextResponse.json({ ok: true, created: false, duplicate: true, sighting: visibleSightingForRequester(existing, ownerPointsPreview) });
    }
  }
  const observedRewardGeneration = await createSignalPointsRepository().readRewardGeneration(userId);
  const duplicateSince = new Date(Date.parse(sighting.createdAt) - SIGHTING_DUPLICATE_WINDOW_MS).toISOString();
  const [durableSightings, durableDuplicate] = await Promise.all([
    repository.listSightingsForReporter(userId),
    repository.findRecentCanonicalDuplicate(userId, bottleId, storeId, duplicateSince, sighting.createdAt),
  ]);
  const ownedSightings = dedupeSightings([...prefs.submittedSightings, ...durableSightings]);
  const rewardCatalog = await getBourbonBible();
  const rewardSightings = normalizeSightingsForRewards(ownedSightings, rewardCatalog);
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const legacyDuplicate = prefs.submittedSightings.find((existing) => isSameReporterCanonicalDuplicateSighting(
    { ...existing, reporterUserId: existing.reporterUserId || userId },
    sighting,
  ) && isLikelyDuplicateSighting(existing, sighting));
  const duplicate = durableDuplicate || legacyDuplicate;
  if (duplicate) {
    if (idempotencyKey && requestFingerprint) await repository.completeIdempotency(sighting.id, userId, requestFingerprint, duplicate.id);
    const nextRewards = reconcileMemberRewards(rewardSightings, privateMetadata.memberRewards);
    if (rewardsNeedPersistence(privateMetadata.memberRewards, nextRewards)) {
      after(() => persistMemberRewardsBestEffort(client, userId, nextRewards, observedRewardGeneration));
    }
    const rewards: MemberRewardsSummary = summarizeMemberRewards(rewardSightings, nextRewards);
    return NextResponse.json({
      ok: true,
      created: false,
      duplicate: true,
      sighting: visibleSightingForRequester(duplicate, ownerPointsPreview),
      ...(ownerPointsPreview ? { rewards } : {}),
    });
  }

  if (idempotencyKey && requestFingerprint) {
    const binding = await repository.reserveIdempotency(sighting.id, userId, requestFingerprint);
    if (binding.sightingId) {
      const bound = await repository.getSighting(binding.sightingId);
      if (!bound) return NextResponse.json({ error: "The saved Signal is temporarily unavailable." }, { status: 503 });
      return NextResponse.json({ ok: true, created: false, duplicate: true, sighting: visibleSightingForRequester(bound, ownerPointsPreview) });
    }
  }
  const savedSighting = idempotencyKey ? await repository.insertSightingIfAbsent(sighting) : await repository.insertSighting(sighting);
  if (!sameIdempotentSighting(savedSighting.sighting, sighting)) {
    return NextResponse.json({ error: "Idempotency key was already used for a different Signal." }, { status: 409 });
  }
  if (savedSighting.created === false) {
    if (idempotencyKey && requestFingerprint) await repository.completeIdempotency(sighting.id, userId, requestFingerprint, savedSighting.sighting.id);
    return NextResponse.json({ ok: true, created: false, duplicate: true, sighting: visibleSightingForRequester(savedSighting.sighting, ownerPointsPreview) });
  }
  if (idempotencyKey && requestFingerprint) await repository.completeIdempotency(sighting.id, userId, requestFingerprint, savedSighting.sighting.id);
  const authoritativeSightings = await repository.listSightingsForReporter(userId);
  const nextOwnedSightings = dedupeSightings([...prefs.submittedSightings, ...authoritativeSightings]);
  const nextRewardSightings = normalizeSightingsForRewards(nextOwnedSightings, rewardCatalog);
  const nextRewards = reconcileMemberRewards(nextRewardSightings, privateMetadata.memberRewards);
  await persistMemberRewardsBestEffort(client, userId, nextRewards, savedSighting.rewardGeneration);
  after(async () => {
    try {
      if (needsBottleReview) {
        await addBottleContribution({
          rawName: sanitizeManualSightingField(reviewInput.manualBottleName || bottleName, 140),
          source: "sighting",
          userId,
          userEmail: primaryEmail(user),
          context: { sightingId: sighting.id, storeName, storeCity: sighting.storeCity, storeState: sighting.storeState, rarityTier: sighting.rarityTier },
        });
      }
    } catch (error) {
      console.error("Sighting saved, but follow-up metadata reconciliation failed", error);
    }
  });
  const rewards: MemberRewardsSummary = summarizeMemberRewards(nextRewardSightings, nextRewards);
  return NextResponse.json({
    ok: true,
    created: true,
    sighting: visibleSightingForRequester(savedSighting.sighting, ownerPointsPreview),
    ...(ownerPointsPreview ? { rewards } : {}),
  });
}

export async function PATCH(req: NextRequest) {
  if (isQaPreviewRequest(req)) {
    const entitlements = getEntitlements(getQaPreviewTierFromRequest(req));
    if (!entitlements.canReadSightings) return NextResponse.json({ error: "Member Sightings are included with Standard Proof and above.", qaPreview: true, qaTier: entitlements.tier }, { status: 403 });
    return NextResponse.json({ ok: true, sightings: [], qaPreview: true, qaTier: entitlements.tier });
  }
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const entitlements = await requireSightingsEntitlements(userId);
  if (!entitlements.canReadSightings) {
    return NextResponse.json({ error: "Member Sightings are included with Standard Proof and above." }, { status: 403 });
  }
  const requester = await (await clerkClient()).users.getUser(userId);
  const ownerPointsPreview = isRewardsAdminEmail(verifiedPrimaryClerkEmail(requester));
  const payload = (await req.json().catch(() => ({}))) as { sightingId?: string; vote?: SightingVoteKind; active?: boolean };
  const sightingId = String(payload.sightingId || "").slice(0, 160);
  const vote = payload.vote === "down" ? "down" : payload.vote === "up" ? "up" : null;
  if (!sightingId || !vote) return NextResponse.json({ error: "Invalid vote" }, { status: 400 });

  const repository = createCommunitySightingsRepository();
  const target = await repository.getSighting(sightingId);
  if (!target) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });
  if (!communityVoteAllowed(target.reporterUserId, userId)) {
    return NextResponse.json({ error: "The sighting poster cannot vote on their own report." }, { status: 409 });
  }

  if (!(await repository.getVote(sightingId, userId)) && target.myVote) {
    await repository.setVote(sightingId, userId, target.myVote);
  }
  const voteResult = typeof payload.active === "boolean"
    ? await repository.setVoteState(sightingId, userId, vote, payload.active)
    : await repository.toggleVote(sightingId, userId, vote);
  const updatedTarget: MemberSighting = { ...voteResult.sighting, myVote: voteResult.kind };

  let rewards: MemberRewardsSummary | undefined;
  try {
    if (updatedTarget.reporterUserId) {
      const client = await clerkClient();
      const owner = await client.users.getUser(updatedTarget.reporterUserId);
      const ownerPublicMetadata = (owner.publicMetadata && typeof owner.publicMetadata === "object" ? owner.publicMetadata : {}) as Record<string, unknown>;
      const ownerPrivateMetadata = (owner.privateMetadata && typeof owner.privateMetadata === "object" ? owner.privateMetadata : {}) as Record<string, unknown>;
      const ownerPrefs = normalizePrefs(ownerPublicMetadata.sightingsPreferences);
      const durableOwned = await repository.listSightingsForReporter(updatedTarget.reporterUserId);
      const ownedSightings = dedupeSightings([...ownerPrefs.submittedSightings, ...durableOwned]);
      const rewardSightings = normalizeSightingsForRewards(ownedSightings, await getBourbonBible());
      const nextOwnerRewards = reconcileMemberRewards(rewardSightings, ownerPrivateMetadata.memberRewards);
      await createSignalPointsRepository().reconcileClerkRewards(updatedTarget.reporterUserId, nextOwnerRewards, voteResult.rewardGeneration);
      await client.users.updateUserMetadata(updatedTarget.reporterUserId, { privateMetadata: { ...ownerPrivateMetadata, memberRewards: nextOwnerRewards } });
      rewards = summarizeMemberRewards(rewardSightings, nextOwnerRewards);
    }
  } catch (error) {
    console.error("Sighting vote persisted, but durable reward reconciliation failed", error);
    return NextResponse.json({ error: "Sighting vote saved, but account reconciliation is temporarily unavailable." }, { status: 503 });
  }
  return NextResponse.json({
    ok: true,
    sighting: visibleSightingForRequester(updatedTarget, ownerPointsPreview),
    ...(ownerPointsPreview ? { rewards } : {}),
  });
}
