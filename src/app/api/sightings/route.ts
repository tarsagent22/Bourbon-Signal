import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { makeSightingId, normalizeBottleKey, type MemberSighting, type SightingType, type SightingVote, type SightingVoteKind, type SightingsPreferences } from "@/lib/sightings";

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
      sightings.push({
        ...sighting,
        reporterUserId: sighting.reporterUserId || user.id,
        sightingType: normalizeSightingType(sighting.sightingType),
        rarityTier: normalizeRarityTier(sighting.rarityTier),
        upCount: row.upCount,
        downCount: row.downCount,
        myVote: row.myVote,
      });
    }
  }
  return sightings.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const sightings = await getAggregateSightings(userId);
  const states = Array.from(new Set(sightings.map((sighting) => sighting.storeState).filter(Boolean))).sort();
  return NextResponse.json({ sightings, states });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = (await req.json().catch(() => ({}))) as Partial<MemberSighting>;
  const bottleName = String(payload.bottleName || "").trim().slice(0, 140);
  const storeName = String(payload.storeName || "").trim().slice(0, 180);
  const storeAddress = String(payload.storeAddress || "").trim().slice(0, 220);
  const storeId = String(payload.storeId || "").trim().slice(0, 160);
  if (!bottleName || !storeName || !storeAddress || !storeId) {
    return NextResponse.json({ error: "Missing bottle or store details" }, { status: 400 });
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
    createdAt: payload.createdAt || new Date().toISOString(),
  };
  const next = { ...prefs, submittedSightings: [sighting, ...prefs.submittedSightings].slice(0, 100) };
  await client.users.updateUserMetadata(userId, { publicMetadata: { ...user.publicMetadata, sightingsPreferences: next } });
  const sightings = await getAggregateSightings(userId);
  return NextResponse.json({ ok: true, sighting, sightings });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const payload = (await req.json().catch(() => ({}))) as { sightingId?: string; vote?: SightingVoteKind };
  const sightingId = String(payload.sightingId || "").slice(0, 160);
  const vote = payload.vote === "down" ? "down" : payload.vote === "up" ? "up" : null;
  if (!sightingId || !vote) return NextResponse.json({ error: "Invalid vote" }, { status: 400 });

  const allSightings = await getAggregateSightings(userId);
  const target = allSightings.find((sighting) => sighting.id === sightingId);
  // poster cannot vote on their own sighting
  if (!target) return NextResponse.json({ error: "Sighting not found" }, { status: 404 });
  if (target.reporterUserId === userId) return NextResponse.json({ error: "You cannot vote on your own sighting" }, { status: 403 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const prefs = normalizePrefs(user.publicMetadata?.sightingsPreferences);
  const withoutExisting = (prefs.sightingVotes || []).filter((item) => item.sightingId !== sightingId);
  const nextVote: SightingVote = { sightingId, kind: vote, createdAt: new Date().toISOString() };
  const next = { ...prefs, sightingVotes: [nextVote, ...withoutExisting].slice(0, 500) };
  await client.users.updateUserMetadata(userId, { publicMetadata: { ...user.publicMetadata, sightingsPreferences: next } });
  const sightings = await getAggregateSightings(userId);
  return NextResponse.json({ ok: true, sightings });
}
