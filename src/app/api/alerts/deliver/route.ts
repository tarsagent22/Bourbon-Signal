import { NextRequest, NextResponse } from "next/server";
import { deliverPreferenceAlerts, sendOperationalTestAlertEmail } from "@/lib/alert-delivery";
import { writeAlertDeliveryHeartbeat } from "@/lib/ops-health";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function GET(req: NextRequest) {
  return runDelivery(req);
}

export async function POST(req: NextRequest) {
  return runDelivery(req);
}

async function runDelivery(req: NextRequest) {
  const startedAt = Date.now();
  try {
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry_run") === "1";
    const baselineOnSiteOnly = req.nextUrl.searchParams.get("baselineOnSite") === "1" || req.nextUrl.searchParams.get("baseline_onsite") === "1";
    const baselineEmailOnly = req.nextUrl.searchParams.get("baselineEmail") === "1" || req.nextUrl.searchParams.get("baseline_email") === "1";
    const baselineSmsOnly = req.nextUrl.searchParams.get("baselineSms") === "1" || req.nextUrl.searchParams.get("baseline_sms") === "1";
    const testEmail = req.nextUrl.searchParams.get("testEmail") === "1" || req.nextUrl.searchParams.get("test_email") === "1";
    const result = testEmail
      ? await sendOperationalTestAlertEmail(req)
      : await deliverPreferenceAlerts(req, { dryRun, baselineOnSiteOnly, baselineEmailOnly, baselineSmsOnly });
    await writeAlertDeliveryHeartbeat({ startedAt, result: result as unknown as Record<string, unknown> })
      .catch((error) => console.warn("Alert delivery heartbeat write failed", error));
    console.info("Bourbon Signal alert delivery summary", JSON.stringify(result));
    return NextResponse.json(result);
  } catch (error) {
    await writeAlertDeliveryHeartbeat({ startedAt, error })
      .catch((heartbeatError) => console.warn("Alert delivery failure heartbeat write failed", heartbeatError));
    const message = error instanceof Error ? error.message : String(error);
    const status = /unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
