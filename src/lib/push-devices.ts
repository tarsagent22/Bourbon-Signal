export type PushPlatform = "ios" | "android";

export interface PushDeviceRecord {
  deviceId: string;
  expoPushToken: string;
  platform: PushPlatform;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ExpoPushMessage {
  to: string;
  sound: "default";
  title: string;
  body: string;
  data: { screen: "radar"; alertId: string };
  priority: "high";
}

const MAX_PUSH_DEVICES = 8;
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export function validExpoPushToken(value: string) {
  return /^(ExponentPushToken|ExpoPushToken)\[[^\]]{8,256}\]$/.test(value.trim());
}

export function normalizePushDevices(input: unknown): PushDeviceRecord[] {
  const rows = Array.isArray(input) ? input : [];
  const unique = new Map<string, PushDeviceRecord>();
  for (const raw of rows) {
    const item = asRecord(raw);
    if (!item) continue;
    const deviceId = typeof item.deviceId === "string" ? item.deviceId.trim().slice(0, 120) : "";
    const expoPushToken = typeof item.expoPushToken === "string" ? item.expoPushToken.trim() : "";
    const platform: PushPlatform | null = item.platform === "ios" || item.platform === "android" ? item.platform : null;
    if (!deviceId || !platform || !validExpoPushToken(expoPushToken)) continue;
    const updatedAt = typeof item.updatedAt === "string" && Number.isFinite(Date.parse(item.updatedAt)) ? item.updatedAt : new Date(0).toISOString();
    const createdAt = typeof item.createdAt === "string" && Number.isFinite(Date.parse(item.createdAt)) ? item.createdAt : updatedAt;
    const next = { deviceId, expoPushToken, platform, enabled: item.enabled !== false, createdAt, updatedAt };
    const existing = unique.get(deviceId);
    if (!existing || Date.parse(next.updatedAt) >= Date.parse(existing.updatedAt)) unique.set(deviceId, next);
  }
  return [...unique.values()].sort((left, right) => Date.parse(right.updatedAt) - Date.parse(left.updatedAt)).slice(0, MAX_PUSH_DEVICES);
}

export function registerPushDevice(input: unknown, device: { deviceId: string; expoPushToken: string; platform: PushPlatform }, now: string) {
  const deviceId = device.deviceId.trim().slice(0, 120);
  const expoPushToken = device.expoPushToken.trim();
  if (!deviceId || !validExpoPushToken(expoPushToken)) throw new Error("Invalid push device registration.");
  const existing = normalizePushDevices(input);
  const previous = existing.find((row) => row.deviceId === deviceId);
  return normalizePushDevices([{ deviceId, expoPushToken, platform: device.platform, enabled: true, createdAt: previous?.createdAt || now, updatedAt: now }, ...existing.filter((row) => row.deviceId !== deviceId && row.expoPushToken !== expoPushToken)]);
}

export function disablePushDevice(input: unknown, deviceId: string, now: string) {
  const target = deviceId.trim();
  return normalizePushDevices(input).map((device) => device.deviceId === target ? { ...device, enabled: false, updatedAt: now } : device);
}

export function enabledPushTokens(input: unknown) {
  return normalizePushDevices(input).filter((device) => device.enabled).map((device) => device.expoPushToken);
}

export function pushPreferenceProjectionAllowsDelivery(input: unknown) {
  const projection = asRecord(input);
  return projection?.status !== "pending";
}

export function buildExpoPushMessages(tokens: string[], alert: { id: string; bottleName: string; storeLabel: string; matchedArea: string }): ExpoPushMessage[] {
  const location = alert.storeLabel || alert.matchedArea || "your monitored market";
  return Array.from(new Set(tokens.filter(validExpoPushToken))).map((to) => ({
    to,
    sound: "default",
    title: alert.bottleName || "New Bourbon Signal match",
    body: `Matched at ${location}. Open Radar for details.`,
    data: { screen: "radar", alertId: alert.id },
    priority: "high",
  }));
}

export async function sendExpoPushMessages(messages: ExpoPushMessage[], fetcher: typeof fetch = fetch) {
  if (!messages.length) return { accepted: 0, rejected: 0 };
  let accepted = 0;
  let rejected = 0;
  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    const response = await fetcher(EXPO_PUSH_ENDPOINT, {
      method: "POST",
      headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify(chunk),
    });
    if (!response.ok) throw new Error(`Expo push request failed (${response.status}).`);
    const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ status?: string }> };
    const tickets = Array.isArray(payload.data) ? payload.data : [];
    const chunkAccepted = tickets.filter((ticket) => ticket.status === "ok").length;
    accepted += chunkAccepted;
    rejected += chunk.length - chunkAccepted;
  }
  return { accepted, rejected };
}
