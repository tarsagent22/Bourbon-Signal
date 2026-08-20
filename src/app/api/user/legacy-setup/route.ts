import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { needsLegacySetupPrompt } from "@/lib/missing-state-community-email";

export const dynamic = "force-dynamic";
const noStore = { "Cache-Control": "private, no-store" };

function setupUser(user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>) {
  return {
    id: user.id,
    createdAt: user.createdAt,
    publicMetadata: user.publicMetadata as Record<string, unknown>,
    privateMetadata: user.privateMetadata as Record<string, unknown>,
    unsafeMetadata: user.unsafeMetadata as Record<string, unknown>,
    banned: user.banned,
    locked: user.locked,
  };
}

export async function GET() {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  return NextResponse.json({ needsSetup: needsLegacySetupPrompt(setupUser(user)) }, { headers: noStore });
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: noStore });
  const payload = await request.json().catch(() => ({})) as { action?: unknown };
  if (payload.action !== "dismiss") {
    return NextResponse.json({ error: "Unsupported setup action." }, { status: 400, headers: noStore });
  }
  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  if (!needsLegacySetupPrompt(setupUser(user))) {
    return NextResponse.json({ ok: true, needsSetup: false }, { headers: noStore });
  }
  await client.users.updateUserMetadata(userId, {
    privateMetadata: {
      legacySetupPrompt: {
        dismissedAt: new Date().toISOString(),
        source: "authenticated_prompt",
      },
    },
  });
  return NextResponse.json({ ok: true, needsSetup: false }, { headers: noStore });
}
