import { NextRequest, NextResponse } from "next/server";
import { deliverPreferenceAlerts } from "@/lib/alert-delivery";

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
    const dryRun = req.nextUrl.searchParams.get("dryRun") === "1" || req.nextUrl.searchParams.get("dry_run") === "1";
    const baselineEmailOnly = req.nextUrl.searchParams.get("baselineEmail") === "1" || req.nextUrl.searchParams.get("baseline_email") === "1";
    const result = await deliverPreferenceAlerts(req, { dryRun, baselineEmailOnly });
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /unauthorized/i.test(message) ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
