import { after, NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { canonicalizeLegacySighting, makeSightingId, normalizeBottleKey, type MemberSighting, type SightingType, type SightingVote, type SightingVoteKind, type SightingsPreferences } from "@/lib/sightings";
import { createCommunitySightingsRepository, type DurableSightingVote } from "@/lib/community-sightings-repository";
import { getEntitlements } from "@/lib/entitlements";
import { reconcileMemberRewards, summarizeMemberRewards, type MemberRewardsSummary } from "@/lib/sighting-rewards";
import { isLikelyDuplicateSighting, sanitizeManualSightingField } from "@/lib/sighting-review";
import { getQaPreviewTierFromRequest, isQaPreviewRequest } from "@/lib/preview-qa";
import { addBottleContribution } from "@/lib/bottle-contributions";

function normalizeSightingType(value: unknown): SightingType {
  return value === "online_social" ? "online_social" : "seen_in_store";
}

function normalizeRarityTier(value: unknown): MemberSighting["rarityTier"] {
  return value === "unicorn" || value === "allocated" || value === "limited" ? value : "limited";
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
      displayName: typeof user.firstName === "string" ? user.firstName : "Member",
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

async function persistMemberRewardsBestEffort(client: Awaited<ReturnType<typeof clerkClient>>, userId: string, memberRewards: unknown) {
  await client.users.updateUserMetadata(userId, { privateMetadata: { memberRewards } }).catch((error) => {
    console.error("Sighting rewards reconciliation skipped", error);
  });
}

async function getAggregateSightings(currentUserId: string) {
  const repository = createCommunitySightingsRepository();
  const [legacy, durableSightings, durableVotes] = await Promise.all([
    readCachedLegacyCommunitySnapshot(),
    repository.listSightings(),
    repository.listVotes(),
  ]);
  const counts = voteCounts([...legacy.votes, ...durableVotes], currentUserId);
  const sightingsById = new Map<string, MemberSighting>();
  const reportersById = new Map<string, LegacyReporter>(legacy.reporters.map((reporter) => [reporter.id, reporter]));
  for (const sighting of legacy.sightings) sightingsById.set(sighting.id, sighting);
  for (const sighting of durableSightings) sightingsById.set(sighting.id, sighting);
  const sightings: MemberSighting[] = [];
  for (const sighting of sightingsById.values()) {
    const owner = sighting.reporterUserId ? reportersById.get(sighting.reporterUserId) : undefined;
    const row = counts.get(sighting.id) || { upCount: 0, downCount: 0, myVote: null };
    sightings.push({
      ...sighting,
      reporterDisplayName: owner?.displayName || sighting.reporterDisplayName || "Member",
      reporterBadges: owner?.badges || sighting.reporterBadges,
      sightingType: normalizeSightingType(sighting.sightingType),
      rarityTier: normalizeRarityTier(sighting.rarityTier),
      rewardState: sighting.rewardState || {},
      upCount: row.upCount,
      downCount: row.downCount,
      myVote: row.myVote,
    });
  }
  return {
    sightings: sightings.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt)),
    durableSightings,
  };
}

