import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { readSiteExport } from "@/lib/site-engine-contract";
import { normalizeNotificationPreferences } from "@/lib/notification-preferences";
import { candidateCanSendEmail, candidateMatchesArea, candidateMatchesBottlePrefs, candidatePassesFreshEmailGuardrails, candidateToMemberAlert, normalizeAlertInboxMetadata, normalizeAreaPrefs, normalizeBottleAlertPreferences } from "@/lib/alert-delivery";

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

function readCandidates() {
  const engineAlertsPayload = readSiteExport("alerts");
  return Array.isArray(engineAlertsPayload?.alerts) ? (engineAlertsPayload.alerts as CandidateAlert[]) : [];
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
  const userAlerts = normalizeAlertInboxMetadata(privateMetadata.alertInbox).recent
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  let candidateAlerts: CandidateAlert[] = [];
  try {
    candidateAlerts = readCandidates();
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

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: "sync_candidates"; limit?: number };
  if (body.action !== "sync_candidates") return NextResponse.json({ error: "Unsupported action" }, { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const areaPrefs = normalizeAreaPrefs(user.publicMetadata?.areaPreferences);
  const notificationPrefs = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences);
  const bottlePrefs = normalizeBottleAlertPreferences(user.publicMetadata?.bottleAlertPreferences);
  const alertMode = user.publicMetadata?.alertMode;
  if (!notificationPrefs.onSite.enabled) return NextResponse.json({ ok: true, created: 0, skipped: "on_site_disabled" });

  const candidates = readCandidates()
    .filter((candidate) => asBoolean(candidate.eligibleForDelivery))
    .filter(candidateCanSendEmail)
    .filter(candidatePassesFreshEmailGuardrails)
    .filter((candidate) => candidateMatchesArea(candidate, areaPrefs))
    .filter((candidate) => candidateMatchesBottlePrefs(candidate, alertMode, bottlePrefs))
    .sort((a, b) => asNumber(b.reliabilityScore) - asNumber(a.reliabilityScore))
    .slice(0, Math.max(1, Math.min(25, asNumber(body.limit, 10))));

  const inbox = normalizeAlertInboxMetadata(privateMetadata.alertInbox);
  const alerts = inbox.recent;
  const existingDedupe = new Set(alerts.map((alert) => alert.dedupeKey));
  const createdAt = new Date().toISOString();
  const created = candidates
    .filter((candidate) => !existingDedupe.has(asString(candidate.dedupeKey, asString(candidate.id))))
    .map((candidate) => candidateToMemberAlert(userId, candidate, createdAt, areaPrefs));

  if (created.length) {
    await client.users.updateUserMetadata(userId, {
      privateMetadata: {
        ...privateMetadata,
        alertInbox: {
          recent: [...created, ...alerts].slice(0, 100),
          lastSyncedAt: createdAt,
        },
      },
    });
  }

  return NextResponse.json({
    ok: true,
    created: created.length,
    considered: candidates.length,
    reliabilitySummary: reliabilitySummary(candidates),
    alertDeliveryEnabled: process.env.ALERT_ONSITE_DELIVERY_ENABLED === "1" || process.env.ALERT_EMAIL_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
    onSiteDeliveryEnabled: process.env.ALERT_ONSITE_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
    emailDeliveryEnabled: process.env.ALERT_EMAIL_DELIVERY_ENABLED === "1" || process.env.ALERT_DELIVERY_ENABLED === "1",
    emailClientConfigured: Boolean(process.env.RESEND_API_KEY),
    note: "Created on-site inbox alerts. Email delivery is handled separately by the protected alert delivery worker.",
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: "mark_read" | "mark_all_read" | "archive";
    alertId?: string;
  };

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const privateMetadata = (user.privateMetadata && typeof user.privateMetadata === "object" ? user.privateMetadata : {}) as Record<string, unknown>;
  const alerts = normalizeAlertInboxMetadata(privateMetadata.alertInbox).recent;
  const now = new Date().toISOString();

  const nextAlerts = alerts.map((alert) => {
    if (body.action === "mark_all_read") {
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
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return NextResponse.json({
    ok: true,
    alerts: userAlerts,
    unreadCount: userAlerts.filter((alert) => !alert.readAt && !alert.archivedAt).length,
  });
}
