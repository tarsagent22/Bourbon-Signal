import { clerkClient } from "@clerk/nextjs/server";
import { NextRequest, NextResponse } from "next/server";
import {
  isValidNewsletterEmail,
  normalizeNewsletterEmail,
  subscribeNewsletterContact,
  unsubscribeNewsletterContact,
  verifyNewsletterSignature,
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
  const email = normalizeNewsletterEmail(String(form?.get("email") || ""));
  const signature = String(form?.get("sig") || "");
  const action: NewsletterAction = form?.get("action") === "resubscribe" ? "resubscribe" : "unsubscribe";
  if (!isValidNewsletterEmail(email) || !verifyNewsletterSignature(email, signature)) {
    return redirectResult(request, email, signature, "invalid");
  }

  try {
    if (action === "resubscribe") await subscribeNewsletterContact(email);
    else await unsubscribeNewsletterContact(email);
    await updateMemberMasterSuppression(email, action === "unsubscribe", new Date().toISOString());
    return redirectResult(request, email, signature, action === "resubscribe" ? "resubscribed" : "unsubscribed");
  } catch {
    return redirectResult(request, email, signature, "error");
  }
}
