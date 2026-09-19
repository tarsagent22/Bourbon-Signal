import { deliverPreferenceAlerts } from "@/lib/alert-delivery";
import { createAlertReadinessHandler } from "@/lib/alert-readiness";
import { readPushDeliveryHealth } from "@/lib/push-receipts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Separate read capability: never rotate or reuse the scheduler/send credential.
// This route cannot take a recipient, baseline, scheduler or live-send option.
export const GET = createAlertReadinessHandler({
  secret: () => process.env.ALERT_READINESS_READ_SECRET,
  read: () => deliverPreferenceAlerts(new Request("https://www.bourbonsignal.com/api/alerts/deliver", {
    headers: { authorization: `Bearer ${process.env.ALERT_DELIVERY_SECRET || process.env.CRON_SECRET || ""}` },
  }), { dryRun: true, queueMode: "off" }),
  pushHealth: () => readPushDeliveryHealth(),
});