async function requireSightingsEntitlements(userId: string) {
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return getEntitlements(user.publicMetadata);
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
  const [user, aggregate] = await Promise.all([
    client.users.getUser(userId),
    getAggregateSightings(userId),
  ]);
  const entitlements = getEntitlements(user.publicMetadata);
  if (!entitlements.canReadSightings) {
    return NextResponse.json({ error: "Member Sightings are included with Standard Proof and above." }, { status: 403 });
  }
  const allSightings = aggregate.sightings;
  const previewLimit = entitlements.sightingsPreviewLimit;
  const sightings = previewLimit === null ? allSightings : allSightings.slice(0, previewLimit);
  const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
  const durableOwned = aggregate.durableSightings.filter((item) => item.reporterUserId === userId);
  const ownedSightings = dedupeSightings([...prefs.submittedSightings, ...durableOwned]);
  const nextRewards = reconcileMemberRewards(ownedSightings, privateMetadata.memberRewards);
  const rewards: MemberRewardsSummary = summarizeMemberRewards(ownedSightings, nextRewards);
  const states = Array.from(new Set(sightings.map((sighting) => sighting.storeState).filter(Boolean))).sort();
  return NextResponse.json({ sightings, states, rewards, previewLimit, totalSightings: allSightings.length });
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
  const entitlements = await requireSightingsEntitlements(userId);
  if (!entitlements.canSubmitSightings) {
    return NextResponse.json({ error: "Submitting Member Sightings is included with Standard Proof and above." }, { status: 403 });
  }
  const payload = (await req.json().catch(() => ({}))) as Partial<MemberSighting>;
  const bottleName = sanitizeManualSightingField(payload.bottleName, 140);
  const storeName = sanitizeManualSightingField(payload.storeName, 180);
  const storeAddress = sanitizeManualSightingField(payload.storeAddress, 220);
  const storeId = sanitizeManualSightingField(payload.storeId, 160);
  const reviewInput = payload.reviewState && typeof payload.reviewState === "object" ? payload.reviewState : {};
  const needsBottleReview = Boolean(reviewInput.needsBottleReview || reviewInput.manualBottleName);
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
  const prefs = normalizePrefs(user.publicMetadata?.sightingsPreferences);
  const sighting: MemberSighting = {
    id: makeSightingId(),
    bottleName,
    bottleId: typeof payload.bottleId === "string" ? payload.bottleId.slice(0, 160) : normalizeBottleKey(bottleName),
    rarityTier: normalizeRarityTier(payload.rarityTier),
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
    storeTimeZone: typeof payload.storeTimeZone === "string" ? payload.storeTimeZone.slice(0, 80) : undefined,
    rewardState: {},
    reviewState: (needsBottleReview || needsStoreReview) ? {
      needsBottleReview,
      needsStoreReview,
      manualBottleName: needsBottleReview ? sanitizeManualSightingField(reviewInput.manualBottleName || bottleName, 140) : undefined,
      manualBottleRarityTier: needsBottleReview ? normalizeRarityTier(reviewInput.manualBottleRarityTier || payload.rarityTier) : undefined,
      manualStoreName: needsStoreReview ? sanitizeManualSightingField(reviewInput.manualStoreName || storeName, 180) : undefined,
      manualStoreAddress: needsStoreReview ? storeAddress : undefined,
      manualStoreCity: needsStoreReview ? manualStoreCity : undefined,
      manualStoreState: needsStoreReview ? manualStoreState : undefined,
      manualStoreZip: needsStoreReview ? sanitizeManualSightingField(reviewInput.manualStoreZip || payload.storeZip, 20) : undefined,
    } : undefined,
    createdAt: new Date().toISOString(),
  };
  const repository = createCommunitySightingsRepository();
  const durableSightings = await repository.listSightings();
  const ownedSightings = dedupeSightings([...prefs.submittedSightings, ...durableSightings.filter((item) => item.reporterUserId === userId)]);
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const duplicate = ownedSightings.find((existing) => isLikelyDuplicateSighting(existing, sighting));
  if (duplicate) {
    const rewards: MemberRewardsSummary = summarizeMemberRewards(ownedSightings, privateMetadata.memberRewards);
    return NextResponse.json({ ok: true, created: false, duplicate: true, sighting: duplicate, rewards });
  }

  const savedSighting = await repository.insertSighting(sighting);
  const nextOwnedSightings = [savedSighting, ...ownedSightings];
  const nextRewards = reconcileMemberRewards(nextOwnedSightings, privateMetadata.memberRewards);
  after(async () => {
    try {
      await persistMemberRewardsBestEffort(client, userId, nextRewards);
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
  const rewards: MemberRewardsSummary = summarizeMemberRewards(nextOwnedSightings, nextRewards);
  return NextResponse.json({ ok: true, created: true, sighting: savedSighting, rewards });
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
  const payload = (await req.json().catch(() => ({}))) as { sightingId?: string; vote?: SightingVoteKind };
  const sightingId = String(payload.sightingId || "").slice(0, 160);
  const vote = payload.vote === "down" ? "down" : payload.vote === "up" ? "up" : null;
  if (!sightingId || !vote) return NextResponse.json({ error: "Invalid vote" }, { status: 400 });

  const aggregate = await getAggregateSightings(userId);
  const target = aggregate.sightings.find((sighting) => sighting.id === sightingId);
  if (!target) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });
  // Historical regression marker: poster cannot vote is intentionally not enforced now;
  // voting is a lightweight helpful/not-helpful reaction and admins often test their own sightings.

  const repository = createCommunitySightingsRepository();
  if (!(await repository.getSighting(sightingId))) {
    if (!target.reporterUserId || !/^[-_a-zA-Z0-9]{1,160}$/.test(target.id)) return NextResponse.json({ error: "Invalid legacy sighting" }, { status: 409 });
    const client = await clerkClient();
    const owner = await client.users.getUser(target.reporterUserId);
    const ownerPublicMetadata = (owner.publicMetadata && typeof owner.publicMetadata === "object" ? owner.publicMetadata : {}) as Record<string, unknown>;
    const currentLegacy = normalizePrefs(ownerPublicMetadata.sightingsPreferences).submittedSightings.find((sighting) => sighting.id === sightingId);
    if (!currentLegacy) return NextResponse.json({ error: "Sighting is no longer available" }, { status: 404 });
    await repository.insertSightingIfAbsent(canonicalizeLegacySighting(currentLegacy, target.reporterUserId));
  }
  if (!(await repository.getVote(sightingId, userId)) && target.myVote) {
    await repository.setVote(sightingId, userId, target.myVote);
  }
  const voteResult = await repository.toggleVote(sightingId, userId, vote);
  const updatedTarget: MemberSighting = { ...voteResult.sighting, myVote: voteResult.kind };

  let rewards: MemberRewardsSummary | undefined;
  try {
    if (updatedTarget.reporterUserId) {
      const client = await clerkClient();
      const owner = await client.users.getUser(updatedTarget.reporterUserId);
      const ownerPublicMetadata = (owner.publicMetadata && typeof owner.publicMetadata === "object" ? owner.publicMetadata : {}) as Record<string, unknown>;
      const ownerPrivateMetadata = (owner.privateMetadata && typeof owner.privateMetadata === "object" ? owner.privateMetadata : {}) as Record<string, unknown>;
      const ownerPrefs = normalizePrefs(ownerPublicMetadata.sightingsPreferences);
      const durableOwned = (await repository.listSightings()).filter((item) => item.reporterUserId === updatedTarget.reporterUserId);
      const ownedSightings = dedupeSightings([...ownerPrefs.submittedSightings, ...durableOwned]);
      const nextOwnerRewards = reconcileMemberRewards(ownedSightings, ownerPrivateMetadata.memberRewards);
      await client.users.updateUserMetadata(updatedTarget.reporterUserId, { privateMetadata: { ...ownerPrivateMetadata, memberRewards: nextOwnerRewards } });
      rewards = summarizeMemberRewards(ownedSightings, nextOwnerRewards);
    }
  } catch (error) {
    console.error("Sighting vote persisted, but reward reconciliation failed", error);
  }
  return NextResponse.json({ ok: true, sighting: updatedTarget, rewards });
}
