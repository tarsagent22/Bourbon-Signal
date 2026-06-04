import { NextRequest, NextResponse } from "next/server";
import { getResendClient, ALERT_FROM, ALERT_REPLY_TO } from "@/lib/email-alerts";
import { PaidDropAlertEmail } from "@/components/emails/PaidDropAlertEmail";
import { auth, clerkClient } from "@clerk/nextjs/server";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  // Founding tester mode: allow signed-in testers to send themselves a preview alert.
  // Re-enable tier gating here for hard launch.
  const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId) || user.emailAddresses[0];
  if (!primaryEmail?.emailAddress) {
    return NextResponse.json({ error: "No email address found" }, { status: 400 });
  }

  const resend = getResendClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://bourbonsignal.com";
  const payload = await req.json().catch(() => ({}));

  const bottleName = typeof payload.bottleName === "string" ? payload.bottleName : "Blanton's Original Single Barrel";
  const storeLabel = typeof payload.storeLabel === "string" ? payload.storeLabel : "ABC Store 112, Charlotte";
  const matchedArea = typeof payload.matchedArea === "string" ? payload.matchedArea : "Charlotte";
  const state = typeof payload.state === "string" ? payload.state : "NC";
  const timestampLabel = typeof payload.timestampLabel === "string" ? payload.timestampLabel : "just now";
  const quantityLabel = typeof payload.quantityLabel === "string" ? payload.quantityLabel : "6 bottles reported";

  const result = await resend.emails.send({
    from: ALERT_FROM,
    to: [primaryEmail.emailAddress],
    replyTo: ALERT_REPLY_TO,
    subject: `${bottleName} just hit ${storeLabel}`,
    react: PaidDropAlertEmail({
      firstName: user.firstName,
      bottleName,
      storeLabel,
      matchedArea,
      state,
      timestampLabel,
      quantityLabel,
      dashboardUrl: `${appUrl}/dashboard`,
    }),
    headers: {
      "X-Entity-Ref-ID": `preview-${userId}-${Date.now()}`,
    },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.data?.id || null });
}
