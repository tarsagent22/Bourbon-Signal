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

export interface PendingExpoPushTicket {
  id: string;
  token: string;
  createdAt: string;
}

const MAX_PUSH_DEVICES = 8;
const MAX_PENDING_PUSH_TICKETS = 200;
const MAX_PENDING_PUSH_TICKET_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const EXPO_PUSH_ENDPOINT = "https://exp.host/--/api/v2/push/send";
const EXPO_PUSH_RECEIPTS_ENDPOINT = "https://exp.host/--/api/v2/push/getReceipts";

function asRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function expoHeaders() {
  const headers: Record<string, string> = { Accept: "application/json", "Content-Type": "application/json" };
  if (process.env.EXPO_ACCESS_TOKEN) headers.Authorization = `Bearer ${process.env.EXPO_ACCESS_TOKEN}`;
  return headers;
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

export function disablePushTokens(input: unknown, tokens: string[], now: string) {
  const invalid = new Set(tokens.filter(validExpoPushToken));
  return normalizePushDevices(input).map((device) => invalid.has(device.expoPushToken) ? { ...device, enabled: false, updatedAt: now } : device);
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
  if (!messages.length) return { accepted: 0, rejected: 0, tickets: [] as Array<{ id: string; token: string }>, invalidTokens: [] as string[] };
  let accepted = 0;
  let rejected = 0;
  const acceptedTickets: Array<{ id: string; token: string }> = [];
  const invalidTokens: string[] = [];
  for (let index = 0; index < messages.length; index += 100) {
    const chunk = messages.slice(index, index + 100);
    const response = await fetcher(EXPO_PUSH_ENDPOINT, { method: "POST", headers: expoHeaders(), body: JSON.stringify(chunk) });
    if (!response.ok) throw new Error(`Expo push request failed (${response.status}).`);
    const payload = (await response.json().catch(() => ({}))) as { data?: Array<{ status?: string; id?: string; details?: { error?: string } }> };
    const responseTickets = Array.isArray(payload.data) ? payload.data : [];
    chunk.forEach((message, ticketIndex) => {
      const ticket = responseTickets[ticketIndex];
      if (ticket?.status === "ok") {
        accepted += 1;
        if (typeof ticket.id === "string" && ticket.id.trim()) acceptedTickets.push({ id: ticket.id.trim(), token: message.to });
      } else {
        rejected += 1;
        if (ticket?.details?.error === "DeviceNotRegistered") invalidTokens.push(message.to);
      }
    });
  }
  return { accepted, rejected, tickets: acceptedTickets, invalidTokens: Array.from(new Set(invalidTokens)) };
}

export function normalizePendingExpoPushTickets(input: unknown, now: string): PendingExpoPushTicket[] {
  const rows = Array.isArray(input) ? input : [];
  const currentTime = Date.parse(now);
  const unique = new Map<string, PendingExpoPushTicket>();
  for (const raw of rows) {
    const row = asRecord(raw);
    const id = typeof row?.id === "string" ? row.id.trim() : "";
    const token = typeof row?.token === "string" ? row.token.trim() : "";
    const createdAt = typeof row?.createdAt === "string" && Number.isFinite(Date.parse(row.createdAt)) ? row.createdAt : "";
    if (!/^[a-zA-Z0-9_-]{8,256}$/.test(id) || !validExpoPushToken(token) || !createdAt) continue;
    if (Number.isFinite(currentTime) && currentTime - Date.parse(createdAt) > MAX_PENDING_PUSH_TICKET_AGE_MS) continue;
    unique.set(id, { id, token, createdAt });
  }
  return [...unique.values()].slice(-MAX_PENDING_PUSH_TICKETS);
}

export async function reconcileExpoPushReceipts(input: unknown, devices: unknown, fetcher: typeof fetch = fetch, now = new Date().toISOString()) {
  const pending = normalizePendingExpoPushTickets(input, now);
  if (!pending.length) return { devices: normalizePushDevices(devices), pending, accepted: 0, rejected: 0 };
  const receipts: Record<string, { status?: string; details?: { error?: string } }> = {};
  for (let index = 0; index < pending.length; index += 300) {
    const chunk = pending.slice(index, index + 300);
    const response = await fetcher(EXPO_PUSH_RECEIPTS_ENDPOINT, { method: "POST", headers: expoHeaders(), body: JSON.stringify({ ids: chunk.map((ticket) => ticket.id) }) });
    if (!response.ok) throw new Error(`Expo push receipt request failed (${response.status}).`);
    const payload = (await response.json().catch(() => ({}))) as { data?: Record<string, { status?: string; details?: { error?: string } }> };
    Object.assign(receipts, asRecord(payload.data) || {});
  }
  let accepted = 0;
  let rejected = 0;
  const invalidTokens: string[] = [];
  const unresolved: PendingExpoPushTicket[] = [];
  for (const ticket of pending) {
    const receipt = receipts[ticket.id];
    if (!receipt) unresolved.push(ticket);
    else if (receipt.status === "ok") accepted += 1;
    else {
      rejected += 1;
      if (receipt.details?.error === "DeviceNotRegistered") invalidTokens.push(ticket.token);
    }
  }
  return { devices: disablePushTokens(devices, invalidTokens, now), pending: unresolved, accepted, rejected };
}
