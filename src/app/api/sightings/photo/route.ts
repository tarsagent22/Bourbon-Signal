import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { BlobNotFoundError, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getBourbonBible } from "@/lib/bourbonBible";
import { type MemberSighting, type SightingsPreferences } from "@/lib/sightings";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { reconcileMemberRewards } from "@/lib/sighting-rewards";
import { normalizeSightingsForRewards } from "@/lib/sighting-reward-tiers";
import { createSignalPointsRepository } from "@/lib/signal-points-repository";
import {
  ALLOWED_SIGHTING_PHOTO_TYPES,
  MAX_SIGHTING_PHOTO_BYTES,
  parseSightingPhotoClientPayload,
  validateCompletedSightingPhoto,
  validateSightingPhotoPath,
  validSightingPhotoId,
} from "@/lib/sighting-photo-upload";

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

async function getOwnedSighting(sightingId: string, userId: string) {
  const repository = createCommunitySightingsRepository();
  const durable = await repository.getSighting(sightingId);
  if (durable) {
    if (durable.reporterUserId !== userId) return null;
    return { repository, target: durable };
  }

  // The durable cutover is complete. Mutable account metadata is not migration
  // provenance; missing historical rows require separately verified recovery.
  return null;
}

async function reconcileAttachedPhotoRewards(
  userId: string,
  repository: ReturnType<typeof createCommunitySightingsRepository>,
  rewardGeneration: number,
) {
  const client = await clerkClient();
  const signalPoints = createSignalPointsRepository();
  let targetGeneration = rewardGeneration;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const user = await client.users.getUser(userId);
    const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
    const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
    const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
    const durableOwned = await repository.listSightingsForReporter(userId);
    const legacyOwned = prefs.submittedSightings.map((sighting) => ({ ...sighting, reporterUserId: userId }));
    const rewardSightings = normalizeSightingsForRewards(dedupeSightings([...legacyOwned, ...durableOwned]), await getBourbonBible());
    const nextRewards = reconcileMemberRewards(rewardSightings, privateMetadata.memberRewards);
    const reconciliation = await signalPoints.reconcileClerkRewardsWithStatus(userId, nextRewards, targetGeneration);
    const generationBeforeProjection = await signalPoints.readRewardGeneration(userId);
    if (!reconciliation.applied || generationBeforeProjection !== targetGeneration) {
      targetGeneration = generationBeforeProjection;
      continue;
    }
    await client.users.updateUserMetadata(userId, { privateMetadata: { memberRewards: nextRewards } });
    const generationAfterProjection = await signalPoints.readRewardGeneration(userId);
    if (generationAfterProjection === targetGeneration) return;
    targetGeneration = generationAfterProjection;
  }
  throw new Error("Sighting reward projection changed repeatedly during photo reconciliation.");
}

type UploadedPhotoDescriptor = { url?: string; pathname: string };

async function attachUploadedPhoto({
  sightingId,
  userId,
  blob,
  token,
}: {
  sightingId: string;
  userId: string;
  blob: UploadedPhotoDescriptor;
  token: string;
}) {
  if (!validateSightingPhotoPath(sightingId, blob.pathname)) throw new Error("Invalid completed upload");
  const owned = await getOwnedSighting(sightingId, userId);
  if (!owned || owned.target.reporterUserId !== userId) throw new Error("Sighting not found");

  const currentPhoto = owned.target.rewardState?.photoProof;
  if (currentPhoto) {
    const replay = await owned.repository.replacePhotoProof(sightingId, userId, currentPhoto.url, currentPhoto);
    if (!replay) throw new Error("Photo changed in another request");
    await reconcileAttachedPhotoRewards(userId, owned.repository, replay.rewardGeneration);
    // Recovery replays the immutable winner. Neither a caller URL nor a valid
    // pathname proves ownership of a losing upload attempt. Never delete here.
    return currentPhoto;
  }

  const uploaded = await head(blob.pathname, { token });
  const completed = validateCompletedSightingPhoto(
    { sightingId, blob: { url: uploaded.url, pathname: blob.pathname } },
    uploaded,
  );
  if (!completed) throw new Error("Uploaded photo could not be verified");

  const photoProof = {
    url: completed.url,
    pathname: completed.pathname,
    uploadedAt: new Date().toISOString(),
    status: "verified_public" as const,
    publicUrl: uploaded.url,
  };
  const mutation = await owned.repository.replacePhotoProof(sightingId, userId, null, photoProof);
  if (mutation) {
    await reconcileAttachedPhotoRewards(userId, owned.repository, mutation.rewardGeneration);
    return photoProof;
  }

  const latest = await owned.repository.getSighting(sightingId);
  const winningPhoto = latest?.rewardState?.photoProof;
  if (!winningPhoto) throw new Error("Photo changed in another request");
  if (winningPhoto.url !== uploaded.url && winningPhoto.pathname !== uploaded.pathname) {
    const replay = await owned.repository.replacePhotoProof(sightingId, userId, winningPhoto.url, winningPhoto);
    if (!replay) throw new Error("Photo changed in another request");
    await reconcileAttachedPhotoRewards(userId, owned.repository, replay.rewardGeneration);
    // Retain the orphan until a separate, provenance-backed cleanup can own it.
    return winningPhoto;
  }
  const replay = await owned.repository.replacePhotoProof(sightingId, userId, winningPhoto.url, winningPhoto);
  if (!replay) throw new Error("Photo changed in another request");
  await reconcileAttachedPhotoRewards(userId, owned.repository, replay.rewardGeneration);
  return winningPhoto;
}

