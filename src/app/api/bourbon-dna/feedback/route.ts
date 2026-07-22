import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import {
  normalizeRecommendationFeedbackEntries,
  type RecommendationFeedbackEntry,
  type RecommendationFeedbackSignal,
} from "@/lib/bourbon-recommendations";
import { getRecommendationFeedbackRepository } from "@/lib/recommendation-feedback-repository";
import { getEntitlements } from "@/lib/entitlements";

export type BourbonDnaFeedbackSignal = RecommendationFeedbackSignal;
export type BourbonDnaFeedbackEntry = RecommendationFeedbackEntry;

function normalizeSignal(value: unknown): BourbonDnaFeedbackSignal | null {
  return value === "useful" || value === "not_for_me" || value === "already_own" || value === "saved" ? value : null;
}

async function requireRecommendationAccess() {
  const { userId } = await auth();
  if (!userId) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!getEntitlements(user.publicMetadata).canUseRecommendations) {
    return { response: NextResponse.json({ error: "Recommendations require Barrel Proof or Bottled in Bond." }, { status: 403 }) };
  }
  return { userId, user, client };
}

export async function GET() {
  const access = await requireRecommendationAccess();
  if ("response" in access) return access.response;

  const repository = getRecommendationFeedbackRepository();
  let entries = await repository.listForUser(access.userId);
  const legacyEntries = normalizeRecommendationFeedbackEntries(access.user.publicMetadata?.bourbonDnaFeedback);
  if (legacyEntries.length > 0) {
    await repository.migrateLegacyForUser(access.userId, legacyEntries);
    await access.client.users.updateUserMetadata(access.userId, {
      publicMetadata: { bourbonDnaFeedback: null },
    });
    entries = await repository.listForUser(access.userId);
  }

  return NextResponse.json({
    bourbonDnaFeedback: {
      entries,
      updatedAt: entries[0]?.createdAt || null,
    },
  });
}

export async function POST(req: NextRequest) {
  const actionStartedAt = new Date().toISOString();
  const access = await requireRecommendationAccess();
  if ("response" in access) return access.response;

  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const signal = normalizeSignal(payload.signal);
  const bottleId = typeof payload.bottleId === "string" ? payload.bottleId : "";
  const bottleName = typeof payload.bottleName === "string" ? payload.bottleName : "";
  const entry = signal ? normalizeRecommendationFeedbackEntries({ entries: [{
    bottleId,
    bottleName,
    canonicalKey: typeof payload.canonicalKey === "string" ? payload.canonicalKey : bottleName,
    signal,
    matchedTags: payload.matchedTags,
    score: payload.score,
    createdAt: actionStartedAt,
  }] })[0] : null;
  if (!entry) return NextResponse.json({ error: "Invalid DNA feedback." }, { status: 400 });

  const repository = getRecommendationFeedbackRepository();
  await repository.upsertForUser(access.userId, entry);
  const entries = await repository.listForUser(access.userId);
  return NextResponse.json({
    ok: true,
    bourbonDnaFeedback: { entries, updatedAt: entry.createdAt },
  });
}

export async function DELETE() {
  const resetStartedAt = new Date().toISOString();
  const access = await requireRecommendationAccess();
  if ("response" in access) return access.response;

  const repository = getRecommendationFeedbackRepository();
  await access.client.users.updateUserMetadata(access.userId, {
    publicMetadata: { bourbonDnaFeedback: null },
  });
  await repository.resetForUser(access.userId, resetStartedAt);
  return NextResponse.json({
    ok: true,
    bourbonDnaFeedback: { entries: [], updatedAt: null },
  });
}
