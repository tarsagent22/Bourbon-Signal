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
  if (days < 7) return `${days}d`;
  return new Date(observed).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function presentSignal(signal: Signal) {
  const store = signal.location.store;
  const location = [store?.name || signal.location.label, store?.city, store?.state || signal.location.state].filter(Boolean).join(" · ");
  const address = [store?.address, store?.city, store?.state || signal.location.state, store?.zip].filter(Boolean).join(" · ");
  const price = typeof signal.availability?.price === "number" ? `$${signal.availability.price.toFixed(2)}` : "";
  const quantity = signal.availability?.quantityLabel
    || (typeof signal.availability?.quantity === "number" ? `${signal.availability.quantity} bottle${signal.availability.quantity === 1 ? "" : "s"}` : "");
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
  const status = signalStatusLabel(signal, presented.availability);
  const location = signalLocationLabel(signal, presented.location);
  const source = signal.source.actor?.label || signal.source.label;
  const trust = signal.source.type === "member" ? "Community report" : signal.source.type === "retailer" ? "Retailer reported" : signal.evidence.sourceBacked ? "Source backed" : "";
  return [
    signal.bottle.name,
    location,
    status,
    relativeSignalTime(signal.timing.displayAt, now),
    presented.price,
    presented.quantity,
    presented.summary,
    source,
    trust,
  ].filter(Boolean).join(", ");
}
