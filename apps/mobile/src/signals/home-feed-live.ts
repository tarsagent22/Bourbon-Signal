import type { Signal } from "../api/types";

export const SIGNAL_RECENT_WINDOW_MS = 72 * 60 * 60 * 1_000;

function uniqueById(signals: readonly Signal[]) {
  return [...new Map(signals.map((signal) => [signal.id, signal])).values()];
}

export function reconcileQueuedSignals(current: readonly Signal[], queued: readonly Signal[], incoming: readonly Signal[], baselineDisplayAt?: string) {
  const currentIds = new Set(current.map((signal) => signal.id));
  const incomingById = new Map(incoming.map((signal) => [signal.id, signal]));
  const baseline = Date.parse(baselineDisplayAt || current[0]?.timing.displayAt || "");
  const newlyReported = incoming.filter((signal) => {
    const displayed = Date.parse(signal.timing.displayAt);
    return !currentIds.has(signal.id) && (!Number.isFinite(baseline) || (Number.isFinite(displayed) && displayed >= baseline));
  });
  const stillPresent = queued.flatMap((signal) => {
    const latest = incomingById.get(signal.id);
    return latest ? [latest] : [];
  });
  return uniqueById([...newlyReported, ...stillPresent]);
}

export function reconcileDisplayedSignals(current: readonly Signal[], incoming: readonly Signal[], hasMore: boolean) {
  const incomingById = new Map(incoming.map((signal) => [signal.id, signal]));
  const oldestCovered = incoming.reduce((oldest, signal) => {
    const displayed = Date.parse(signal.timing.displayAt);
    return Number.isFinite(displayed) ? Math.min(oldest, displayed) : oldest;
  }, Number.POSITIVE_INFINITY);
  return current.flatMap((signal) => {
    const latest = incomingById.get(signal.id);
    if (latest) return [latest];
    if (!hasMore) return [];
    const displayed = Date.parse(signal.timing.displayAt);
    return Number.isFinite(oldestCovered) && Number.isFinite(displayed) && displayed >= oldestCovered ? [] : [signal];
  });
}

export function acceptQueuedSignals(current: readonly Signal[], queued: readonly Signal[]) {
  return uniqueById([...queued, ...current]);
}

export function recentTickerSignals(signals: readonly Signal[], now = new Date()) {
  const current = now.getTime();
  if (!Number.isFinite(current)) return [];
  return uniqueById(signals).filter((signal) => {
    if (signal.kind !== "availability") return false;
    const reported = Date.parse(signal.timing.displayAt);
    return Number.isFinite(reported) && reported <= current && current - reported < SIGNAL_RECENT_WINDOW_MS;
  });
}

export function tickerLocationLabel(signal: Signal) {
  const store = signal.location.store;
  const city = store?.city?.trim() || "";
  const state = store?.state?.trim() || signal.location.state?.trim() || "";
  if (city && state) return `${city}, ${state}`;
  return city || state || signal.location.label?.trim() || "Location not specified";
}
