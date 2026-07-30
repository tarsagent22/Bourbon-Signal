export const CONTROL_ROOM_TIME_ZONE = "America/New_York";

export function formatControlRoomDateTime(value: string | null) {
  if (!value) return "No timestamp";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "No timestamp";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: CONTROL_ROOM_TIME_ZONE,
    timeZoneName: "short",
  }).format(parsed);
}
