import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  verifyWeeklyIntelligenceUnsubscribe,
  weeklyIntelligenceUnsubscribeSecret,
} from "@/lib/member-weekly-email";
import { applyWeeklyIntelligenceUnsubscribe, normalizeNotificationPreferences } from "@/lib/notification-preferences";

export const dynamic = "force-dynamic";

function redirectResult(request: NextRequest, result: "unsubscribed" | "invalid" | "error", token: {
  memberId: string;
  purpose: string;
  version: string;
  issuedAt: string;
  expiresAt: string;
  signature: string;
}) {
  const url = new URL("/weekly-intelligence/unsubscribe", request.url);
  url.searchParams.set("result", result);
  url.searchParams.set("member", token.memberId);
  url.searchParams.set("purpose", token.purpose);
  url.searchParams.set("v", token.version);
  url.searchParams.set("iat", token.issuedAt);
  url.searchParams.set("exp", token.expiresAt);
  url.searchParams.set("sig", token.signature);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const memberId = String(form?.get("member") || "").trim();
  const purpose = String(form?.get("purpose") || "").trim();
  const version = String(form?.get("v") || "").trim();
  const issuedAt = String(form?.get("iat") || "").trim();
  const expiresAt = String(form?.get("exp") || "").trim();
  const signature = String(form?.get("sig") || "").trim();
  const token = { memberId, purpose, version, issuedAt, expiresAt, signature };
  if (!verifyWeeklyIntelligenceUnsubscribe({
    memberId,
    purpose,
    version,
    issuedAt,
    expiresAt,
    signature,
    secret: weeklyIntelligenceUnsubscribeSecret(),
  })) return redirectResult(request, "invalid", token);

  try {
    const client = await clerkClient();
    const user = await client.users.getUser(memberId);
    const notificationPreferences = normalizeNotificationPreferences(user.publicMetadata?.notificationPreferences);
    const weeklyIntelligence = applyWeeklyIntelligenceUnsubscribe(
      notificationPreferences.weeklyIntelligence,
      new Date(issuedAt).toISOString(),
    );
    await client.users.updateUserMetadata(memberId, {
      publicMetadata: {
        notificationPreferences: {
          ...notificationPreferences,
          weeklyIntelligence,
        },
      },
    });
    return redirectResult(request, "unsubscribed", token);
  } catch {
    return redirectResult(request, "error", token);
  }
}
