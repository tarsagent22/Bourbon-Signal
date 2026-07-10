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
