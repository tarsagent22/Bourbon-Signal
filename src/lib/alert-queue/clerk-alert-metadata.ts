type JsonRecord = Record<string, unknown>;

export const CLERK_ALERT_DELIVERY_TARGET_BYTES = 3072;
export const CLERK_ALERT_DELIVERY_MAX_RECENT = 8;
const MAX_DEDUPE_KEY_LENGTH = 512;
const MAX_STABLE_KEYS_PER_RECORD = 8;
const MAX_STABLE_KEY_LENGTH = 512;
const MAX_PROVIDER_VALUE_LENGTH = 512;

function record(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value) ? value as JsonRecord : {};
}

function boundedString(value: unknown, max: number) {
  return typeof value === "string" && value.trim() && value.length <= max ? value.trim() : "";
}

function timestamp(value: unknown) {
  const candidate = boundedString(value, 80);
  return candidate && Number.isFinite(Date.parse(candidate)) ? candidate : "";
}

function stringList(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter((item) => item && item.length <= maxLength)))
    .slice(0, maxItems);
}

function compactRecentRecord(value: unknown): JsonRecord | null {
  const source = record(value);
  const dedupeKey = boundedString(source.dedupeKey, MAX_DEDUPE_KEY_LENGTH);
  const deliveredAt = timestamp(source.deliveredAt);
  if (!dedupeKey || !deliveredAt) return null;
  const channel = source.channel === "sms" ? "sms" : source.channel === "email" ? "email" : "";
  if (!channel) return null;
  const result: JsonRecord = { dedupeKey, deliveredAt, channel };
  const underlyingStableKeys = stringList(source.underlyingStableKeys, MAX_STABLE_KEYS_PER_RECORD, MAX_STABLE_KEY_LENGTH);
  if (underlyingStableKeys.length) result.underlyingStableKeys = underlyingStableKeys;
  const emailMode = source.emailMode === "all" ? "all" : source.emailMode === "major_only" ? "major_only" : "";
  const smsMode = source.smsMode === "specific_bottles" ? "specific_bottles" : source.smsMode === "major_only" ? "major_only" : "";
  const messageId = boundedString(source.messageId, MAX_PROVIDER_VALUE_LENGTH);
  const status = boundedString(source.status, 80);
  if (emailMode) result.emailMode = emailMode;
  if (smsMode) result.smsMode = smsMode;
  if (messageId) result.messageId = messageId;
  if (status) result.status = status;
  return result;
}

export function jsonUtf8Bytes(value: unknown) {
  return Buffer.byteLength(JSON.stringify(value), "utf8");
}

export function compactClerkAlertDelivery(input: unknown): JsonRecord {
  const source = record(input);
  const base: JsonRecord = {
    dedupeIdentityVersion: 2,
    durableBaselineVersion: 1,
    onSiteBaselineDedupeKeys: null,
    emailBaselineDedupeKeys: null,
    smsBaselineDedupeKeys: null,
  };
  for (const field of ["lastOnSiteBaselineAt", "lastEmailBaselineAt", "lastSmsBaselineAt", "lastRunAt"] as const) {
    const value = timestamp(source[field]);
    if (value) base[field] = value;
  }

  const seen = new Set<string>();
  const recent = (Array.isArray(source.recent) ? source.recent : [])
    .map(compactRecentRecord)
    .filter((item): item is JsonRecord => Boolean(item))
    .filter((item) => {
      const key = `${item.channel}:${item.dedupeKey}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, CLERK_ALERT_DELIVERY_MAX_RECENT);

  const accepted: JsonRecord[] = [];
  for (const item of recent) {
    const candidate = { ...base, recent: [...accepted, item] };
    if (jsonUtf8Bytes(candidate) > CLERK_ALERT_DELIVERY_TARGET_BYTES) continue;
    accepted.push(item);
  }
  return accepted.length ? { ...base, recent: accepted } : base;
}
