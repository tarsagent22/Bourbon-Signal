import { NextRequest, NextResponse } from "next/server";
import { clerkClient } from "@clerk/nextjs/server";
import { getBourbonBible } from "@/lib/bourbonBible";
import type { MemberSighting, SightingsPreferences } from "@/lib/sightings";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { reconcileMemberRewards, type SightingPhotoReviewStatus } from "@/lib/sighting-rewards";
import { requireOwnerApiAccess, verifiedPrimaryClerkEmail } from "@/lib/owner-auth";
import { normalizeSightingsForRewards } from "@/lib/sighting-reward-tiers";
import { needsSightingReview, reviewReasonLabels } from "@/lib/sighting-review";
import { persistApprovedSightingCatalog } from "@/lib/approved-catalog-service";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";

function normalizePrefs(input: unknown): SightingsPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    submittedSightings: Array.isArray(source.submittedSightings) ? source.submittedSightings.filter((item): item is MemberSighting => Boolean(item && typeof item === "object" && (item as MemberSighting).id)).slice(0, 100) : [],
    signalReports: Array.isArray(source.signalReports) ? source.signalReports as SightingsPreferences["signalReports"] : [],
    sightingVotes: Array.isArray(source.sightingVotes) ? source.sightingVotes as SightingsPreferences["sightingVotes"] : [],
  };
}

function dedupeSightings(items: MemberSighting[]) {
  return [...new Map(items.map((item) => [item.id, item])).values()];
}

async function listAllUsers(client: Awaited<ReturnType<typeof clerkClient>>, pageSize = 100, maxUsers = 1000) {
  const users: Awaited<ReturnType<typeof client.users.getUserList>>["data"] = [];
  let offset = 0;
  while (users.length < maxUsers) {
    const page = await client.users.getUserList({ limit: Math.min(pageSize, maxUsers - users.length), offset, orderBy: "+created_at" });
    users.push(...page.data);
    offset += page.data.length;
    if (!page.data.length || !page.totalCount || offset >= page.totalCount) break;
  }
  return users;
}

export async function GET() {
  const adminAccess = await requireOwnerApiAccess({ forbidden: "Admin only" });
  if (adminAccess.error) return adminAccess.error;
  const admin = { client: adminAccess.client, adminUserId: adminAccess.userId };
  const users = await listAllUsers(admin.client);
  const usersById = new Map(users.map((user) => [user.id, user]));
  const legacySightings = users.flatMap((user) => {
    const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
    const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
    return prefs.submittedSightings.map((sighting) => ({ ...sighting, reporterUserId: user.id }));
  });
  const repository = createCommunitySightingsRepository();
  const durableSightings = await repository.listSightings();
  const sightingsById = new Map<string, MemberSighting>(legacySightings.map((sighting) => [sighting.id, sighting]));
  for (const sighting of durableSightings) sightingsById.set(sighting.id, sighting);
  const pendingSightings = [...sightingsById.values()].filter((sighting) => needsSightingReview(sighting));
  const moderationByReporter = new Map(await Promise.all(
    [...new Set(pendingSightings.map((sighting) => sighting.reporterUserId).filter((value): value is string => Boolean(value)))]
      .map(async (reporterUserId) => [reporterUserId, await repository.getContributorModeration(reporterUserId)] as const),
  ));
  const sightings = pendingSightings
    .map((sighting) => {
      const user = sighting.reporterUserId ? usersById.get(sighting.reporterUserId) : undefined;
      return {
        ...sighting,
        reporterEmail: user ? verifiedPrimaryClerkEmail(user) : "",
        reporterName: user ? ([user.firstName, user.lastName].filter(Boolean).join(" ") || "Member") : "Member",
        reviewReasons: reviewReasonLabels(sighting.reviewState),
        contributorModeration: sighting.reporterUserId ? moderationByReporter.get(sighting.reporterUserId) || null : null,
      };
    })
    .sort((a, b) => +new Date(b.rewardState?.photoProof?.uploadedAt || b.createdAt) - +new Date(a.rewardState?.photoProof?.uploadedAt || a.createdAt));
  return NextResponse.json({ ok: true, sightings });
}

