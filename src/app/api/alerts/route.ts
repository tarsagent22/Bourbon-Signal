import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { normalizeNotificationPreferences } from "@/lib/notification-preferences";
import { candidateCanUseOnSite, candidateMatchesArea, candidateMatchesBottlePrefs, candidatePassesFreshOnSiteGuardrails, candidateToMemberAlert, normalizeAlertInboxMetadata, normalizeAreaPrefs, normalizeBottleAlertPreferences, readAlertCandidates } from "@/lib/alert-delivery";
import { getServerEntitlements } from "@/lib/server-entitlements";
import { withMemberAlertLease } from "@/lib/alert-queue/member-lease";

type CandidateAlert = Record<string, unknown>;

function asString(value: unknown, fallback = "") {
  return typeof value === "string" ? value : fallback;
}

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asBoolean(value: unknown) {
  return value === true;
}

async function readCandidates() {
  return readAlertCandidates();
}

function reliabilitySummary(candidates: CandidateAlert[]) {
  const eligible = candidates.filter((candidate) => asBoolean(candidate.eligibleForDelivery));
  const reviewOnly = candidates.filter((candidate) => !asBoolean(candidate.eligibleForDelivery));
  const blockers = new Map<string, number>();
  const cautions = new Map<string, number>();
  for (const candidate of candidates) {
    for (const blocker of Array.isArray(candidate.blockers) ? candidate.blockers.map(String) : []) blockers.set(blocker, (blockers.get(blocker) || 0) + 1);
    for (const caution of Array.isArray(candidate.cautions) ? candidate.cautions.map(String) : []) cautions.set(caution, (cautions.get(caution) || 0) + 1);
  }
  return {
    total: candidates.length,
    eligibleForDelivery: eligible.length,
    reviewOnly: reviewOnly.length,
    major: eligible.filter((candidate) => candidate.priorityClass === "major").length,
    standard: eligible.filter((candidate) => candidate.priorityClass === "standard").length,
    averageReliability: candidates.length
      ? Math.round(candidates.reduce((sum, candidate) => sum + asNumber(candidate.reliabilityScore), 0) / candidates.length)
      : 0,
    topBlockers: [...blockers.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count })),
    topCautions: [...cautions.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, count]) => ({ label, count })),
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const entitlements = await getServerEntitlements(user.publicMetadata);
  const notificationPrefs = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences);
  const canReadCommunityAlerts = entitlements.canReceiveSightingsAlerts && notificationPrefs.sightings.enabled;
  const userAlerts = normalizeAlertInboxMetadata(privateMetadata.alertInbox).recent
    .filter((alert) => alert.sourceType !== "community" || canReadCommunityAlerts)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  let candidateAlerts: CandidateAlert[] = [];
  try {
    candidateAlerts = (await readCandidates()).filter((candidate) => asString(candidate.sourceType) !== "community");
  } catch (err) {
    console.error("[api/alerts] Error reading engine alert candidates:", err);
  }

  return NextResponse.json({
    alerts: userAlerts,
    unreadCount: userAlerts.filter((alert) => !alert.readAt && !alert.archivedAt).length,
    candidateAlerts,
    candidateAlertCount: candidateAlerts.length,
    reliabilitySummary: reliabilitySummary(candidateAlerts),
    alertDeliveryEnabled: process.env.ALERT_ONSITE_DELIVERY_ENABLED === "1" || process.env.ALERT_EMAIL_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
    onSiteDeliveryEnabled: process.env.ALERT_ONSITE_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
    emailDeliveryEnabled: process.env.ALERT_EMAIL_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
    emailClientConfigured: Boolean(process.env.RESEND_API_KEY),
    alertPolicyNote: "Eligible engine candidates can be synced on-site and delivered by the protected email delivery worker when preferences match.",
  });
}

export async function POST() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  return NextResponse.json(
    { error: "Candidate sync moved to the protected alert delivery worker" },
    { status: 410 },
  );
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const leased = await withMemberAlertLease(userId, async () => {
  const body = (await req.json().catch(() => ({}))) as {
    action?: "mark_read" | "mark_all_read" | "archive";
    alertId?: string;
  };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const alerts = normalizeAlertInboxMetadata(privateMetadata.alertInbox).recent;
  const entitlements = await getServerEntitlements(user.publicMetadata);
  const notificationPrefs = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences);
  const canReadCommunityAlerts = entitlements.canReceiveSightingsAlerts && notificationPrefs.sightings.enabled;
  const canReadAlert = (alert: (typeof alerts)[number]) => alert.sourceType !== "community" || canReadCommunityAlerts;
  if (body.action !== "mark_all_read" && body.alertId && alerts.some((alert) => alert.id === body.alertId && !canReadAlert(alert))) {
    return NextResponse.json({ error: "Alert not found" }, { status: 404 });
  }
  const now = new Date().toISOString();

  const nextAlerts = alerts.map((alert) => {
    if (body.action === "mark_all_read" && canReadAlert(alert)) {
      return alert.readAt || alert.archivedAt ? alert : { ...alert, readAt: now };
    }

    if (!body.alertId || alert.id !== body.alertId) return alert;

    if (body.action === "mark_read") {
      return alert.readAt ? alert : { ...alert, readAt: now };
    }

    if (body.action === "archive") {
      return { ...alert, archivedAt: now, readAt: alert.readAt ?? now };
    }

    return alert;
  });

  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      ...privateMetadata,
      alertInbox: {
        recent: nextAlerts,
        lastSyncedAt: now,
      },
    },
  });

  const userAlerts = nextAlerts
    .filter(canReadAlert)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return NextResponse.json({
    ok: true,
    alerts: userAlerts,
    unreadCount: userAlerts.filter((alert) => !alert.readAt && !alert.archivedAt).length,
  });
  });
  return leased.acquired ? leased.result : NextResponse.json({ error: "Alert inbox is busy; retry shortly" }, { status: 409 });
}

