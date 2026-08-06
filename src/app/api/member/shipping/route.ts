import { auth, clerkClient } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { memberShippingEligibility, normalizeFounderShippingSubmission } from "@/lib/founder-shipping";
import {
  attachFounderNumberToShippingProfile,
  FounderShippingLockedError,
  readFounderShippingForUser,
  saveFounderShippingSubmission,
} from "@/lib/founder-shipping-repository";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const fetchCache = "force-no-store";

function primaryEmail(user: { emailAddresses?: Array<{ id?: string; emailAddress?: string }>; primaryEmailAddressId?: string | null }) {
  const emails = user.emailAddresses || [];
  return (emails.find((email) => email.id === user.primaryEmailAddressId) || emails[0])?.emailAddress?.trim().toLowerCase() || "";
}

function memberShippingView(record: Awaited<ReturnType<typeof readFounderShippingForUser>>) {
  if (!record) return null;
  return {
    recipientName: record.recipientName,
    addressLine1: record.addressLine1,
    addressLine2: record.addressLine2,
    city: record.city,
    stateCode: record.stateCode,
    postalCode: record.postalCode,
    phone: record.phone,
    status: record.status,
    trackingNumber: record.trackingNumber,
  };
}

async function paidMemberContext() {
  const { userId } = await auth();
  if (!userId) return { error: NextResponse.json({ error: "Account required" }, { status: 401 }) } as const;

  const client = await clerkClient();
  const user = await client.users.getUser(userId);
  const eligibility = memberShippingEligibility(user.publicMetadata);
  if (!eligibility.eligible) {
    return { error: NextResponse.json({ error: "Paid membership required" }, { status: 403 }) } as const;
  }

  const accountEmail = primaryEmail(user);
  if (!accountEmail) {
    return { error: NextResponse.json({ error: "Account email is unavailable" }, { status: 409 }) } as const;
  }

  return { userId, user, eligibility, accountEmail } as const;
}

export async function GET() {
  const context = await paidMemberContext();
  if ("error" in context) return context.error;

  if (context.eligibility.founderNumber) {
    await attachFounderNumberToShippingProfile(context.userId, context.eligibility.founderNumber);
  }
  const record = await readFounderShippingForUser(context.userId);
  return NextResponse.json(
    {
      record: memberShippingView(record),
      defaultRecipientName: `${context.user.firstName || ""} ${context.user.lastName || ""}`.trim(),
    },
    { headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function POST(request: Request) {
  const context = await paidMemberContext();
  if ("error" in context) return context.error;

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Invalid shipping information" }, { status: 400 });
  }

  const normalized = normalizeFounderShippingSubmission(body as Record<string, unknown>);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400 });

  try {
    const record = await saveFounderShippingSubmission({
      userId: context.userId,
      founderNumber: context.eligibility.founderNumber,
      accountEmail: context.accountEmail,
      submission: normalized.value,
    });
    return NextResponse.json(
      { record: memberShippingView(record) },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    if (error instanceof FounderShippingLockedError) {
      return NextResponse.json({ error: "This shipment is already being fulfilled, so its address is locked." }, { status: 409 });
    }
    throw error;
  }
}
