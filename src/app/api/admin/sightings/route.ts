import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import type { MemberSighting, SightingsPreferences } from "@/lib/sightings";
import { isRewardsAdminEmail, reconcileMemberRewards, type SightingPhotoReviewStatus } from "@/lib/sighting-rewards";
import { needsSightingReview, reviewReasonLabels } from "@/lib/sighting-review";

function normalizePrefs(input: unknown): SightingsPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    submittedSightings: Array.isArray(source.submittedSightings) ? source.submittedSightings.filter((item): item is MemberSighting => Boolean(item && typeof item === "object" && (item as MemberSighting).id)).slice(0, 100) : [],
    signalReports: Array.isArray(source.signalReports) ? source.signalReports as SightingsPreferences["signalReports"] : [],
    sightingVotes: Array.isArray(source.sightingVotes) ? source.sightingVotes as SightingsPreferences["sightingVotes"] : [],
  };
}

function primaryEmail(user: { emailAddresses?: unknown[]; primaryEmailAddressId?: unknown }) {
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses as Array<Record<string, unknown>> : [];
  const primaryId = typeof user.primaryEmailAddressId === "string" ? user.primaryEmailAddressId : "";
  const primary = emails.find((email) => email.id === primaryId) || emails[0];
  return typeof primary?.emailAddress === "string" ? primary.emailAddress : "";
}

async function requireAdmin() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!isRewardsAdminEmail(primaryEmail(user))) return { error: NextResponse.json({ error: "Admin only" }, { status: 403 }) };
  return { client, adminUserId: userId };
}

export async function GET() {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const result = await admin.client.users.getUserList({ limit: 100 });
  const users = Array.isArray(result) ? result : result.data;
  const sightings = users.flatMap((user) => {
    const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
    const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
    return prefs.submittedSightings
      .filter((sighting) => needsSightingReview(sighting))
      .map((sighting) => ({
        ...sighting,
        reporterUserId: sighting.reporterUserId || user.id,
        reporterEmail: primaryEmail(user),
        reporterName: [user.firstName, user.lastName].filter(Boolean).join(" ") || "Member",
        reviewReasons: reviewReasonLabels(sighting.reviewState),
      }));
  }).sort((a, b) => +new Date(b.rewardState?.photoProof?.uploadedAt || b.createdAt) - +new Date(a.rewardState?.photoProof?.uploadedAt || a.createdAt));
  return NextResponse.json({ ok: true, sightings });
}

export async function PATCH(req: NextRequest) {
  const admin = await requireAdmin();
  if (admin.error) return admin.error;
  const payload = (await req.json().catch(() => ({}))) as { reporterUserId?: string; sightingId?: string; action?: string; reason?: string };
  const reporterUserId = String(payload.reporterUserId || "");
  const sightingId = String(payload.sightingId || "");
  if (!reporterUserId || !sightingId) return NextResponse.json({ error: "Missing sighting" }, { status: 400 });
  const reporter = await admin.client.users.getUser(reporterUserId);
  const publicMetadata = (reporter.publicMetadata && typeof reporter.publicMetadata === "object" ? reporter.publicMetadata : {}) as Record<string, unknown>;
  const privateMetadata = (reporter.privateMetadata && typeof reporter.privateMetadata === "object" ? reporter.privateMetadata : {}) as Record<string, unknown>;
  const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
  const now = new Date().toISOString();
  let status: SightingPhotoReviewStatus | null = null;
  let remove = false;
  let rejectSighting = false;
  let resolveManualReview = false;
  if (payload.action === "verify_public") status = "verified_public";
  if (payload.action === "verify_private") status = "verified_private";
  if (payload.action === "reject_photo") status = "rejected";
  if (payload.action === "remove_sighting") remove = true;
  if (payload.action === "reject_sighting") rejectSighting = true;
  if (payload.action === "resolve_manual_review") resolveManualReview = true;
  if (!status && !remove && !rejectSighting && !resolveManualReview) return NextResponse.json({ error: "Invalid action" }, { status: 400 });

  const nextSightings = prefs.submittedSightings.map((sighting) => {
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
  const nextPrefs = { ...prefs, submittedSightings: nextSightings };
  const nextRewards = reconcileMemberRewards(nextSightings, privateMetadata.memberRewards, now);
  await admin.client.users.updateUserMetadata(reporterUserId, { publicMetadata: { ...publicMetadata, sightingsPreferences: nextPrefs }, privateMetadata: { ...privateMetadata, memberRewards: nextRewards } });
  return NextResponse.json({ ok: true });
}
