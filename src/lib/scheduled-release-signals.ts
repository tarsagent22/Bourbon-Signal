export type ScheduledReleaseInput = {
  event_type?: string | null;
  eventType?: string | null;
  signal_category?: string | null;
  signalCategory?: string | null;
  signal_label?: string | null;
  signalLabel?: string | null;
  releaseDate?: string | null;
  eventDate?: string | null;
  startsAt?: string | null;
  event_at?: string | null;
  eventAt?: string | null;
  availabilityLabel?: string | null;
  inventoryCaveat?: string | null;
};

function text(value: unknown) {
  return String(value ?? "").trim();
}

export function isScheduledReleaseSignal(drop: ScheduledReleaseInput) {
  const eventType = text(drop.event_type ?? drop.eventType).toLowerCase();
  const category = text(drop.signal_category ?? drop.signalCategory).toLowerCase();
  const label = text(drop.signal_label ?? drop.signalLabel).toLowerCase();
  const caveat = text(drop.inventoryCaveat).toLowerCase();
  if (eventType === "alabc_limited_release_store_drop") return true;
  if (category === "release_watch" && /scheduled|abc release|limited release/.test(label)) return true;
  return /scheduled release|limited release/.test(label) && /not live shelf inventory|release intelligence/.test(caveat);
}

export function scheduledReleaseDateValue(drop: ScheduledReleaseInput) {
  return text(drop.releaseDate ?? drop.eventDate ?? drop.startsAt ?? drop.event_at ?? drop.eventAt);
}

export function formatScheduledReleaseDate(value?: string | null) {
  const raw = text(value);
  if (!raw) return "date listed by source";
  const normalized = /^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw;
  const date = new Date(normalized);
  if (Number.isNaN(date.getTime())) return raw;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" }).format(date);
}

export function formatScheduledReleaseOccurrence(drop: ScheduledReleaseInput) {
  return `Release occurs ${formatScheduledReleaseDate(scheduledReleaseDateValue(drop))}`;
}

export function getScheduledReleaseSignalCopy(drop: ScheduledReleaseInput) {
  if (!isScheduledReleaseSignal(drop)) return null;
  const statusLine = formatScheduledReleaseOccurrence(drop);
  return {
    badge: "Scheduled release",
    statusLine,
    explanation: "Not live shelf inventory. This is a scheduled release signal, not a claim that the bottle is on the shelf right now.",
    detail: `${statusLine}. This is a planned ABC release; confirm release rules, line timing, limits, and availability with the official source before driving.`,
  };
}
