import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { ALERT_FROM, ALERT_REPLY_TO, getResendClient } from "@/lib/email-alerts";

export const dynamic = "force-dynamic";

const FEEDBACK_TO = "support@bourbonsignal.com";
const MAX_SCREENSHOT_BYTES = 8 * 1024 * 1024;
const ALLOWED_SCREENSHOT_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

type FeedbackField = "tryingToDo" | "workedWell" | "confusingOrBroken" | "deviceBrowser";

const FIELD_LABELS: Record<FeedbackField, string> = {
  tryingToDo: "What were you trying to do?",
  workedWell: "What worked well?",
  confusingOrBroken: "What was confusing or broken?",
  deviceBrowser: "What device/browser were you using?",
};

function asText(value: FormDataEntryValue | null, maxLength = 4000) {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function renderBlock(label: string, value: string) {
  return `
    <tr>
      <td style="padding:18px 0;border-bottom:1px solid #eadbc3;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.12em;text-transform:uppercase;color:#9b671d;font-weight:700;margin-bottom:8px;">${escapeHtml(label)}</div>
        <div style="font-family:Georgia,'Times New Roman',serif;font-size:16px;line-height:1.6;color:#24170d;white-space:pre-wrap;">${escapeHtml(value || "—")}</div>
      </td>
    </tr>`;
}

function renderFeedbackEmail(fields: Record<FeedbackField, string>, meta: Record<string, string>) {
  return `<!doctype html>
<html>
  <body style="margin:0;padding:24px 10px;background:#f7efe2;color:#24170d;">
    <div style="max-width:680px;margin:0 auto;background:#fff8ec;border:1px solid #d3b98e;border-radius:18px;overflow:hidden;">
      <div style="padding:26px 24px 22px;background:#fff3dc;border-bottom:1px solid #d3b98e;">
        <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:0.22em;text-transform:uppercase;color:#9b671d;font-weight:700;">Bourbon Signal Tester Feedback</div>
        <h1 style="font-family:Georgia,'Times New Roman',serif;font-size:32px;line-height:1.15;color:#9b671d;margin:12px 0 0;">New site feedback</h1>
      </div>
      <div style="padding:24px;background:#fffaf1;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
          <tbody>
            ${renderBlock(FIELD_LABELS.tryingToDo, fields.tryingToDo)}
            ${renderBlock(FIELD_LABELS.workedWell, fields.workedWell)}
            ${renderBlock(FIELD_LABELS.confusingOrBroken, fields.confusingOrBroken)}
            ${renderBlock(FIELD_LABELS.deviceBrowser, fields.deviceBrowser)}
            ${renderBlock("Captured context", Object.entries(meta).map(([key, value]) => `${key}: ${value || "—"}`).join("\n"))}
          </tbody>
        </table>
      </div>
    </div>
  </body>
</html>`;
}

function renderTextFeedback(fields: Record<FeedbackField, string>, meta: Record<string, string>) {
  const lines = [
    "New Bourbon Signal tester feedback",
    "",
    ...Object.entries(FIELD_LABELS).flatMap(([key, label]) => [label, fields[key as FeedbackField] || "—", ""]),
    "Captured context",
    ...Object.entries(meta).map(([key, value]) => `${key}: ${value || "—"}`),
  ];
  return lines.join("\n");
}

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Invalid feedback submission." }, { status: 400 });

  const fields: Record<FeedbackField, string> = {
    tryingToDo: asText(form.get("tryingToDo")),
    workedWell: asText(form.get("workedWell")),
    confusingOrBroken: asText(form.get("confusingOrBroken")),
    deviceBrowser: asText(form.get("deviceBrowser"), 1200),
  };

  if (!fields.tryingToDo && !fields.workedWell && !fields.confusingOrBroken) {
    return NextResponse.json({ error: "Please include at least one piece of feedback." }, { status: 400 });
  }

  const { userId } = await auth();
  let userEmail = asText(form.get("email"), 320);
  let userName = "";

  if (userId) {
    try {
      const client = await clerkClient();
      const user = await client.users.getUser(userId);
      const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId) || user.emailAddresses[0];
      userEmail = primaryEmail?.emailAddress || userEmail;
      userName = [user.firstName, user.lastName].filter(Boolean).join(" ");
    } catch {
      // Keep form-provided metadata if Clerk lookup fails.
    }
  }

  const meta: Record<string, string> = {
    userName,
    userEmail,
    userId: userId || "",
    pageUrl: asText(form.get("pageUrl"), 1000),
    referrer: asText(form.get("referrer"), 1000),
    userAgent: asText(form.get("userAgent"), 1000),
    viewport: asText(form.get("viewport"), 100),
    submittedAt: new Date().toISOString(),
  };

  const screenshot = form.get("screenshot");
  const attachments: Array<{ filename: string; content: string; contentType?: string }> = [];
  if (screenshot instanceof File && screenshot.size > 0) {
    if (screenshot.size > MAX_SCREENSHOT_BYTES) {
      return NextResponse.json({ error: "Screenshot is too large. Please upload an image under 8 MB." }, { status: 400 });
    }
    if (!ALLOWED_SCREENSHOT_TYPES.has(screenshot.type)) {
      return NextResponse.json({ error: "Screenshot must be PNG, JPG, WebP, or GIF." }, { status: 400 });
    }
    const bytes = Buffer.from(await screenshot.arrayBuffer());
    attachments.push({
      filename: screenshot.name || "feedback-screenshot",
      content: bytes.toString("base64"),
      contentType: screenshot.type,
    });
  }

  const resend = getResendClient();
  const subjectHint = fields.confusingOrBroken || fields.tryingToDo || "Tester feedback";
  const result = await resend.emails.send({
    from: ALERT_FROM,
    to: [FEEDBACK_TO],
    replyTo: userEmail || ALERT_REPLY_TO,
    subject: `Tester feedback: ${subjectHint.replace(/\s+/g, " ").slice(0, 72)}`,
    html: renderFeedbackEmail(fields, meta),
    text: renderTextFeedback(fields, meta),
    attachments,
  });

  if (result.error) {
    return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, id: result.data?.id || null });
}
