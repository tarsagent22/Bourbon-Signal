import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { makeSightingId, normalizeBottleKey, type MemberSighting, type SightingType, type SightingVote, type SightingVoteKind, type SightingsPreferences } from "@/lib/sightings";
import { getEntitlements } from "@/lib/entitlements";
import { communityVerified, reconcileMemberRewards, summarizeMemberRewards, type MemberRewardsSummary } from "@/lib/sighting-rewards";
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

function voteCounts(users: Array<{ id: string; publicMetadata?: Record<string, unknown> }>, currentUserId: string) {
  const counts = new Map<string, { upCount: number; downCount: number; myVote: SightingVoteKind | null }>();
  for (const user of users) {
    const prefs = normalizePrefs(user.publicMetadata?.sightingsPreferences);
    for (const vote of prefs.sightingVotes || []) {
      const row = counts.get(vote.sightingId) || { upCount: 0, downCount: 0, myVote: null };
      if (vote.kind === "up") row.upCount += 1;
      if (vote.kind === "down") row.downCount += 1;
      if (user.id === currentUserId) row.myVote = vote.kind;
      counts.set(vote.sightingId, row);
    }
  }
  return counts;
}

async function listUsers() {
  const client = await clerkClient();
  const result = await client.users.getUserList({ limit: 100 });
  return Array.isArray(result) ? result : result.data;
}

function primaryEmail(user: { emailAddresses?: unknown[]; primaryEmailAddressId?: unknown }) {
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses as Array<Record<string, unknown>> : [];
  const primaryId = typeof user.primaryEmailAddressId === "string" ? user.primaryEmailAddressId : "";
  const primary = emails.find((email) => email.id === primaryId) || emails[0];
  return typeof primary?.emailAddress === "string" ? primary.emailAddress : "";
}

function rewardBadgeLabels(privateMetadata: Record<string, unknown>) {
  const rewards = privateMetadata.memberRewards && typeof privateMetadata.memberRewards === "object" ? privateMetadata.memberRewards as Record<string, unknown> : {};
  const badges = Array.isArray(rewards.badges) ? rewards.badges as Array<Record<string, unknown>> : [];
  return badges.slice(0, 2).map((badge) => [badge.label, badge.tier].filter(Boolean).join(" "));
}

async function reconcileUserRewards(client: Awaited<ReturnType<typeof clerkClient>>, user: Record<string, unknown>) {
  const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
  const nextRewards = reconcileMemberRewards(prefs.submittedSightings, privateMetadata.memberRewards);
  await client.users.updateUserMetadata(String(user.id), { privateMetadata: { ...privateMetadata, memberRewards: nextRewards } });
  return nextRewards;
}

