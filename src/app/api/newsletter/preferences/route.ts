import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  isValidNewsletterEmail,
  normalizeNewsletterEmail,
  subscribeNewsletterContact,
  unsubscribeNewsletterContact,
  verifyNewsletterPreferenceAuthorization,
  verifyNewsletterSignature,
  type NewsletterResubscribeConfirmation,
} from "@/lib/newsletter";

export const dynamic = "force-dynamic";

type NewsletterAction = "unsubscribe" | "resubscribe";

function redirectResult(request: NextRequest, email: string, signature: string, result: "unsubscribed" | "resubscribed" | "invalid" | "error") {
  const url = new URL("/unsubscribe", request.url);
  url.searchParams.set("email", email);
  url.searchParams.set("sig", signature);
  url.searchParams.set("result", result);
  const response = NextResponse.redirect(url, 303);
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

async function updateMemberMasterSuppression(email: string, suppressed: boolean, now: string) {
  const client = await clerkClient();
  const page = await client.users.getUserList({ emailAddress: [email], limit: 100, orderBy: "+created_at" });
  for (const user of page.data.sort((left, right) => left.id.localeCompare(right.id))) {
    const privateMetadata = user.privateMetadata as Record<string, unknown>;
    const existing = privateMetadata.emailSuppression && typeof privateMetadata.emailSuppression === "object"
      ? privateMetadata.emailSuppression as Record<string, unknown>
      : {};
    const existingSuppressedAt = typeof existing.suppressedAt === "string" ? existing.suppressedAt : null;
    await client.users.updateUserMetadata(user.id, {
      privateMetadata: {
        emailSuppression: {
          suppressed,
          suppressedAt: suppressed ? existingSuppressedAt || now : null,
          source: "newsletter_preference_post",
        },
      },
    });
  }
}

export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const oneClick = String(form?.get("List-Unsubscribe") || "") === "One-Click";
  const email = normalizeNewsletterEmail(String(form?.get("email") || (oneClick ? request.nextUrl.searchParams.get("email") : "") || ""));
  const signature = String(form?.get("sig") || (oneClick ? request.nextUrl.searchParams.get("sig") : "") || "");
  const action: NewsletterAction = oneClick ? "unsubscribe" : form?.get("action") === "resubscribe" ? "resubscribe" : "unsubscribe";
  const confirmation: NewsletterResubscribeConfirmation = {
    purpose: String(form?.get("confirmationPurpose") || "") as NewsletterResubscribeConfirmation["purpose"],
    version: String(form?.get("confirmationVersion") || "") as NewsletterResubscribeConfirmation["version"],
    action: String(form?.get("confirmationAction") || "") as NewsletterResubscribeConfirmation["action"],
    issuedAt: String(form?.get("confirmationIssuedAt") || ""),
    expiresAt: String(form?.get("confirmationExpiresAt") || ""),
    signature: String(form?.get("confirmationSignature") || ""),
  };
  const authorized = action === "unsubscribe"
    ? verifyNewsletterSignature(email, signature)
    : verifyNewsletterPreferenceAuthorization({ action, email, unsubscribeSignature: signature, confirmation });
  if (!isValidNewsletterEmail(email) || !authorized) {
    if (oneClick) return new NextResponse(null, { status: 400, headers: { "Cache-Control": "private, no-store" } });
    return redirectResult(request, email, signature, "invalid");
  }

  try {
    if (action === "resubscribe") await subscribeNewsletterContact(email);
    else await unsubscribeNewsletterContact(email);
    await updateMemberMasterSuppression(email, action === "unsubscribe", new Date().toISOString());
    if (oneClick) return new NextResponse(null, { status: 204, headers: { "Cache-Control": "private, no-store" } });
    return redirectResult(request, email, signature, action === "resubscribe" ? "resubscribed" : "unsubscribed");
  } catch {
    if (oneClick) return new NextResponse(null, { status: 500, headers: { "Cache-Control": "private, no-store" } });
    return redirectResult(request, email, signature, "error");
  }
}
