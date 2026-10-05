import { randomUUID } from "node:crypto";
import { requireOwnerApiAccess } from "@/lib/owner-auth";
import {
  listFounderShippingForOwner,
  readFounderShippingForUser,
  updateFounderShippingFulfillment,
} from "@/lib/founder-shipping-repository";
import { normalizeFounderFulfillment } from "@/lib/founder-shipping";
import { getReferralRepository } from "@/lib/referral-repository";
import { sendFounderShipmentNotification } from "@/lib/founder-shipping-notification";
import { companyMemberPrimaryEmail } from "@/lib/company-control-room";
const headers = { "Cache-Control": "private, no-store" };
export async function GET() {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  try {
    return Response.json(
      { shipments: await listFounderShippingForOwner() },
      { headers },
    );
  } catch {
    return Response.json(
      { error: "Founder shipments could not load." },
      { status: 503, headers },
    );
  }
}
export async function PATCH(request: Request) {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  if (new URL(request.url).searchParams.get("notify") === "1") {
    const body = await request.json().catch(() => ({}));
    try {
      const record = await readFounderShippingForUser(
        String(body.userId || ""),
      );
      if (
        !record ||
        record.status !== "shipped" ||
        record.updatedAt !== body.expectedUpdatedAt
      )
        return Response.json(
          {
            error:
              "Refresh the shipped record before sending its notification.",
          },
          { status: 409 },
        );
      const user = await owner.client.users.getUser(record.userId);
      const result = await sendFounderShipmentNotification(
        record,
        companyMemberPrimaryEmail(user),
      );
      return Response.json({ ok: true, result }, { headers });
    } catch {
      return Response.json(
        {
          error:
            "Shipment email could not be sent. The shipment record is saved; refresh before retrying.",
        },
        { status: 503 },
      );
    }
  }
  const body = await request.json().catch(() => ({})),
    valid = normalizeFounderFulfillment(body);
  if (!valid.ok) return Response.json({ error: valid.error }, { status: 400 });
  if (
    typeof body.userId !== "string" ||
    typeof body.expectedUpdatedAt !== "string"
  )
    return Response.json(
      { error: "Refresh the shipment first." },
      { status: 400 },
    );
  try {
    const shipment = await updateFounderShippingFulfillment({
      userId: body.userId,
      ...valid.value,
      expectedUpdatedAt: body.expectedUpdatedAt,
      notificationIdempotencyKey: `native-owner-${randomUUID()}`,
      updatedBy: owner.userId,
    });
    if (!shipment)
      return Response.json(
        { error: "Shipment changed. Refresh before saving again." },
        { status: 409 },
      );
    if (shipment.status !== "submitted")
      await getReferralRepository().updateGlassFulfillment(
        shipment.userId,
        shipment.status === "confirmed" ? "address_confirmed" : shipment.status,
      );
    return Response.json({ ok: true, shipment }, { headers });
  } catch {
    return Response.json(
      {
        error:
          "Shipment could not be saved. Refresh to check its current state.",
      },
      { status: 503 },
    );
  }
}
