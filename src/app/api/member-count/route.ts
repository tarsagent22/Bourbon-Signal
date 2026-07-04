import { clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

async function getUserCount() {
  const client = await clerkClient();
  const usersApi = client.users as unknown as {
    getUserList: (params: { limit: number; offset?: number }) => Promise<{ data?: unknown[]; totalCount?: number } | unknown[]>;
  };
  const result = await usersApi.getUserList({ limit: 1, offset: 0 });
  if (!Array.isArray(result) && typeof result.totalCount === "number") return result.totalCount;
  if (Array.isArray(result)) return result.length;
  return Array.isArray(result.data) ? result.data.length : 0;
}

export async function GET() {
  try {
    const totalMembers = await getUserCount();
    return NextResponse.json(
      { ok: true, totalMembers, generatedAt: new Date().toISOString() },
      { headers: { "cache-control": "no-store, max-age=0" } }
    );
  } catch (error) {
    console.error("[api/member-count] Failed to load member count:", error);
    return NextResponse.json(
      { ok: false, totalMembers: null, error: "Member count temporarily unavailable" },
      { status: 503, headers: { "cache-control": "no-store, max-age=0" } }
    );
  }
}
