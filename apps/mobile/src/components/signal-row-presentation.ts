import type { Signal } from "../api/types";
import { presentBottleIdentity, presentSignal, signalCardStatusLabel, signalListingPresentation, reportAge, relativeSignalTime } from "../api/presentation";

export function signalRowTimeLabel(signal: Signal, now = new Date()) {
  return reportAge(signal, now).label;
}

export function signalRowReportSummary(signal: Signal, now = new Date()) {
  const quantity = presentSignal(signal).quantity;
  const counted = /^\d+ bottles?$/.test(quantity);
  const age = reportAge(signal, now);
  const time = age.value ? relativeSignalTime(age.value, now).replace(/^Now$/, "just now") : "Time unknown";
  const timestamp = !age.value ? "Time unknown" : `${signal.source.type === "trusted_source" && signal.timing.lastCheckedAt === age.value ? "Checked" : "Reported"} ${time}`;
  return {
    label: signal.kind === "availability" ? `${counted ? quantity + " · " : ""}${timestamp}` : age.label,
    quantityInSummary: signal.kind === "availability" && counted,
  };
}

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
  const listing = signalListingPresentation(signal, now);
  const displayedStatus = listing?.status || status;
  const showStatus = listing
    ? displayedStatus !== "Reported" && (!counted || !routine || displayedStatus !== status)
    : !counted || !routine;
  return { quantity, status: displayedStatus, showStatus };
}
