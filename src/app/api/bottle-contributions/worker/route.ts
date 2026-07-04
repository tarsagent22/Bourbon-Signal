import { NextRequest, NextResponse } from "next/server";
import { bottleContributionDigest, readBottleContributionQueue, updateBottleContribution } from "@/lib/bottle-contributions";

export async function GET(req: NextRequest) {
  const expected = process.env.BOTTLE_QUEUE_WORKER_TOKEN;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token");
  if (expected && token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!expected) return NextResponse.json({ error: "Worker token is not configured" }, { status: 503 });
  const queue = await readBottleContributionQueue();
  const digest = bottleContributionDigest(queue);
  return NextResponse.json({ ok: true, hasWork: digest.length > 0, digest });
}

export async function PATCH(req: NextRequest) {
  const expected = process.env.BOTTLE_QUEUE_WORKER_TOKEN;
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || req.nextUrl.searchParams.get("token");
  if (expected && token !== expected) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!expected) return NextResponse.json({ error: "Worker token is not configured" }, { status: 503 });
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const id = typeof payload.id === "string" ? payload.id : "";
  const status = payload.status === "needs_human" || payload.status === "matched_existing" || payload.status === "added" || payload.status === "rejected" || payload.status === "ignored" ? payload.status : null;
  if (!id || !status) return NextResponse.json({ error: "Missing id/status" }, { status: 400 });
  const contribution = await updateBottleContribution(id, {
    status,
    candidateBottleId: typeof payload.candidateBottleId === "string" ? payload.candidateBottleId : undefined,
    candidateBottleName: typeof payload.candidateBottleName === "string" ? payload.candidateBottleName : undefined,
    confidence: payload.confidence === "high" || payload.confidence === "medium" || payload.confidence === "low" ? payload.confidence : undefined,
    notes: typeof payload.notes === "string" ? payload.notes.slice(0, 1000) : undefined,
  });
  return NextResponse.json({ ok: true, contribution });
}
