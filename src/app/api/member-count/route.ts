import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const client = await clerkClient();
    const totalMembers = await client.users.getCount();
    return NextResponse.json(
      { ok: true, totalMembers, generatedAt: new Date().toISOString() },
      { headers: { "Cache-Control": "public, s-maxage=60" } }
    );
  } catch (error) {
    console.error("[api/member-count] Failed to load member count:", error);
    return NextResponse.json(
      { ok: false, totalMembers: null, error: "Member count temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store, max-age=0" } }
    );
  }
}
