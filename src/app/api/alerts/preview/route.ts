import { NextRequest, NextResponse } from "next/server";
import { getResendClient, ALERT_FROM, ALERT_REPLY_TO } from "@/lib/email-alerts";
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
  const cardUrl = new URL("/api/alerts/email-card", appUrl);
  cardUrl.searchParams.set("bottleName", bottleName);
  cardUrl.searchParams.set("storeLabel", storeLabel);
  cardUrl.searchParams.set("matchedArea", matchedArea);
  cardUrl.searchParams.set("state", state);
  cardUrl.searchParams.set("timestampLabel", timestampLabel);
  cardUrl.searchParams.set("quantityLabel", quantityLabel);
  if (user.firstName) cardUrl.searchParams.set("firstName", user.firstName);
  cardUrl.searchParams.set("v", String(Date.now()));

  const fallbackText = `${bottleName} just hit ${storeLabel}. This matched your ${matchedArea} alert area. State: ${state}. Reported: ${timestampLabel}${quantityLabel ? `. Reported qty: ${quantityLabel}` : ""}.`;
  const html = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="color-scheme" content="dark" />
    <meta name="supported-color-schemes" content="dark" />
    <title>${escapeHtml(`${bottleName} just hit ${storeLabel}`)}</title>
  </head>
  <body style="margin:0;padding:0;background:#050403;background-color:#050403;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" bgcolor="#050403" style="background:#050403;background-color:#050403;margin:0;padding:0;width:100%;">
      <tr>
        <td align="center" bgcolor="#050403" style="background:#050403;background-color:#050403;padding:16px 8px;">
          <a href="${escapeHtml(`${appUrl}/dashboard`)}" style="display:block;text-decoration:none;border:0;">
            <img src="${escapeHtml(cardUrl.toString())}" width="600" alt="${escapeHtml(fallbackText)}" style="display:block;width:100%;max-width:600px;height:auto;border:0;outline:none;text-decoration:none;border-radius:18px;" />
          </a>
          <div style="display:none;max-height:0;overflow:hidden;color:#050403;font-size:1px;line-height:1px;">
            ${escapeHtml(fallbackText)} If this looks wrong, reply and we will check it out.
          </div>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const result = await resend.emails.send({
    from: ALERT_FROM,
    to: [primaryEmail.emailAddress],
    replyTo: ALERT_REPLY_TO,
    subject: `${bottleName} just hit ${storeLabel}`,
    html,
    text: `${fallbackText}\n\nOpen member dashboard: ${appUrl}/dashboard\n\nIf this looks wrong, reply and we will check it out.`,
    headers: {
      "X-Entity-Ref-ID": `preview-${userId}-${Date.now()}`,
    },
  });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.data?.id || null });
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
