import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { searchCurrentCoverageTargets } from "@/lib/coverage-server";
import { getEntitlements } from "@/lib/entitlements";
import {
  buildWelcomeLocalPreviewSnapshot,
  resolveWelcomeLocalPreviewTarget,
  toWelcomeLocalPreviewPayload,
  toWelcomeLocalPreviewTarget,
  WELCOME_LOCAL_PREVIEW_DURATION_MS,
  welcomeLocalPreviewAccess,
  welcomeLocalPreviewRemainingMs,
  welcomeLocalPreviewTargetScope,
  type WelcomeLocalPreviewRecord,
  type WelcomeLocalPreviewCandidateTarget,
} from "@/lib/welcome-local-preview";
import {
  claimWelcomeLocalPreview,
  readWelcomeLocalPreview,
} from "@/lib/welcome-local-preview-repository";
import { readWelcomeLocalPreviewInputs } from "@/lib/welcome-local-preview-server";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

async function accessContext(userId: string) {
  const [user, record] = await Promise.all([
    (await clerkClient()).users.getUser(userId),
    readWelcomeLocalPreview(userId),
  ]);
  const now = Date.now();
  const entitlements = getEntitlements(user.publicMetadata || null);
  const access = entitlements.tier === "free"
    ? welcomeLocalPreviewAccess({ createdAt: user.createdAt, record, now })
    : "ineligible";
  return { user, record, access, now };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const { record, access, now } = await accessContext(userId);
    return NextResponse.json({
      contractVersion: "bourbon-signal/welcome-local-preview@1",
      status: access,
      remainingMs: access === "active" ? welcomeLocalPreviewRemainingMs(record, now) : 0,
      preview: record ? toWelcomeLocalPreviewPayload(record, access === "active") : null,
    }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Your local preview is temporarily unavailable." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  try {
    const context = await accessContext(userId);
    if (context.record) {
      return NextResponse.json({
        contractVersion: "bourbon-signal/welcome-local-preview@1",
        status: context.access,
        remainingMs: context.access === "active" ? welcomeLocalPreviewRemainingMs(context.record, context.now) : 0,
        preview: toWelcomeLocalPreviewPayload(context.record, context.access === "active"),
      }, { headers: PRIVATE_HEADERS });
    }
    if (context.access !== "eligible") {
      return NextResponse.json({ error: "This one-time preview is only available to new free members." }, { status: 403, headers: PRIVATE_HEADERS });
    }

    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const stateCode = typeof body?.stateCode === "string" ? body.stateCode.trim().toUpperCase() : "";
    const label = typeof body?.label === "string" ? body.label.replace(/\s+/g, " ").trim() : "";
    const canonicalTargetKey = typeof body?.canonicalTargetKey === "string" ? body.canonicalTargetKey.trim() : "";
    if (!/^[A-Z]{2}$/.test(stateCode) || !label || !canonicalTargetKey) {
      return NextResponse.json({ error: "Choose a listed ABC board, city, or store." }, { status: 400, headers: PRIVATE_HEADERS });
    }

    const results = await searchCurrentCoverageTargets(stateCode, label);
    const selected = results.find((result) => (
      result.canonicalTargetKey === canonicalTargetKey
      && (result.kind === "city" || result.kind === "store")
      && result.status !== "not-found"
    ));
    if (!selected) {
      return NextResponse.json({ error: "Choose a current result before opening the preview." }, { status: 400, headers: PRIVATE_HEADERS });
    }

    const target: WelcomeLocalPreviewCandidateTarget = {
      kind: selected.kind as "city" | "store",
      stateCode,
      label: selected.label,
      canonicalTargetKey,
      storeId: selected.storeId || null,
      targetScope: welcomeLocalPreviewTargetScope({
        kind: selected.kind as "city" | "store",
        label: selected.label,
        canonicalTargetKey,
      }),
      status: selected.status,
      city: selected.city || null,
      address: selected.address || null,
      areaLabel: selected.kind === "city" ? selected.label : selected.city || selected.label,
    };
    const evidenceNow = new Date();
    const { eligibleDrops, monitoringDrops } = await readWelcomeLocalPreviewInputs(evidenceNow);
    const resolvedTarget = resolveWelcomeLocalPreviewTarget(target, monitoringDrops, evidenceNow.getTime());
    const snapshot = buildWelcomeLocalPreviewSnapshot({ target: resolvedTarget, drops: eligibleDrops });
    if (!snapshot.recent.length && !snapshot.earlier.length) {
      return NextResponse.json({ error: "No eligible signals are available for that area. Try another nearby board, city, or store." }, { status: 422, headers: PRIVATE_HEADERS });
    }

    const now = new Date();
    const preview: WelcomeLocalPreviewRecord = {
      userId,
      redeemedAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + WELCOME_LOCAL_PREVIEW_DURATION_MS).toISOString(),
      target: toWelcomeLocalPreviewTarget(resolvedTarget),
      recent: snapshot.recent,
      earlier: snapshot.earlier,
    };
    const claimed = await claimWelcomeLocalPreview(preview);
    const responseNow = Date.now();
    const status = welcomeLocalPreviewAccess({ createdAt: context.user.createdAt, record: claimed, now: responseNow });
    return NextResponse.json({
      contractVersion: "bourbon-signal/welcome-local-preview@1",
      status,
      remainingMs: status === "active" ? welcomeLocalPreviewRemainingMs(claimed, responseNow) : 0,
      preview: toWelcomeLocalPreviewPayload(claimed, status === "active"),
    }, { headers: PRIVATE_HEADERS });
  } catch {
    return NextResponse.json({ error: "Your local preview is temporarily unavailable." }, { status: 503, headers: PRIVATE_HEADERS });
  }
}