export async function PATCH(req: NextRequest) {
  const adminAccess = await requireOwnerApiAccess({ forbidden: "Admin only" });
  if (adminAccess.error) return adminAccess.error;
  const admin = { client: adminAccess.client, adminUserId: adminAccess.userId };
  const payload = (await req.json().catch(() => ({}))) as { reporterUserId?: string; sightingId?: string; action?: string; reason?: string };
  const reporterUserId = String(payload.reporterUserId || "");
  const sightingId = String(payload.sightingId || "");
  if (!reporterUserId || !sightingId) return NextResponse.json({ error: "Missing sighting" }, { status: 400 });
  const reporter = await admin.client.users.getUser(reporterUserId);
  const publicMetadata = (reporter.publicMetadata && typeof reporter.publicMetadata === "object" ? reporter.publicMetadata : {}) as Record<string, unknown>;
  const privateMetadata = (reporter.privateMetadata && typeof reporter.privateMetadata === "object" ? reporter.privateMetadata : {}) as Record<string, unknown>;
  const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
  const repository = createCommunitySightingsRepository();
  const durableTarget = await repository.getSighting(sightingId);
  if (durableTarget && durableTarget.reporterUserId !== reporterUserId) {
    return NextResponse.json({ error: "Sighting owner mismatch" }, { status: 409 });
  }
  const sourceSightings = durableTarget ? [durableTarget] : prefs.submittedSightings;
  const now = new Date().toISOString();
  let status: SightingPhotoReviewStatus | null = null;
  let remove = false;
  let rejectSighting = false;
  let resolveManualReview = false;
  if (payload.action === "verify_public") {
    status = "verified_public";
    resolveManualReview = true;
  }
  if (payload.action === "verify_private") {
    status = "verified_private";
    resolveManualReview = true;
  }
  if (payload.action === "reject_photo") status = "rejected";
  if (payload.action === "remove_sighting") remove = true;
  if (payload.action === "reject_sighting") rejectSighting = true;
  if (payload.action === "resolve_manual_review") resolveManualReview = true;
  if (!status && !remove && !rejectSighting && !resolveManualReview) return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  if (!sourceSightings.some((sighting) => sighting.id === sightingId)) {
    return NextResponse.json({ error: "Sighting not found" }, { status: 404 });
  }
  const targetSighting = sourceSightings.find((sighting) => sighting.id === sightingId)!;
  const catalogResult = resolveManualReview
    ? await persistApprovedSightingCatalog(targetSighting, admin.adminUserId)
    : { bottle: null, location: null };
  if (catalogResult.bottle) {
    const { clearBourbonBibleCache } = await import("@/lib/bourbonBible");
    clearBourbonBibleCache();
  }

  const nextSightings = sourceSightings.map((sighting) => {
    if (sighting.id !== sightingId) return sighting;
    const proof = sighting.rewardState?.photoProof;
    const sources = new Set(sighting.rewardState?.verificationSources || []);
    if (status === "verified_public" || status === "verified_private") sources.add("photo");
    if (status === "rejected") sources.delete("photo");
    return {
      ...sighting,
      reviewState: resolveManualReview ? {
        ...(sighting.reviewState || {}),
        needsBottleReview: false,
        needsStoreReview: false,
        reviewedAt: now,
        reviewedBy: admin.adminUserId,
        reviewNote: String(payload.reason || "Manual bottle/store reviewed for catalog mapping").slice(0, 180),
      } : sighting.reviewState,
      rewardState: {
        ...(sighting.rewardState || {}),
        ...(proof && status ? {
          photoProof: {
            ...proof,
            status,
            reviewedAt: now,
            reviewedBy: admin.adminUserId,
            rejectionReason: status === "rejected" ? String(payload.reason || "Photo verification rejected").slice(0, 180) : undefined,
            publicUrl: status === "verified_public" ? proof.url : null,
          },
        } : {}),
        verificationSources: Array.from(sources),
        verifiedAt: sources.size ? (sighting.rewardState?.verifiedAt || now) : undefined,
        removedAt: remove ? now : sighting.rewardState?.removedAt,
        rejectedAt: rejectSighting ? now : sighting.rewardState?.rejectedAt,
      },
    };
  });
  const updatedSighting = nextSightings.find((item) => item.id === sightingId);
  if (!updatedSighting) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });
  const signalPoints = createSignalPointsRepository();
  if (durableTarget) {
    const mutation = await repository.updateSighting(updatedSighting);
    const durableOwned = await repository.listSightingsForReporter(reporterUserId);
    const legacyOwned = prefs.submittedSightings.map((sighting) => ({ ...sighting, reporterUserId }));
    const rewardSightings = normalizeSightingsForRewards(dedupeSightings([...legacyOwned, ...durableOwned]), await getBourbonBible());
    const nextRewards = reconcileMemberRewards(rewardSightings, privateMetadata.memberRewards, now);
    await signalPoints.reconcileClerkRewards(reporterUserId, nextRewards, mutation.rewardGeneration);
    await admin.client.users.updateUserMetadata(reporterUserId, { privateMetadata: { memberRewards: nextRewards } }).catch((error) => {
      console.error("Sighting points reconciled, but the Clerk projection failed", error);
    });
  } else {
    const rewardGeneration = await signalPoints.nextRewardGeneration(reporterUserId);
    const nextPrefs = { ...prefs, submittedSightings: nextSightings };
    const durableOwned = await repository.listSightingsForReporter(reporterUserId);
    const legacyOwned = nextSightings.map((sighting) => ({ ...sighting, reporterUserId }));
    const rewardSightings = normalizeSightingsForRewards(dedupeSightings([...legacyOwned, ...durableOwned]), await getBourbonBible());
    const nextRewards = reconcileMemberRewards(rewardSightings, privateMetadata.memberRewards, now);
    await signalPoints.reconcileClerkRewards(reporterUserId, nextRewards, rewardGeneration);
    await admin.client.users.updateUserMetadata(reporterUserId, { publicMetadata: { sightingsPreferences: nextPrefs } });
    await admin.client.users.updateUserMetadata(reporterUserId, { privateMetadata: { memberRewards: nextRewards } }).catch((error) => {
      console.error("Sighting points reconciled, but the Clerk projection failed", error);
    });
  }
  return NextResponse.json({
    ok: true,
    pendingReview: needsSightingReview(updatedSighting),
    sighting: updatedSighting,
    catalogResult,
  });
}
