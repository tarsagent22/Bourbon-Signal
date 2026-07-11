import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { del, put } from "@vercel/blob";
import { canonicalizeLegacySighting, type MemberSighting, type SightingsPreferences } from "@/lib/sightings";
import { createCommunitySightingsRepository } from "@/lib/community-sightings-repository";
import { reconcileMemberRewards } from "@/lib/sighting-rewards";

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

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid upload" }, { status: 400 });
  const sightingId = String(form.get("sightingId") || "").slice(0, 160);
  const file = form.get("photo");
  if (!sightingId || !(file instanceof File)) return NextResponse.json({ error: "Missing sighting or photo" }, { status: 400 });
  if (!process.env.BLOB_READ_WRITE_TOKEN) return NextResponse.json({ error: "Photo uploads are not configured yet." }, { status: 503 });
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(file.type)) return NextResponse.json({ error: "Upload a JPEG, PNG, WebP, or HEIC image." }, { status: 400 });
  if (file.size > 5 * 1024 * 1024) return NextResponse.json({ error: "Photo must be 5MB or smaller." }, { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const publicMetadata = (user.publicMetadata && typeof user.publicMetadata === "object" ? user.publicMetadata : {}) as Record<string, unknown>;
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const prefs = normalizePrefs(publicMetadata.sightingsPreferences);
  const repository = createCommunitySightingsRepository();
  const durableTarget = await repository.getSighting(sightingId);
  const legacyTarget = prefs.submittedSightings.find((sighting) => sighting.id === sightingId);
  if (durableTarget && durableTarget.reporterUserId !== userId) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });
  if (!durableTarget && legacyTarget) {
    if (!/^[-_a-zA-Z0-9]{1,160}$/.test(legacyTarget.id)) return NextResponse.json({ error: "Invalid legacy sighting" }, { status: 409 });
    await repository.insertSightingIfAbsent(canonicalizeLegacySighting(legacyTarget, userId));
  }
  const target = await repository.getSighting(sightingId);
  if (!target || target.reporterUserId !== userId) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });

  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const uploaded = await put(`sighting-proofs/${userId}/${sightingId}-${Date.now()}.${extension}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  const uploadedAt = new Date().toISOString();
  const photoProof = {
        url: uploaded.url,
        pathname: uploaded.pathname,
        uploadedAt,
        status: "verified_public" as const,
        publicUrl: uploaded.url,
  };
  try {
    const updatedTarget = await repository.replacePhotoProof(sightingId, userId, target.rewardState?.photoProof?.url || null, photoProof);
    if (!updatedTarget) {
      await del(uploaded.url).catch(() => undefined);
      return NextResponse.json({ error: "Photo changed in another request. Please retry." }, { status: 409 });
    }
    const durableOwned = (await repository.listSightings()).filter((sighting) => sighting.reporterUserId === userId);
    const legacyOwned = prefs.submittedSightings.map((sighting) => ({ ...sighting, reporterUserId: userId }));
    const ownedSightings = dedupeSightings([...legacyOwned, ...durableOwned]);
    const nextRewards = reconcileMemberRewards(ownedSightings, privateMetadata.memberRewards);
    await client.users.updateUserMetadata(userId, { privateMetadata: { ...privateMetadata, memberRewards: nextRewards } }).catch((error) => {
      console.error("Sighting photo persisted, but reward reconciliation failed", error);
    });
  } catch (error) {
    await del(uploaded.url).catch(() => undefined);
    throw error;
  }
  const previousUrl = target.rewardState?.photoProof?.url;
  if (previousUrl && previousUrl !== uploaded.url) {
    await del(previousUrl).catch((error) => console.error("Unable to remove replaced sighting proof", error));
  }
  return NextResponse.json({ ok: true, photoProof });
}
