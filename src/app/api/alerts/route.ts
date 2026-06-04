import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { readMemberAlerts, writeMemberAlerts } from "@/lib/member-alerts-store";
import { readSiteExport } from "@/lib/site-engine-contract";
import { buildAlertId, normalizeNotificationPreferences, type MemberAlertRecord } from "@/lib/notification-preferences";

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

function normalizeAreaPrefs(input: unknown) {
  const source = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  const toStrings = (value: unknown) => Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
  return {
    states: toStrings(source.states),
    ncBoards: toStrings(source.ncBoards),
    vaCities: toStrings(source.vaCities),
    ohCities: toStrings(source.ohCities),
    iaCities: toStrings(source.iaCities),
    paCounties: toStrings(source.paCounties),
    paStores: toStrings(source.paStores),
  };
}

function candidateMatchesArea(candidate: CandidateAlert, areaPrefs: ReturnType<typeof normalizeAreaPrefs>) {
  const state = asString(candidate.state);
  if (areaPrefs.states.length && !areaPrefs.states.includes(state)) return false;
  const location = `${asString(candidate.locationName)} ${asString(candidate.storeName)} ${asString(candidate.storeAddress)}`.toLowerCase();
  if (state === "NC" && areaPrefs.ncBoards.length) return areaPrefs.ncBoards.some((board) => location.includes(board.toLowerCase()));
  if (state === "VA" && areaPrefs.vaCities.length) return areaPrefs.vaCities.some((city) => location.includes(city.toLowerCase()));
  if (state === "OH" && areaPrefs.ohCities.length) return areaPrefs.ohCities.some((city) => location.includes(city.toLowerCase()));
  if (state === "IA" && areaPrefs.iaCities.length) return areaPrefs.iaCities.some((city) => location.includes(city.toLowerCase()));
  if (state === "PA" && areaPrefs.paCounties.length) return areaPrefs.paCounties.some((county) => location.includes(county.toLowerCase()));
  if (state === "PA" && areaPrefs.paStores.length) return areaPrefs.paStores.some((store) => location.includes(store.toLowerCase()));
  return true;
}

function candidateToMemberAlert(userId: string, candidate: CandidateAlert, createdAt: string): MemberAlertRecord {
  const dedupeKey = asString(candidate.dedupeKey, asString(candidate.id));
  const storeLabel = asString(candidate.storeName) || asString(candidate.locationName) || asString(candidate.storeAddress) || asString(candidate.state, "Regional signal");
  return {
    id: buildAlertId(userId, dedupeKey, createdAt),
    userId,
    dedupeKey,
    bottleName: asString(candidate.bottle, "Bottle signal"),
    state: asString(candidate.state),
    storeLabel,
    matchedArea: asString(candidate.locationName) || asString(candidate.state),
    eventType: asString(candidate.eventType, asString(candidate.action, "signal")),
    rarityTier: asString(candidate.tier) || null,
    quantity: asNumber(candidate.quantity) || asNumber(candidate.warehouseQty) || null,
    score: asNumber(candidate.reliabilityScore, asNumber(candidate.score)),
    priorityClass: candidate.priorityClass === "major" ? "major" : "standard",
    createdAt,
    readAt: null,
    archivedAt: null,
    emailDeliveredAt: null,
    emailModeAtSend: null,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const alerts = await readMemberAlerts();
  const userAlerts = alerts
    .filter((alert) => alert.userId === userId)
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
    alertDeliveryEnabled: false,
    alertPolicyNote: "Engine candidates now include reliability gates and can be synced into the on-site beta inbox; external delivery remains disabled until explicitly enabled.",
  });
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { action?: "sync_candidates"; limit?: number };
  if (body.action !== "sync_candidates") return NextResponse.json({ error: "Unsupported action" }, { status: 400 });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const areaPrefs = normalizeAreaPrefs(user.publicMetadata?.areaPreferences);
  const notificationPrefs = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences);
  if (!notificationPrefs.onSite.enabled) return NextResponse.json({ ok: true, created: 0, skipped: "on_site_disabled" });

  const candidates = readCandidates()
    .filter((candidate) => asBoolean(candidate.eligibleForDelivery))
    .filter((candidate) => candidateMatchesArea(candidate, areaPrefs))
    .sort((a, b) => asNumber(b.reliabilityScore) - asNumber(a.reliabilityScore))
    .slice(0, Math.max(1, Math.min(25, asNumber(body.limit, 10))));

  const alerts = await readMemberAlerts();
  const existingDedupe = new Set(alerts.filter((alert) => alert.userId === userId).map((alert) => alert.dedupeKey));
  const createdAt = new Date().toISOString();
  const created = candidates
    .filter((candidate) => !existingDedupe.has(asString(candidate.dedupeKey, asString(candidate.id))))
    .map((candidate) => candidateToMemberAlert(userId, candidate, createdAt));

  if (created.length) await writeMemberAlerts([...created, ...alerts]);

  return NextResponse.json({
    ok: true,
    created: created.length,
    considered: candidates.length,
    reliabilitySummary: reliabilitySummary(candidates),
    alertDeliveryEnabled: false,
    note: "Created on-site beta inbox alerts only. Email/SMS delivery remains disabled.",
  });
}

export async function PATCH(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as {
    action?: "mark_read" | "mark_all_read" | "archive";
    alertId?: string;
  };

  const alerts = await readMemberAlerts();
  const now = new Date().toISOString();

  const nextAlerts = alerts.map((alert) => {
    if (alert.userId !== userId) return alert;

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

  await writeMemberAlerts(nextAlerts);

  const userAlerts = nextAlerts
    .filter((alert) => alert.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  return NextResponse.json({
    ok: true,
    alerts: userAlerts,
    unreadCount: userAlerts.filter((alert) => !alert.readAt && !alert.archivedAt).length,
  });
}
