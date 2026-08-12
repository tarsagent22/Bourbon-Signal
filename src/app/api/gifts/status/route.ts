import { NextRequest, NextResponse } from "next/server";
import { auth } from "@clerk/nextjs/server";
import { createGiftRepository } from "@/lib/gift-repository";

export const dynamic = "force-dynamic";
const PRIVATE_HEADERS = { "Cache-Control": "private, no-store" };

export async function GET(request: NextRequest) {
  const { userId } = await auth();
  if (!userId) return NextResponse.json({ error: "Account required." }, { status: 401, headers: PRIVATE_HEADERS });
  const orderId = request.nextUrl.searchParams.get("order")?.trim() || "";
  const order = await createGiftRepository().readForPurchaser(orderId, userId);
  if (!order) return NextResponse.json({ error: "Gift order not found." }, { status: 404, headers: PRIVATE_HEADERS });
  return NextResponse.json({
    id: order.id, plan: order.giftPlan, recipientName: order.recipientName,
    paymentStatus: order.paymentStatus, deliveryStatus: order.deliveryStatus,
    deliveryMode: order.deliveryMode, scheduledDeliveryAt: order.scheduledDeliveryAt,
    redeemedAt: order.redeemedAt, createdAt: order.createdAt,
  }, { headers: PRIVATE_HEADERS });
}
