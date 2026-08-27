import { randomUUID } from "node:crypto";

export type FounderShipmentNotificationKind = "shipment" | "correction";

export function founderShipmentCorrectionIdempotencyKey() {
  return `founder-glass-corrected-${randomUUID()}`;
}

export function founderShipmentNotificationKind(idempotencyKey: string): FounderShipmentNotificationKind {
  return idempotencyKey.startsWith("founder-glass-corrected-") ? "correction" : "shipment";
}

export function founderShipmentEmailCopy(kind: FounderShipmentNotificationKind) {
  if (kind === "correction") {
    return {
      subject: "Updated tracking information for your Founder glass",
      preview: "Updated tracking information for your Founder glass.",
      headline: "Updated tracking information",
      introduction: "We apologize for the confusion. The tracking information in our previous email was incorrect. The tracking number below is your updated tracking number.",
    } as const;
  }
  return {
    subject: "Your Bourbon Signal founder glass has shipped",
    preview: "Your founder glass is on the way.",
    headline: "Your founder glass is on the way",
    introduction: "Your Bourbon Signal founder glass has shipped.",
  } as const;
}
