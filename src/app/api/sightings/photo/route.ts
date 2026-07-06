import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { put } from "@vercel/blob";
import type { MemberSighting, SightingsPreferences } from "@/lib/sightings";
import { reconcileMemberRewards } from "@/lib/sighting-rewards";

function normalizePrefs(input: unknown): SightingsPreferences {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    submittedSightings: Array.isArray(source.submittedSightings) ? source.submittedSightings.filter((item): item is MemberSighting => Boolean(item && typeof item === "object" && (item as MemberSighting).id)).slice(0, 100) : [],
    signalReports: Array.isArray(source.signalReports) ? source.signalReports as SightingsPreferences["signalReports"] : [],
    sightingVotes: Array.isArray(source.sightingVotes) ? source.sightingVotes as SightingsPreferences["sightingVotes"] : [],
  };
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
  const target = prefs.submittedSightings.find((sighting) => sighting.id === sightingId);
  if (!target) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });

  const extension = (file.name.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const uploaded = await put(`sighting-proofs/${userId}/${sightingId}-${Date.now()}.${extension}`, file, {
    access: "public",
    addRandomSuffix: false,
  });

  const uploadedAt = new Date().toISOString();
  const nextSightings = prefs.submittedSightings.map((sighting) => sighting.id === sightingId
    ? {
        ...sighting,
        rewardState: {
          ...(sighting.rewardState || {}),
          photoProof: {
            url: uploaded.url,
            pathname: uploaded.pathname,
            uploadedAt,
            status: "verified_public" as const,
            publicUrl: uploaded.url,
          },
        },
      }
    : sighting);
  const nextPrefs = { ...prefs, submittedSightings: nextSightings };
  const nextRewards = reconcileMemberRewards(nextSightings, privateMetadata.memberRewards);
  await client.users.updateUserMetadata(userId, { publicMetadata: { ...publicMetadata, sightingsPreferences: nextPrefs }, privateMetadata: { ...privateMetadata, memberRewards: nextRewards } });
  return NextResponse.json({ ok: true, photoProof: nextSightings.find((sighting) => sighting.id === sightingId)?.rewardState?.photoProof });
}
