import "server-only";
import { timingSafeEqual } from "node:crypto";
import { GiftDeliveryEmail } from "@/components/emails/GiftDeliveryEmail";
import { ALERT_REPLY_TO, getResendClient } from "@/lib/email-alerts";
import { GIFT_PLANS } from "@/lib/gifts";
import { createGiftRepository, giftRedemptionToken, releaseGiftDeliveryClaim } from "@/lib/gift-repository";
import { resolveGiftDeliveryMode } from "@/lib/gift-delivery-policy";

export { resolveGiftDeliveryMode } from "@/lib/gift-delivery-policy";

const GIFT_FROM = "Bourbon Signal Gifts <gifts@bourbonsignal.com>";

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export function assertGiftDeliveryAuthorized(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const expected = [env.GIFT_DELIVERY_SECRET, env.CRON_SECRET].map((value) => value?.trim() || "").filter(Boolean);
  const authorization = request.headers.get("authorization") || "";
  const supplied = authorization.startsWith("Bearer ")
    ? authorization.slice("Bearer ".length).trim()
    : request.headers.get("x-gift-delivery-secret")?.trim() || "";
  if (!expected.length || !supplied || !expected.some((secret) => safeEqual(secret, supplied))) throw new Error("Unauthorized gift delivery request");
}

export async function runGiftDelivery(input: { requestLive: boolean; env?: NodeJS.ProcessEnv; limit?: number }) {
  const env = input.env || process.env;
  const mode = resolveGiftDeliveryMode(input.requestLive, env);
  const repository = createGiftRepository();
  const summary = { ok: mode !== "blocked", mode, due: 0, wouldSend: 0, sent: 0, errors: 0 };
  if (mode === "blocked") return summary;
  if (mode === "dry_run") {
    const due = await repository.listDueDeliveryPreview(input.limit || 25);
    summary.due = due.length;
    summary.wouldSend = due.length;
    return summary;
  }
  const claimed = await repository.claimDueDeliveries(input.limit || 25);
  summary.due = claimed.length;
  for (const order of claimed) {
    const claim = order.deliveryClaimToken;
    if (!claim || !order.deliveryIdempotencyKey) continue;
    try {
      const authorizedOrder = await repository.authorizeDeliverySend(order.id, claim);
      if (!authorizedOrder) {
        await repository.suppressUnauthorizedDeliveryClaim(order.id, claim);
        continue;
      }
      // Provider acceptance and the database completion record cannot be atomic. The durable
      // idempotency key plus the fenced `sending` transition is the strongest safe handoff: a
      // retry reuses the same provider key, while any adverse race prevents local completion.
      const plan = GIFT_PLANS[authorizedOrder.giftPlan];
      const baseUrl = (env.NEXT_PUBLIC_APP_URL || "https://www.bourbonsignal.com").replace(/\/$/, "");
      if (!authorizedOrder.redemptionTokenKeyVersion) throw new Error("Gift redemption key version is missing.");
      const redemptionUrl = `${baseUrl}/gift/redeem/${encodeURIComponent(giftRedemptionToken(authorizedOrder.id, env, authorizedOrder.redemptionTokenKeyVersion))}`;
      const result = await getResendClient().emails.send({
        from: GIFT_FROM,
        to: [authorizedOrder.recipientEmail],
        replyTo: ALERT_REPLY_TO,
        subject: `${authorizedOrder.purchaserName || "Someone"} sent you ${plan.label}`,
        react: GiftDeliveryEmail({
          recipientName: authorizedOrder.recipientName,
          purchaserName: authorizedOrder.purchaserName || "Someone special",
          planLabel: plan.label,
          message: authorizedOrder.message,
          redemptionUrl,
          annual: plan.access === "annual",
          founderNumber: authorizedOrder.founderNumber,
        }),
        headers: { "X-Entity-Ref-ID": authorizedOrder.deliveryIdempotencyKey! },
      }, { idempotencyKey: authorizedOrder.deliveryIdempotencyKey! });
      if (result.error) throw new Error(result.error.message);
      const recorded = await repository.markDelivered(order.id, claim, result.data?.id || authorizedOrder.deliveryIdempotencyKey!);
      if (!recorded) {
        await repository.suppressUnauthorizedDeliveryClaim(order.id, claim);
        throw new Error("Gift delivery became unauthorized before completion.");
      }
      summary.sent += 1;
    } catch {
      await releaseGiftDeliveryClaim(order.id, claim).catch(() => undefined);
      summary.errors += 1;
    }
  }
  summary.ok = summary.errors === 0;
  return summary;
}
