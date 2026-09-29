export const ALERT_DELIVERY_OPEN_HOUR = 8;
export const ALERT_DELIVERY_CLOSE_HOUR = 20;

type AlertDeliveryWindowStatus =
  | { open: true; reason: "open"; localHour: number }
  | { open: false; reason: "outside_delivery_hours"; localHour: number }
  | { open: false; reason: "missing_time_zone" | "invalid_time_zone" };

export function normalizeAlertDeliveryTimeZone(value: unknown) {
  if (typeof value !== "string" || !value.trim() || value.length > 80) return "";
  const requested = value.trim();
  if (requested !== "UTC" && !requested.includes("/")) return "";
  try {
    const canonical = new Intl.DateTimeFormat("en-US", { timeZone: requested }).resolvedOptions().timeZone;
    if (canonical !== "UTC" && !canonical.includes("/")) return "";
    return canonical;
  } catch {
    return "";
  }
}

function localHourAt(timestamp: string | Date, timeZone: string) {
  const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return null;
  const hour = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date).find((part) => part.type === "hour")?.value;
  const parsed = Number(hour);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : null;
}

export function alertDeliveryWindowStatus(
  timestamp: string | Date,
  timeZoneInput: unknown,
  openHour = ALERT_DELIVERY_OPEN_HOUR,
  closeHour = ALERT_DELIVERY_CLOSE_HOUR,
): AlertDeliveryWindowStatus {
  if (typeof timeZoneInput !== "string" || !timeZoneInput.trim()) {
    return { open: false, reason: "missing_time_zone" };
  }
  const timeZone = normalizeAlertDeliveryTimeZone(timeZoneInput);
  if (!timeZone) return { open: false, reason: "invalid_time_zone" };
  const localHour = localHourAt(timestamp, timeZone);
  if (localHour === null) return { open: false, reason: "invalid_time_zone" };
  const open = localHour >= openHour && localHour < closeHour;
  return open
    ? { open: true, reason: "open", localHour }
    : { open: false, reason: "outside_delivery_hours", localHour };
}

export function isWithinMemberAlertDeliveryWindow(
  timestamp: string | Date,
  timeZone: unknown,
  openHour = ALERT_DELIVERY_OPEN_HOUR,
  closeHour = ALERT_DELIVERY_CLOSE_HOUR,
) {
  return alertDeliveryWindowStatus(timestamp, timeZone, openHour, closeHour).open;
}
