import type { Signal } from "../api/types";
import { presentSignal, signalCardStatusLabel } from "../api/presentation";

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
