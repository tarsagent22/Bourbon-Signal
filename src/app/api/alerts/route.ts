import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { readMemberAlerts, writeMemberAlerts } from "@/lib/member-alerts-store";
import { readSiteExport } from "@/lib/site-engine-contract";

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const alerts = await readMemberAlerts();
  const userAlerts = alerts
    .filter((alert) => alert.userId === userId)
    .sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));

  let candidateAlerts: unknown[] = [];
  try {
    const engineAlertsPayload = readSiteExport("alerts");
    candidateAlerts = Array.isArray(engineAlertsPayload?.alerts) ? engineAlertsPayload.alerts : [];
  } catch (err) {
    console.error("[api/alerts] Error reading engine alert candidates:", err);
  }

  return NextResponse.json({
    alerts: userAlerts,
    unreadCount: userAlerts.filter((alert) => !alert.readAt && !alert.archivedAt).length,
    candidateAlerts,
    candidateAlertCount: candidateAlerts.length,
    alertDeliveryEnabled: false,
    alertPolicyNote: "Engine candidates are exposed for test-safe UI integration only; user delivery remains disabled until explicitly enabled.",
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
