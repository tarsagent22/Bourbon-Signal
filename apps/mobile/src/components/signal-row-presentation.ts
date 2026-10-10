import type { Signal } from "../api/types";
import { presentBottleIdentity, presentSignal, signalCardStatusLabel } from "../api/presentation";

export function signalRowBottleIdentity(name: string) {
  const identity = presentBottleIdentity(name);
  const volume = identity.subtitle.match(/\d+(?:\.\d+)?\s?(?:ml|l)$/i)?.[0] || "";
  return { title: identity.title, subtitle: /bottled in bond|rye/i.test(identity.subtitle) ? identity.subtitle : volume };
}

// Counted reports can carry their attribution on the same line. Exceptional
// states (historical, stale, upcoming, unavailable) always keep their own label.
export function signalRowFacts(signal: Signal, now = new Date()) {
  const presented = presentSignal(signal);
  const status = signalCardStatusLabel(signal, now);
  const raw = presented.quantity === "Quantity unknown" ? "" : presented.quantity;
  const counted = /^\d+ bottles?$/.test(raw);
  const routine = ["Reported", "Reported available", "Retailer reports available", "Retailer reported"].includes(status);
  const quantity = counted && routine
    ? `${raw} ${status.startsWith("Retailer") ? "retailer-reported" : "reported"}`
    : raw;
  return { quantity, status, showStatus: !counted || !routine };
}
