import { getResendClient } from "@/lib/email-alerts";
import { buildRetailerAccountNotification, type RetailerApplication } from "@/lib/retailer-portal";

export const RETAILER_NOTIFICATION_FROM = "Bourbon Signal Retailers <retailers@bourbonsignal.com>";

export async function notifyRetailerAccountCreated(input: {
  userId: string;
  email: string;
  firstName?: string | null;
  application: RetailerApplication;
}) {
  const message = buildRetailerAccountNotification(input);
  const result = await getResendClient().emails.send({
    from: RETAILER_NOTIFICATION_FROM,
    to: [message.to],
    replyTo: message.replyTo,
    subject: message.subject,
    text: message.text,
  }, { idempotencyKey: message.idempotencyKey });
  if (result.error) throw new Error(`Retailer account notification failed: ${result.error.name}`);
  return { messageId: result.data?.id || null };
}
