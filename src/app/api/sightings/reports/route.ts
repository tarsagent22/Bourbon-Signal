import { randomUUID } from "node:crypto";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import { withMemberAlertLease } from "@/lib/alert-queue/member-lease";
import type { SignalReport } from "@/lib/sightings";

const MAX_REPORTS = 250;
const allowedFields = new Set(["signalId", "bottleName", "storeName", "storeAddress", "state", "kind"]);

function reportFields(input: unknown): Omit<SignalReport, "id" | "createdAt"> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const row = input as Record<string, unknown>;
  if (Object.keys(row).some((key) => !allowedFields.has(key))) return null;
  if (row.kind !== "seen" && row.kind !== "not_seen") return null;
  for (const [key, max] of [["signalId", 260], ["bottleName", 140], ["storeName", 180], ["storeAddress", 220], ["state", 2]] as const) {
    const value = row[key];
    if (value === undefined && key !== "signalId" && key !== "bottleName") continue;
    if (typeof value !== "string" || value.length > max || /[\u0000-\u001f\u007f]/.test(value)) return null;
    if ((key === "signalId" || key === "bottleName") && !value.trim()) return null;
  }
  if (row.state !== undefined && !/^[A-Z]{2}$/.test(row.state as string)) return null;
  return {
    signalId: row.signalId as string,
    bottleName: (row.bottleName as string).trim(),
    kind: row.kind,
    ...(row.storeName !== undefined ? { storeName: row.storeName as string } : {}),
    ...(row.storeAddress !== undefined ? { storeAddress: row.storeAddress as string } : {}),
    ...(row.state !== undefined ? { state: row.state as string } : {}),
  };
}

// Personal Seen / Not seen feedback only. This never creates a canonical
// sighting, casts a community vote, or grants any reward/verification authority.
export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.text();
  if (body.length > 4_096) return NextResponse.json({ error: "Report is too large." }, { status: 413 });
  let payload: unknown;
  try { payload = JSON.parse(body); } catch { return NextResponse.json({ error: "Invalid report." }, { status: 400 }); }
  const fields = reportFields(payload);
  if (!fields) return NextResponse.json({ error: "Invalid report." }, { status: 400 });

  try {
    const lease = await withMemberAlertLease(userId, async (assertHeld) => {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const prefs = user.publicMetadata?.sightingsPreferences as Record<string, unknown> | undefined;
      // Bound both retained history and validation work. Preserve valid existing
      // reports, but never copy caller-supplied sightings/votes into metadata.
      const existing = Array.isArray(prefs?.signalReports) ? prefs.signalReports.slice(0, MAX_REPORTS) : [];
      const seen = new Set([fields.signalId]);
      const retained: SignalReport[] = [];
      for (const item of existing) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const { id, createdAt, ...previousFields } = item as Record<string, unknown>;
        const previous = reportFields(previousFields);
        if (!previous || typeof id !== "string" || id.length > 120 || typeof createdAt !== "string"
          || createdAt.length > 40 || !Number.isFinite(Date.parse(createdAt)) || seen.has(previous.signalId)) continue;
        seen.add(previous.signalId);
        retained.push({ ...previous, id, createdAt });
      }
      const report: SignalReport = { ...fields, id: `report_${randomUUID()}`, createdAt: new Date().toISOString() };
      const signalReports = [report, ...retained].slice(0, MAX_REPORTS);
      await assertHeld();
      // Clerk recursively merges metadata. Write only this leaf: canonical
      // submittedSightings, sightingVotes and unrelated preferences stay intact.
      await client.users.updateUserMetadata(userId, { publicMetadata: { sightingsPreferences: { signalReports } } });
      return NextResponse.json({ ok: true, signalReports });
    }, { requireDurable: true });
    if (lease.acquired) return lease.result;
  } catch {
    // No unlocked fallback when storage or the shared member lease is unavailable.
  }
  return NextResponse.json({ error: "Unable to save report. Please retry." }, { status: 503 });
}
