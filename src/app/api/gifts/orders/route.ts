import { NextRequest, NextResponse } from "next/server";
import { auth, clerkClient } from "@clerk/nextjs/server";
import { normalizeGiftOrderInput } from "@/lib/gifts";
import { createGiftRepository } from "@/lib/gift-repository";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

function verifiedPrimaryEmail(user: Awaited<ReturnType<Awaited<ReturnType<typeof clerkClient>>["users"]["getUser"]>>) {
  const primary = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  return primary?.verification?.status === "verified" ? primary.emailAddress.trim().toLowerCase() : "";
}

export async function POST(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Sign in to purchase a gift." }, { status: 401, headers: PRIVATE_HEADERS });
  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const normalized = normalizeGiftOrderInput(body);
  if (!normalized.ok) return NextResponse.json({ error: normalized.error }, { status: 400, headers: PRIVATE_HEADERS });
  const purchaserRequestId = typeof body.purchaserRequestId === "string" ? body.purchaserRequestId.trim() : "";
  if (!/^[a-zA-Z0-9_-]{16,100}$/.test(purchaserRequestId)) return NextResponse.json({ error: "Invalid checkout request." }, { status: 400, headers: PRIVATE_HEADERS });
  const user = await (await clerkClient()).users.getUser(userId);
  const purchaserEmail = verifiedPrimaryEmail(user);
  if (!purchaserEmail) return NextResponse.json({ error: "A verified primary email is required." }, { status: 409, headers: PRIVATE_HEADERS });
  const order = await createGiftRepository().createPending({ purchaserRequestId, purchaserUserId: userId, purchaserEmail, order: normalized.value });
  return NextResponse.json({ orderId: order.id }, { status: 201, headers: PRIVATE_HEADERS });
}
