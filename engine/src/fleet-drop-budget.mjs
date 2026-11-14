export const MAX_CONTEXT_DROP_ROWS = 10_000;
// The customer drops payload is minified at write time. Reserve wrapper room
// within the 60 MiB payload target; the snapshot reader still caps at 64 MiB.
export const MAX_CUSTOMER_DROP_BYTES = 60 * 1024 * 1024;
export const MAX_CUSTOMER_DROP_CONTENT_BYTES = MAX_CUSTOMER_DROP_BYTES - 4 * 1024;
const stateOf = row => String(row?.state || row?.state_code || '').toUpperCase();
const LEGACY_NULL_FIELDS = new Set(['eventAt','eventDate','releaseDate','staleSourceCaveat']);

// Nullable optional placeholders have no source evidence. Omit only those
// top-level values on the wire; retain false, zero, all nested proof fields,
// and legacy nullable chronology/caveat fields used by retained partitions.
export function compactCustomerDrop(row) {
  if (!Object.values(row).some(value => value === null)) return row;
  return Object.fromEntries(Object.entries(row).filter(([key, value]) => value !== null || LEGACY_NULL_FIELDS.has(key)));
}

export function serializeCustomerDropPayload(payload) {
  const serialized = JSON.stringify(payload);
  if (Buffer.byteLength(serialized) > MAX_CUSTOMER_DROP_BYTES) {
    throw new Error('Serialized customer drops payload exceeds the 60 MiB file budget.');
  }
  return serialized;
}

/** Never truncate current evidence or a complete retained partition for history.
 * The caller supplies already-admitted rows. Optional context is bounded;
 * required evidence exceeding the byte budget fails the export explicitly. */
export function selectFleetDropBudget(rows, { isRequired = () => true,
  maxContextRows = MAX_CONTEXT_DROP_ROWS, maxBytes = MAX_CUSTOMER_DROP_CONTENT_BYTES } = {}) {
  if (!Number.isSafeInteger(maxContextRows) || maxContextRows < 0 || !Number.isSafeInteger(maxBytes) || maxBytes < 2) throw new Error('Invalid customer drop budget');
  const selected = new Set(), optional = new Map();
  let bytes = 2;
  for (const row of rows) {
    if (!isRequired(row)) {
      const state = stateOf(row);
      if (!optional.has(state)) optional.set(state, []);
      optional.get(state).push(row);
      continue;
    }
    if (selected.has(row)) continue;
    selected.add(row);
    bytes += Buffer.byteLength(JSON.stringify(compactCustomerDrop(row))) + 1;
    if (bytes > maxBytes) throw new Error('Required current/fallback customer evidence exceeds the ' + maxBytes + '-byte drop budget; no partition was truncated.');
  }
  const queues = [...optional.values()];
  let cursor = 0, context = 0;
  while (context < maxContextRows) {
    let advanced = false;
    for (const queue of queues) {
      if (cursor >= queue.length) continue;
      advanced = true;
      const row = queue[cursor], size = Buffer.byteLength(JSON.stringify(compactCustomerDrop(row))) + 1;
      if (selected.has(row) || bytes + size > maxBytes) continue;
      selected.add(row);bytes += size;context++;
      if (context === maxContextRows) break;
    }
    if (!advanced) break;
    cursor++;
  }
  return rows.filter(row => selected.has(row)).map(compactCustomerDrop);
}
