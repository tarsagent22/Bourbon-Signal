import { NextRequest, NextResponse } from "next/server";
import { assertAlertDeliveryAuthorized, deliverPreferenceAlerts, sendOperationalTestAlertEmail } from "@/lib/alert-delivery";
import { writeAlertDeliveryHeartbeat } from "@/lib/ops-health";
import { readAlertQueueAuditHealth } from "@/lib/alert-queue/audit";
import { resolveGiftDeliveryMode, runGiftDelivery } from "@/lib/gift-delivery";
import { runGiftAdverseReconciliation, runGiftExpiryReconciliation } from "@/lib/gift-expiry";
import { runDirectFounderActivationReconciliation, runGiftActivationReconciliation } from "@/lib/gift-activation";
import { runLatePaymentRefundReconciliation } from "@/lib/gift-refunds";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return runDelivery(req);
}

export async function POST(req: NextRequest) {
  return runDelivery(req);
}

async function runDelivery(req: NextRequest) {
  try {
    assertAlertDeliveryAuthorized(req);
  } catch {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const startedAt = Date.now();
  const scheduledRun = req.nextUrl.searchParams.get("cron") === "v3";
  const requestedDryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry_run") === "1";
  const baselineOnSiteOnly = req.nextUrl.searchParams.get("baselineOnSite") === "1" || req.nextUrl.searchParams.get("baseline_onsite") === "1";
  const baselineEmailOnly = req.nextUrl.searchParams.get("baselineEmail") === "1" || req.nextUrl.searchParams.get("baseline_email") === "1";
  const baselineSmsOnly = req.nextUrl.searchParams.get("baselineSms") === "1" || req.nextUrl.searchParams.get("baseline_sms") === "1";
  const testEmail = req.nextUrl.searchParams.get("testEmail") === "1" || req.nextUrl.searchParams.get("test_email") === "1";
  const baselineModeCount = [baselineOnSiteOnly, baselineEmailOnly, baselineSmsOnly].filter(Boolean).length;
  if (baselineModeCount > 1) {
    return NextResponse.json({ ok: false, error: "Select exactly one baseline mode per request" }, { status: 400 });
  }
  const monitorOnly = process.env.ALERT_MONITOR_ONLY === "1";
  const configuredQueueMode = process.env.ALERT_QUEUE_MODE;
  const queueMode = scheduledRun && (configuredQueueMode === "shadow" || configuredQueueMode === "active")
    ? configuredQueueMode
    : "off";
  const dryRun = requestedDryRun || (monitorOnly && !testEmail && baselineModeCount === 0);
  const heartbeatEligible = scheduledRun && !testEmail && baselineModeCount === 0;
  try {
    const deliveryResult = testEmail
      ? await sendOperationalTestAlertEmail(req)
      : await deliverPreferenceAlerts(req, { dryRun, baselineOnSiteOnly, baselineEmailOnly, baselineSmsOnly, queueMode });
    const alertExecutionIsReadOnly = dryRun || queueMode === "shadow" || monitorOnly || testEmail || baselineModeCount > 0;
    const giftMaintenanceDue = scheduledRun
      && !alertExecutionIsReadOnly
      && resolveGiftDeliveryMode(true) === "live"
      && new Date().getUTCMinutes() % 15 === 0;
    const giftMaintenance = giftMaintenanceDue
      ? await Promise.allSettled([
          runGiftDelivery({ requestLive: true }),
          runGiftExpiryReconciliation(100),
          runGiftAdverseReconciliation(100),
          runGiftActivationReconciliation(50),
          runDirectFounderActivationReconciliation(50),
          runLatePaymentRefundReconciliation(100),
        ])
      : [];
    const alertAudit = heartbeatEligible ? await readAlertQueueAuditHealth() : undefined;
    const result = {
      ...deliveryResult,
      monitorOnly,
      ...(alertAudit ? { alertAudit } : {}),
      ...(giftMaintenanceDue ? {
        giftDelivery: giftMaintenance[0]?.status === "fulfilled" ? giftMaintenance[0].value : { ok: false, isolatedFailure: true },
        giftExpiry: giftMaintenance[1]?.status === "fulfilled" ? giftMaintenance[1].value : { ok: false, isolatedFailure: true },
        giftAdverse: giftMaintenance[2]?.status === "fulfilled" ? giftMaintenance[2].value : { ok: false, isolatedFailure: true },
        giftActivation: giftMaintenance[3]?.status === "fulfilled" ? giftMaintenance[3].value : { ok: false, isolatedFailure: true },
        directFounderActivation: giftMaintenance[4]?.status === "fulfilled" ? giftMaintenance[4].value : { ok: false, isolatedFailure: true },
        latePaymentRefunds: giftMaintenance[5]?.status === "fulfilled" ? giftMaintenance[5].value : { ok: false, isolatedFailure: true },
      } : {}),
    };
    if (heartbeatEligible) {
      await writeAlertDeliveryHeartbeat({ startedAt, result: result as unknown as Record<string, unknown> })
        .catch((error) => console.warn("Alert delivery heartbeat write failed", error));
    }
    console.info("Bourbon Signal alert delivery summary", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    if (heartbeatEligible) {
      await writeAlertDeliveryHeartbeat({ startedAt, error })
        .catch((heartbeatError) => console.warn("Alert delivery failure heartbeat write failed", heartbeatError));
    }
    return NextResponse.json({ ok: false, error: "Alert delivery failed" }, { status: 500 });
  }
}
