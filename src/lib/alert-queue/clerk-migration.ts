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
    if (item.channel === "email" || item.channel === "sms") {
      add(item.channel, item.dedupeKey);
      for (const key of strings(item.underlyingStableKeys)) add(item.channel, key);
    }
  }
  for (const item of rows(inbox.recent)) {
    add("onSite", item.dedupeKey);
    for (const key of strings(item.underlyingStableKeys)) add("onSite", key);
  }

  return Array.from(keys.values()).map((item) => ({
    userId,
    channel: item.channel,
    stableMatchKey: item.stableMatchKey,
    createdAt,
  }));
}

const baselineFieldByChannel: Record<AlertChannel, string> = {
  onSite: "onSiteBaselineDedupeKeys",
  email: "emailBaselineDedupeKeys",
  sms: "smsBaselineDedupeKeys",
};

export async function ensureAlertDeliveryIdentityV2(input: {
  userId: string;
  alertDelivery: unknown;
  enabledChannels: AlertChannel[];
  currentStableKeys: Partial<Record<AlertChannel, string[]>>;
  createdAt: string;
  baseline: (input: AlertBaselineInput) => Promise<void>;
  persist: (nextAlertDelivery: JsonRecord) => Promise<void>;
}) {
  const existing = record(input.alertDelivery);
  if (existing.dedupeIdentityVersion === 2) {
    return { migrated: false, sendCurrentPass: true } as const;
  }

  const enabledChannels = Array.from(new Set(input.enabledChannels));
  const stableKeys = new Map<AlertChannel, string[]>();
  for (const channel of enabledChannels) {
    stableKeys.set(channel, Array.from(new Set(strings(input.currentStableKeys[channel]))));
  }

  try {
    for (const channel of enabledChannels) {
      for (const stableMatchKey of stableKeys.get(channel) || []) {
        await input.baseline({ userId: input.userId, channel, stableMatchKey, createdAt: input.createdAt });
      }
    }
    const nextAlertDelivery: JsonRecord = { ...existing, dedupeIdentityVersion: 2 };
    for (const channel of enabledChannels) {
      const field = baselineFieldByChannel[channel];
      nextAlertDelivery[field] = Array.from(new Set([
        ...strings(existing[field]),
        ...(stableKeys.get(channel) || []),
      ]));
    }
    await input.persist(nextAlertDelivery);
    return { migrated: true, sendCurrentPass: false } as const;
  } catch (error) {
    return { migrated: false, sendCurrentPass: false, error } as const;
  }
}
