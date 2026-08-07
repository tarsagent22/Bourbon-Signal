import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { FounderGlassShippedEmail } from "@/components/emails/FounderGlassShippedEmail";
import { ALERT_REPLY_TO, getResendClient } from "@/lib/email-alerts";
import { founderShippingTrackingUrl } from "@/lib/founder-shipping";
import {
  claimFounderShipmentNotification,
  markFounderShipmentNotificationSent,
  releaseFounderShipmentNotification,
  type FounderShippingRecord,
} from "@/lib/founder-shipping-repository";

const FOUNDER_SHIPPING_FROM = "Bourbon Signal <members@bourbonsignal.com>";

function shipmentIdempotencyKey(record: FounderShippingRecord) {
  return `founder-glass-shipped-${createHash("sha256")
    .update(`${record.userId}:${record.shippedAt}:${record.carrier}:${record.trackingNumber}`)
    .digest("hex")}`;
}

export async function sendFounderShipmentNotification(record: FounderShippingRecord, recipientEmail: string) {
  if (record.status !== "shipped" || record.shipmentNotificationSentAt) return { sent: false, reason: "not_due" } as const;
  if (!record.shippedAt || !record.carrier || !record.trackingNumber) throw new Error("A shipped founder glass requires carrier and tracking information.");
  const currentPrimaryEmail = recipientEmail.trim().toLowerCase();
  if (!currentPrimaryEmail) throw new Error("The member's current primary email is unavailable in Clerk.");
  const trackingUrl = founderShippingTrackingUrl(record.carrier, record.trackingNumber);
  if (!trackingUrl) throw new Error("The founder glass carrier is not supported for tracking.");

  const idempotencyKey = record.shipmentNotificationIdempotencyKey || shipmentIdempotencyKey(record);
  const claimToken = randomUUID();
  const claimed = await claimFounderShipmentNotification({
    userId: record.userId,
    shippedAt: record.shippedAt,
    carrier: record.carrier,
    trackingNumber: record.trackingNumber,
    claimToken,
    idempotencyKey,
  });
  if (!claimed) return { sent: false, reason: "not_due" } as const;

  try {
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com";
    const result = await getResendClient().emails.send({
      from: FOUNDER_SHIPPING_FROM,
      to: [currentPrimaryEmail],
      replyTo: ALERT_REPLY_TO,
      subject: "Your Bourbon Signal founder glass has shipped",
      react: FounderGlassShippedEmail({
        recipientName: claimed.recipientName,
        carrier: claimed.carrier!,
        trackingNumber: claimed.trackingNumber!,
        trackingUrl,
        accountUrl: new URL("/settings#shipping", baseUrl).toString(),
      }),
      headers: { "X-Entity-Ref-ID": idempotencyKey },
    }, { idempotencyKey });
    if (result.error) throw new Error(result.error.message);
    const messageId = result.data?.id || idempotencyKey;
    const marked = await markFounderShipmentNotificationSent(record.userId, claimToken, messageId);
    if (!marked) throw new Error("The shipment changed before its notification could be finalized.");
    return { sent: true, messageId } as const;
  } catch (error) {
    try {
      await releaseFounderShipmentNotification(record.userId, claimToken);
    } catch (releaseError) {
      console.error("Founder shipment notification claim release failed", releaseError);
    }
    throw error;
  }
}