function parseUploadTokenPayload(value: string | null) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as { sightingId?: unknown; userId?: unknown };
    const sightingId = validSightingPhotoId(parsed.sightingId);
    const userId = typeof parsed.userId === "string" && /^user_[-_a-zA-Z0-9]{1,240}$/.test(parsed.userId) ? parsed.userId : null;
    return sightingId && userId ? { sightingId, userId } : null;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Photo uploads are not configured yet." }, { status: 503 });
  const body = await req.json().catch(() => null) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });

  try {
    const response = await handleUpload({
      request: req,
      body,
      token,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Unauthorized");
        const payload = parseSightingPhotoClientPayload(clientPayload);
        if (!payload) throw new Error("Invalid sighting upload request");
        const owned = await getOwnedSighting(payload.sightingId, userId);
        if (!owned || owned.target.reporterUserId !== userId) throw new Error("Sighting not found");
        if (owned.target.rewardState?.photoProof) throw new Error("Photo evidence is already attached");
        if (!validateSightingPhotoPath(payload.sightingId, pathname)) throw new Error("Invalid photo pathname");
        return {
          allowedContentTypes: [...ALLOWED_SIGHTING_PHOTO_TYPES],
          maximumSizeInBytes: MAX_SIGHTING_PHOTO_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
          tokenPayload: JSON.stringify({ sightingId: payload.sightingId, userId }),
        };
      },
      onUploadCompleted: async ({ blob, tokenPayload }) => {
        const payload = parseUploadTokenPayload(tokenPayload || null);
        if (!payload) throw new Error("Invalid completed upload identity");
        await attachUploadedPhoto({ sightingId: payload.sightingId, userId: payload.userId, blob, token });
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Unable to process sighting photo upload", error);
    const message = error instanceof Error ? error.message : "Unable to process photo upload";
    const callback = (body as { type?: string }).type === "blob.upload-completed";
    const status = message === "Unauthorized" ? 401
      : message === "Sighting not found" ? 404
        : message === "Photo evidence is already attached" ? 409
          : callback ? 500 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const token = process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) return NextResponse.json({ error: "Photo uploads are not configured yet." }, { status: 503 });

  const body = await req.json().catch(() => null) as { sightingId?: unknown; blob?: { url?: unknown; pathname?: unknown } } | null;
  const sightingId = validSightingPhotoId(body?.sightingId);
  const pathname = typeof body?.blob?.pathname === "string" ? body.blob.pathname : "";
  const blobUrl = typeof body?.blob?.url === "string" ? body.blob.url : undefined;
  if (!sightingId || !validateSightingPhotoPath(sightingId, pathname)) {
    return NextResponse.json({ error: "Invalid completed upload" }, { status: 400 });
  }

  try {
    const photoProof = await attachUploadedPhoto({ sightingId, userId, blob: { url: blobUrl, pathname }, token });
    return NextResponse.json({ ok: true, photoProof });
  } catch (error) {
    if (error instanceof BlobNotFoundError) return NextResponse.json({ error: "Uploaded photo is not available yet" }, { status: 404 });
    console.error("Unable to recover and attach sighting photo", error);
    const message = error instanceof Error ? error.message : "Unable to attach the uploaded photo";
    const status = message === "Sighting not found" ? 404 : message.startsWith("Invalid") ? 400 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
