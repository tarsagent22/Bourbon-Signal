function normalizeDirectoryValue(value: unknown) {
  return typeof value === "string" ? value.toLowerCase().trim() : "";
}

export function storeDirectoryLookupKey(location: Record<string, unknown>) {
  const state = normalizeDirectoryValue(location.state ?? location.state_code).toUpperCase();
  const id = normalizeDirectoryValue(location.id ?? location.sourceStoreId);
  const address = normalizeDirectoryValue(location.address);
  const city = normalizeDirectoryValue(location.city);
  const name = normalizeDirectoryValue(location.name ?? location.displayLabel);

  if (state && address) return `address:${state}:${address}:${city}`;
  if (state && id) return `id:${state}:${id}`;
  return `name:${state}:${name}:${city}`;
}

export function combineStoreDirectoryRows(rows: unknown[]) {
  const directory = new Map<string, Record<string, unknown>>();
  for (const value of rows) {
    if (!value || typeof value !== "object" || Array.isArray(value)) continue;
    const row = value as Record<string, unknown>;
    const key = storeDirectoryLookupKey(row);
    if (!directory.has(key)) directory.set(key, row);
  }
  return Array.from(directory.values());
}