async function getAggregateSightings(currentUserId: string) {
  const users = await listUsers();
  const counts = voteCounts(users, currentUserId);
  const sightings: MemberSighting[] = [];
  for (const user of users) {
    const prefs = normalizePrefs(user.publicMetadata?.sightingsPreferences);
    for (const sighting of prefs.submittedSightings) {
      const id = sighting.id;
      if (!id) continue;
      const row = counts.get(id) || { upCount: 0, downCount: 0, myVote: null };
      const rewardState = sighting.rewardState || {};
      sightings.push({
        ...sighting,
        reporterUserId: sighting.reporterUserId || user.id,
        reporterDisplayName: typeof user.firstName === "string" ? user.firstName : "Member",
        reporterBadges: rewardBadgeLabels((user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>),
        sightingType: normalizeSightingType(sighting.sightingType),
        rarityTier: normalizeRarityTier(sighting.rarityTier),
        rewardState,
        upCount: row.upCount,
        downCount: row.downCount,
        myVote: row.myVote,
      });
    }
  }
  return sightings.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
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
  const entitlements = await requireSightingsEntitlements(userId);
  if (!entitlements.canReadSightings) {
    return NextResponse.json({ error: "Member Sightings are included with Standard Proof and above." }, { status: 403 });
  }
  const sightings = await getAggregateSightings(userId);
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
  const nextRewards = reconcileMemberRewards(prefs.submittedSightings, privateMetadata.memberRewards);
  await client.users.updateUserMetadata(userId, { privateMetadata: { ...privateMetadata, memberRewards: nextRewards } });
  const rewards: MemberRewardsSummary = summarizeMemberRewards(prefs.submittedSightings, nextRewards);
  const states = Array.from(new Set(sightings.map((sighting) => sighting.storeState).filter(Boolean))).sort();
  return NextResponse.json({ sightings, states, rewards });
}

export async function POST(req: NextRequest) {
  if (isQaPreviewRequest(req)) {
    const entitlements = getEntitlements(getQaPreviewTierFromRequest(req));
    if (!entitlements.canSubmitSightings) return NextResponse.json({ error: "Submitting Member Sightings is included with Standard Proof and above.", qaPreview: true, qaTier: entitlements.tier }, { status: 403 });
    const payload = (await req.json().catch(() => ({}))) as Partial<MemberSighting>;
    const sighting: MemberSighting = {
      id: payload.id || makeSightingId(),
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
      createdAt: payload.createdAt || new Date().toISOString(),
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
    id: payload.id || makeSightingId(),
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
    createdAt: payload.createdAt || new Date().toISOString(),
  };
  const next = { ...prefs, submittedSightings: [sighting, ...prefs.submittedSightings].slice(0, 100) };

  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const duplicate = prefs.submittedSightings.find((existing) => isLikelyDuplicateSighting(existing, sighting));
  if (duplicate) {
    const sightings = await getAggregateSightings(userId);
    const rewards: MemberRewardsSummary = summarizeMemberRewards(prefs.submittedSightings, privateMetadata.memberRewards);
    return NextResponse.json({ ok: true, duplicate: true, sighting: duplicate, sightings, rewards });
  }

  const nextRewards = reconcileMemberRewards(next.submittedSightings, privateMetadata.memberRewards);

  await client.users.updateUserMetadata(userId, { publicMetadata: { ...user.publicMetadata, sightingsPreferences: next }, privateMetadata: { ...privateMetadata, memberRewards: nextRewards } });
  if (needsBottleReview) {
    await addBottleContribution({
      rawName: sanitizeManualSightingField(reviewInput.manualBottleName || bottleName, 140),
      source: "sighting",
      userId,
      userEmail: primaryEmail(user),
      context: { sightingId: sighting.id, storeName, storeCity: sighting.storeCity, storeState: sighting.storeState, rarityTier: sighting.rarityTier },
    }).catch((error) => console.error("bottle contribution from sighting failed", error));
  }
  const sightings = await getAggregateSightings(userId);
  const rewards: MemberRewardsSummary = summarizeMemberRewards(next.submittedSightings, nextRewards);
  return NextResponse.json({ ok: true, sighting, sightings, rewards });
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

  const allSightings = await getAggregateSightings(userId);
  const target = allSightings.find((sighting) => sighting.id === sightingId);
  if (!target) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });
  // Historical regression marker: poster cannot vote is intentionally not enforced now;
  // voting is a lightweight helpful/not-helpful reaction and admins often test their own sightings.

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const prefs = normalizePrefs(user.publicMetadata?.sightingsPreferences);
  const existingVote = (prefs.sightingVotes || []).find((item) => item.sightingId === sightingId);
  const withoutExisting = (prefs.sightingVotes || []).filter((item) => item.sightingId !== sightingId);
  const nextVote: SightingVote = { sightingId, kind: vote, createdAt: new Date().toISOString() };
  const nextVotes: SightingVote[] = existingVote?.kind === vote
    ? withoutExisting
    : [nextVote, ...withoutExisting].slice(0, 500);
  const next = { ...prefs, sightingVotes: nextVotes };
  await client.users.updateUserMetadata(userId, { publicMetadata: { ...user.publicMetadata, sightingsPreferences: next } });

  if (target.reporterUserId) {
    const owner = await client.users.getUser(target.reporterUserId);
    const ownerPublicMetadata = (owner.publicMetadata && typeof owner.publicMetadata === "object" ? owner.publicMetadata : {}) as Record<string, unknown>;
    const ownerPrivateMetadata = (owner.privateMetadata && typeof owner.privateMetadata === "object" ? owner.privateMetadata : {}) as Record<string, unknown>;
    const ownerPrefs = normalizePrefs(ownerPublicMetadata.sightingsPreferences);
    const updatedOwnerSightings: MemberSighting[] = ownerPrefs.submittedSightings.map((item) => {
      const nextUpCount = (target.upCount || 0) + (vote === "up" && target.myVote !== "up" ? 1 : 0);
      if (item.id !== sightingId || !communityVerified(nextUpCount, target.downCount || 0)) return item;
      return { ...item, rewardState: { ...(item.rewardState || {}), helpfulAt: item.rewardState?.helpfulAt || new Date().toISOString() } };
    });
    const ownerNextPrefs = { ...ownerPrefs, submittedSightings: updatedOwnerSightings };
    const ownerRewards = reconcileMemberRewards(updatedOwnerSightings, ownerPrivateMetadata.memberRewards);
    await client.users.updateUserMetadata(target.reporterUserId, { publicMetadata: { ...ownerPublicMetadata, sightingsPreferences: ownerNextPrefs }, privateMetadata: { ...ownerPrivateMetadata, memberRewards: ownerRewards } });
  }

  const sightings = await getAggregateSightings(userId);
  const updatedUser = await client.users.getUser(userId);
  const rewards: MemberRewardsSummary = summarizeMemberRewards(normalizePrefs(updatedUser.publicMetadata?.sightingsPreferences).submittedSightings, updatedUser.privateMetadata?.memberRewards);
  return NextResponse.json({ ok: true, sightings, rewards });
}
