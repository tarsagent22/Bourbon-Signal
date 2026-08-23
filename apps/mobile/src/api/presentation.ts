import type { Signal } from "./types";

const statusLabels: Record<NonNullable<Signal["availability"]>["status"], string> = {
  available_now: "Available now",
  upcoming: "Upcoming",
  reported: "Reported",
  unknown: "Availability unknown",
};

export function relativeSignalTime(value: string, now = new Date()) {
  const observed = Date.parse(value);
  const current = now.getTime();
  if (!Number.isFinite(observed) || !Number.isFinite(current)) return "";
  const elapsed = Math.max(0, current - observed);
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 1) return "Now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d`;
  return new Date(observed).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function signalAccessibilityTime(value: string, now = new Date()) {
  const relative = relativeSignalTime(value, now);
  if (relative === "Now") return "Now";
  const match = relative.match(/^(\d+)([mhd])$/);
  if (!match) return relative;
  const amount = Number(match[1]);
  const unit = match[2] === "m" ? "minute" : match[2] === "h" ? "hour" : "day";
  return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

function normalizedQuantityLabel(signal: Signal) {
  const raw = signal.availability?.quantityLabel?.trim() || "";
  if (/^\d+$/.test(raw)) {
    const count = Number(raw);
    return `${raw} bottle${count === 1 ? "" : "s"}`;
  }
  if (raw) return raw;
  if (typeof signal.availability?.quantity === "number") {
    const count = signal.availability.quantity;
    return `${count} bottle${count === 1 ? "" : "s"}`;
  }
  if (signal.availability?.status === "available_now" || signal.availability?.status === "reported") {
    return signal.source.type === "member" ? "Count not provided" : "Count not published";
  }
  return "";
}

function retailerQualified(signal: Signal) {
  const availabilityCopy = `${signal.availability?.label || ""} ${signal.availability?.caveat || ""}`;
  return signal.evidence.retailerReported
    || signal.source.type === "retailer"
    || /retailer.{0,32}report|orderable/i.test(availabilityCopy);
}

export function signalAvailabilityWindow(signal: Signal) {
  if (signal.availability?.status !== "available_now") return null;
  const startsAt = Date.parse(signal.timing.displayAt);
  if (!Number.isFinite(startsAt)) return null;
  const explicitExpiry = signal.timing.expiresAt ? Date.parse(signal.timing.expiresAt) : Number.NaN;
  const endsAt = Number.isFinite(explicitExpiry) ? explicitExpiry : startsAt + 24 * 60 * 60 * 1_000;
  return { startsAt, endsAt };
}

export function signalAvailabilityIsCurrent(signal: Signal, now = new Date()) {
  const window = signalAvailabilityWindow(signal);
  const current = now.getTime();
  return Boolean(window
    && Number.isFinite(current)
    && window.startsAt <= current
    && current < window.endsAt);
}

export function signalAvailabilityRefreshAt(signal: Signal, now = new Date()) {
  const window = signalAvailabilityWindow(signal);
  const current = now.getTime();
  if (!window || !Number.isFinite(current)) return null;
  if (current < window.startsAt) return window.startsAt;
  if (current < window.endsAt) return window.endsAt;
  return null;
}

export function presentSignal(signal: Signal) {
  const store = signal.location.store;
  const location = [store?.name || signal.location.label, store?.city, store?.state || signal.location.state].filter(Boolean).join(" · ");
  const address = [store?.address, store?.city, store?.state || signal.location.state, store?.zip].filter(Boolean).join(" · ");
  const price = typeof signal.availability?.price === "number" ? `$${signal.availability.price.toFixed(2)}` : "";
  const quantity = normalizedQuantityLabel(signal);
  return {
    location,
    address,
    price,
    quantity,
    availability: signal.availability?.label || (signal.availability ? statusLabels[signal.availability.status] : ""),
    summary: signal.evidence.summary || "",
    caveat: signal.availability?.caveat || "",
    observed: signal.timing.displayAt,
  };
}

export function signalCardStatusLabel(signal: Signal, now = new Date()) {
  if (signal.source.type === "member") {
    const identity = signal.source.actor?.label || signal.source.label;
    return /^(Founder|Member) #\d+$/.test(identity) ? identity : "Community report";
  }
  if (signal.kind === "release") return "Release";
  if (signal.kind === "event") return "Event";
  if (signal.availability?.status === "available_now") {
    const window = signalAvailabilityWindow(signal);
    if (window && now.getTime() < window.startsAt) return "Upcoming";
    if (!signalAvailabilityIsCurrent(signal, now)) return "Reported available";
    return retailerQualified(signal) ? "Retailer reports available" : "Available now";
  }
  if (signal.availability) return statusLabels[signal.availability.status];
  if (retailerQualified(signal)) return "Retailer reported";
  return "Reported";
}

export function signalCardSummary(signal: Signal) {
  return signal.source.type === "member" || signal.kind === "release" || signal.kind === "event"
    ? signal.evidence.summary || ""
    : "";
}

export function signalStatusLabel(signal: Signal, availability = presentSignal(signal).availability) {
  if (signal.source.type === "member") return "Member sighting";
  if (signal.kind === "release") return "Release";
  if (signal.kind === "event") return "Event";
  return availability || "Reported";
}

export function signalLocationLabel(signal: Signal, location = presentSignal(signal).location) {
  return location || signal.location.state || "Location not specified";
}

export function signalAccessibilityLabel(signal: Signal, now = new Date()) {
  const presented = presentSignal(signal);
  const status = signalCardStatusLabel(signal, now);
  const location = signalLocationLabel(signal, presented.location);
  return [
    signal.bottle.name,
    location,
    status,
    signalAccessibilityTime(signal.timing.displayAt, now),
    presented.price,
    presented.quantity,
    signalCardSummary(signal),
  ].filter(Boolean).join(", ");
}
