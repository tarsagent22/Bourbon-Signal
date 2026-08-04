import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function validTimeZone(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 80) return "";
  const timeZone = value.trim();
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format(new Date());
    return timeZone;
  } catch {
    return "";
  }
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });
  const body = await request.json().catch(() => null) as { timeZone?: unknown } | null;
  const timeZone = validTimeZone(body?.timeZone);
  if (!timeZone) return NextResponse.json({ ok: false, error: "Invalid timezone" }, { status: 400, headers: PRIVATE_HEADERS });
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, { privateMetadata: { lifecycleTimeZone: timeZone } });
  return NextResponse.json({ ok: true }, { headers: PRIVATE_HEADERS });
}
