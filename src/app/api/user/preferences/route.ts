import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";

export interface AreaPreferences {
  states: string[];       // ["NC", "VA", "PA"]
  ncBoards: string[];     // ["Wake", "Durham", "Mecklenburg"] — empty = all
  vaCities: string[];     // ["Richmond", "Roanoke"] — empty = all
  paCounties: string[];   // ["Allegheny", "Philadelphia"] — empty = all
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const prefs = (user.publicMetadata?.areaPreferences as AreaPreferences) || {
    states: [], ncBoards: [], vaCities: [], paCounties: [],
  };
  return NextResponse.json(prefs);
}

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const prefs: AreaPreferences = await req.json();
  const client = await clerkClient();
  await client.users.updateUserMetadata(userId, {
    publicMetadata: { areaPreferences: prefs },
  });
  return NextResponse.json({ ok: true });
}
