import * as React from "react";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { render } from "@react-email/render";
import { NextRequest, NextResponse } from "next/server";
import { MemberWeeklyIntelligenceEmail } from "@/components/emails/MemberWeeklyIntelligenceEmail";
import { buildWeeklyIntelligencePreview } from "@/lib/member-weekly-server";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = { "Cache-Control": "private, no-store", Vary: "Cookie, Authorization" };

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: PRIVATE_HEADERS });

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || req.nextUrl.origin;
  const preview = await buildWeeklyIntelligencePreview({ user, appUrl });
  const format = req.nextUrl.searchParams.get("format");

  if (format === "email") {
    if (preview.report.isEmpty) {
      return new Response("No weekly intelligence qualifies for this member week.", {
        status: 204,
        headers: { ...PRIVATE_HEADERS, "Content-Type": "text/plain; charset=utf-8" },
      });
    }
    const html = await render(React.createElement(MemberWeeklyIntelligenceEmail, {
      report: preview.report,
      unsubscribeUrl: preview.unsubscribeUrl,
      baseUrl: appUrl,
    }));
    return new Response(html, {
      status: 200,
      headers: { ...PRIVATE_HEADERS, "Content-Type": "text/html; charset=utf-8" },
    });
  }

  return NextResponse.json(preview, { headers: PRIVATE_HEADERS });
}
