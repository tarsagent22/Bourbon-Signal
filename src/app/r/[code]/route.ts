import { NextRequest, NextResponse } from "next/server";
import { normalizeReferralCode } from "@/lib/referrals";

export function GET(req: NextRequest, context: { params: Promise<{ code: string }> }) {
  return context.params.then(({ code: rawCode }) => {
    const code = normalizeReferralCode(rawCode);
    const destination = new URL(code ? `/sign-up?ref=${encodeURIComponent(code)}` : "/sign-up", req.url);
    return NextResponse.redirect(destination, 302);
  });
}
