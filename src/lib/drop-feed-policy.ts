function asTime(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : Number.NaN;
}

function isInventorySignal(drop: Record<string, unknown>) {
  const type = String(drop.event_type ?? drop.type ?? "").toLowerCase();
  const category = String(drop.signal_category ?? drop.signalCategory ?? "").toLowerCase();
  const scope = String(drop.availability_scope ?? drop.availabilityScope ?? "").toLowerCase();
  const precision = String(drop.location_precision ?? drop.locationPrecision ?? "").toLowerCase();
  return drop.can_alert_as_inventory === true
    || drop.canAlertAsInventory === true
    || category === "inventory"
    || scope === "store_reported"
    || precision === "store_level"
    || type.includes("in_stock")
    || type.includes("inventory_result");
}

export function resolveDropLimit(raw: string | null | undefined, isFreeAccess: boolean, previewLimit: number) {
  const parsed = Number(raw ?? "40") || 40;
  const requested = Math.min(500, Math.max(0, parsed));
  return isFreeAccess ? Math.min(requested, previewLimit) : requested;
}

export function dropFreshnessTime(drop: Record<string, unknown>) {
  const confirmation = asTime(drop.last_confirmed_at ?? drop.lastConfirmedAt);
  if (isInventorySignal(drop) && Number.isFinite(confirmation)) return confirmation;
  return asTime(drop.timestamp ?? drop.displayAt ?? drop.event_at ?? drop.eventAt ?? drop.first_seen_at ?? drop.firstSeenAt ?? drop.last_confirmed_at ?? drop.lastConfirmedAt);
}

function firstText(...values: unknown[]) {
  const value = values.find((candidate) => typeof candidate === "string" && candidate.trim());
  return typeof value === "string" ? value : "";
}

function firstValidTimestamp(...values: unknown[]) {
  const value = values.find((candidate) => Number.isFinite(asTime(candidate)));
  return typeof value === "string" ? value : "";
}

export function dropDisplayTime(drop: Record<string, unknown>) {
  const basis = firstText(drop.timestamp_basis, drop.timestampBasis) || "last_confirmed_at";
  const eventTimes = [drop.event_at, drop.eventAt];
  const firstSeenTimes = [drop.first_seen_at, drop.firstSeenAt];
  const confirmationTimes = [drop.last_confirmed_at, drop.lastConfirmedAt];
  const timestamps = [drop.timestamp, drop.displayAt];

  const confirmedAt = firstValidTimestamp(...confirmationTimes);
  if (isInventorySignal(drop) && confirmedAt) return confirmedAt;
  if (basis === "source_event_at") return firstValidTimestamp(...eventTimes, ...firstSeenTimes, ...confirmationTimes, ...timestamps);
  if (basis === "first_seen_at") return firstValidTimestamp(...firstSeenTimes, ...eventTimes, ...confirmationTimes, ...timestamps);
  return firstValidTimestamp(...confirmationTimes, ...firstSeenTimes, ...eventTimes, ...timestamps);
}
