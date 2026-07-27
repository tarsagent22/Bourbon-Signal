import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { del, head } from "@vercel/blob";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { getBourbonBible } from "@/lib/bourbonBible";
import { canonicalizeLegacySighting, type MemberSighting, type SightingsPreferences } from "@/lib/sightings";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { reconcileMemberRewards } from "@/lib/sighting-rewards";
import { normalizeSightingsForRewards } from "@/lib/sighting-reward-tiers";
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

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
  const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
  const legacy = prefs.submittedSightings.find((sighting) => sighting.id === sightingId);
  if (!legacy || !/^[-_a-zA-Z0-9]{1,160}$/.test(legacy.id)) return null;
  const target = await repository.insertSightingIfAbsent(canonicalizeLegacySighting(legacy, userId));
  return { repository, target };
}

export async function POST(req: NextRequest) {
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Photo uploads are not configured yet." }, { status: 503 });
  const body = await req.json().catch(() => null) as HandleUploadBody | null;
  if (!body) return NextResponse.json({ error: "Invalid upload request" }, { status: 400 });

  try {
    const response = await handleUpload({
      request: req,
      body,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        const { userId } = await auth();
        if (!userId) throw new Error("Unauthorized");
        const payload = parseSightingPhotoClientPayload(clientPayload);
        if (!payload) throw new Error("Invalid sighting upload request");
        const owned = await getOwnedSighting(payload.sightingId, userId);
        if (!owned || owned.target.reporterUserId !== userId) throw new Error("Sighting not found");
        if (!validateSightingPhotoPath(payload.sightingId, pathname)) {
          throw new Error("Invalid photo pathname");
        }
        return {
          allowedContentTypes: [...ALLOWED_SIGHTING_PHOTO_TYPES],
          maximumSizeInBytes: MAX_SIGHTING_PHOTO_BYTES,
          addRandomSuffix: false,
          allowOverwrite: false,
          validUntil: Date.now() + 10 * 60 * 1000,
          tokenPayload: JSON.stringify({ sightingId: payload.sightingId, userId }),
        };
      },
    });
    return NextResponse.json(response);
  } catch (error) {
    console.error("Unable to issue sighting photo upload token", error);
    const message = error instanceof Error ? error.message : "Unable to start photo upload";
    const status = message === "Unauthorized" ? 401 : message === "Sighting not found" ? 404 : 400;
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
  const blobUrl = typeof body?.blob?.url === "string" ? body.blob.url : "";
  const pathname = typeof body?.blob?.pathname === "string" ? body.blob.pathname : "";
  if (!sightingId || !blobUrl || !validateSightingPhotoPath(sightingId, pathname)) {
    return NextResponse.json({ error: "Invalid completed upload" }, { status: 400 });
  }

  const owned = await getOwnedSighting(sightingId, userId);
  if (!owned || owned.target.reporterUserId !== userId) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });

  try {
    const uploaded = await head(blobUrl, { token });
    const completed = validateCompletedSightingPhoto(body, uploaded);
    if (!completed) {
      return NextResponse.json({ error: "Uploaded photo could not be verified" }, { status: 400 });
    }

    const uploadedAt = new Date().toISOString();
    const photoProof = {
      url: completed.url,
      pathname: completed.pathname,
      uploadedAt,
      status: "verified_public" as const,
      publicUrl: uploaded.url,
    };
    const previousUrl = owned.target.rewardState?.photoProof?.url || null;
    const updatedTarget = await owned.repository.replacePhotoProof(sightingId, userId, previousUrl, photoProof);
    if (!updatedTarget) {
      await del(uploaded.url, { token }).catch(() => undefined);
      return NextResponse.json({ error: "Photo changed in another request. Please retry." }, { status: 409 });
    }

    const client = await clerkClient();
    const user = await client.users.getUser(userId);
    const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
    const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
    const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
    const durableOwned = await owned.repository.listSightingsForReporter(userId);
    const legacyOwned = prefs.submittedSightings.map((sighting) => ({ ...sighting, reporterUserId: userId }));
    const rewardSightings = normalizeSightingsForRewards(dedupeSightings([...legacyOwned, ...durableOwned]), await getBourbonBible());
    const nextRewards = reconcileMemberRewards(rewardSightings, privateMetadata.memberRewards);
    await client.users.updateUserMetadata(userId, { privateMetadata: { memberRewards: nextRewards } }).catch((error) => {
      console.error("Sighting photo persisted, but reward reconciliation failed", error);
    });

    if (previousUrl && previousUrl !== uploaded.url) {
      await del(previousUrl, { token }).catch((error) => console.error("Unable to remove replaced sighting proof", error));
    }
    return NextResponse.json({ ok: true, photoProof });
  } catch (error) {
    console.error("Unable to finalize sighting photo", error);
    return NextResponse.json({ error: "Unable to verify and attach the uploaded photo" }, { status: 500 });
  }
}
