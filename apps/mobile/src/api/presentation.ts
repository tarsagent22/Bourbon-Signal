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
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 14) return `${days}d ago`;
  return new Date(observed).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

export function signalAccessibilityTime(value: string, now = new Date()) {
  const relative = relativeSignalTime(value, now);
  if (relative === "Now") return "Now";
  const match = relative.match(/^(\d+)([mhd])(?: ago)?$/);
  if (!match) return relative;
  const amount = Number(match[1]);
  const unit = match[2] === "m" ? "minute" : match[2] === "h" ? "hour" : "day";
  return `${amount} ${unit}${amount === 1 ? "" : "s"} ago`;
}

function normalizedQuantityLabel(signal: Signal) {
  const raw = signal.availability?.quantityLabel?.trim() || "";
  const counted = raw.match(/^(\d+)(?:\s+bottles?)?$/i);
  if (counted) {
    const count = Number(counted[1]);
    return `${count} reported`;
  }
  if (raw) return `Reported: ${raw}`;
  if (typeof signal.availability?.quantity === "number") {
    const count = signal.availability.quantity;
    return `${count} reported`;
  }
  if (signal.availability?.status === "available_now" || signal.availability?.status === "reported") {
    return "Quantity unknown";
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
  const rawPrice = signal.availability?.price;
  const price = signal.availability
    ? typeof rawPrice === "number" && Number.isFinite(rawPrice) && rawPrice > 0 ? `$${rawPrice.toFixed(2)}` : "Price unknown"
    : "";
  const quantity = normalizedQuantityLabel(signal);
  const reporter = signal.source.type === "member"
    ? signal.source.actor?.displayName || signal.source.actor?.label || signal.source.label
    : "";
  return {
    location,
    address,
    price,
    quantity,
    reporter,
    availability: signal.availability?.label || (signal.availability ? statusLabels[signal.availability.status] : ""),
    summary: signal.evidence.summary || "",
    caveat: signal.availability?.caveat || "",
    observed: signal.timing.displayAt,
  };
}

export function signalReporterAttribution(signal: Signal) {
  const reporter = presentSignal(signal).reporter;
  return reporter ? `Reported by ${reporter}` : "";
}

export function signalCardAppearance(signal: Signal) {
  const community = signal.source.type === "member";
  const base = community
    ? { surface: "#1A1B1D", keyline: "#3E4146", accent: "#B8BDC5", secondaryText: "#A9ADB4" }
    : { surface: "#1F1A14", keyline: "#57442D", accent: "#D3A258", secondaryText: "#B9A78D" };
  const rarity = signal.bottle.rarity || "limited";
  const rarityAppearance = rarity === "unicorn"
    ? { surface: "#211925", keyline: "#61446E", accent: "#D8B5E2", secondaryText: "#C9B8CF" }
    : rarity === "allocated"
      ? community
        ? { surface: "#211A16", keyline: "#745033", accent: "#D79B60", secondaryText: "#BEA48D" }
        : { surface: "#261A10", keyline: "#82562F", accent: "#E0A461", secondaryText: "#C7A682" }
      : base;
  return {
    sourceLabel: community ? "COMMUNITY" : "MARKET",
    rarityLabel: rarity === "unicorn" ? "UNICORN" : rarity === "allocated" ? "ALLOCATED" : "LIMITED",
    ...rarityAppearance,
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
    signalReporterAttribution(signal),
    signalAccessibilityTime(signal.timing.displayAt, now),
    presented.price,
    presented.quantity,
    signalCardSummary(signal),
  ].filter(Boolean).join(", ");
}
