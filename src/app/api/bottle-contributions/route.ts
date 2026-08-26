import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { addBottleContribution } from "@/lib/bottle-contributions";
import { validBottleContributionIdempotencyKey } from "@/lib/bottle-contribution-idempotency";

function primaryEmail(user: { emailAddresses?: unknown[]; primaryEmailAddressId?: unknown }) {
  const emails = Array.isArray(user.emailAddresses) ? user.emailAddresses as Array<Record<string, unknown>> : [];
  const primaryId = typeof user.primaryEmailAddressId === "string" ? user.primaryEmailAddressId : "";
  const primary = emails.find((email) => email.id === primaryId) || emails[0];
  return typeof primary?.emailAddress === "string" ? primary.emailAddress : "";
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const rawIdempotencyKey = req.headers.get("Idempotency-Key");
  const idempotencyKey = validBottleContributionIdempotencyKey(rawIdempotencyKey);
  if (rawIdempotencyKey && !idempotencyKey) return NextResponse.json({ error: "Invalid Idempotency-Key" }, { status: 400 });
  const payload = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const rawName = typeof payload.rawName === "string" ? payload.rawName : typeof payload.bottleName === "string" ? payload.bottleName : "";
  const source = payload.source === "collection" || payload.source === "sighting" || payload.source === "bottle_check" ? payload.source : "bottle_check";
  const context = payload.context && typeof payload.context === "object" ? payload.context as Record<string, unknown> : {};
  if (!rawName.trim()) return NextResponse.json({ error: "Bottle name is required" }, { status: 400 });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const contribution = await addBottleContribution({ rawName, source, userId, userEmail: primaryEmail(user), context, idempotencyKey: idempotencyKey || undefined });
  return NextResponse.json({ ok: true, contribution });
}
