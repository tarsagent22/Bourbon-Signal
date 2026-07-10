import type { AlertBaselineInput, AlertChannel } from "./repository";

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function rows(value: unknown) {
  return Array.isArray(value) ? value.map(record) : [];
}

function strings(value: unknown) {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === "string").map((item) => item.trim()).filter(Boolean)
    : [];
}

export function extractClerkAlertBaselines(
  userId: string,
  privateMetadata: unknown,
  createdAt: string,
): AlertBaselineInput[] {
  const metadata = record(privateMetadata);
  const delivery = record(metadata.alertDelivery);
  const inbox = record(metadata.alertInbox);
  const keys = new Map<string, { channel: AlertChannel; stableMatchKey: string }>();
  const add = (channel: AlertChannel, stableMatchKey: unknown) => {
    if (typeof stableMatchKey !== "string" || !stableMatchKey.trim()) return;
    const key = stableMatchKey.trim();
    keys.set(`${channel}\u001f${key}`, { channel, stableMatchKey: key });
  };

  for (const key of strings(delivery.onSiteBaselineDedupeKeys)) add("onSite", key);
  for (const key of strings(delivery.emailBaselineDedupeKeys)) add("email", key);
  for (const key of strings(delivery.smsBaselineDedupeKeys)) add("sms", key);
  for (const item of rows(delivery.recent)) {
    if (item.channel === "email" || item.channel === "sms") add(item.channel, item.dedupeKey);
  }
  for (const item of rows(inbox.recent)) add("onSite", item.dedupeKey);

  return Array.from(keys.values()).map((item) => ({
    userId,
    channel: item.channel,
    stableMatchKey: item.stableMatchKey,
    createdAt,
  }));
}
