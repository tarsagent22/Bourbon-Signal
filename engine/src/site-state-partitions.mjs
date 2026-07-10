function normalizeState(value) {
  return String(value || '').trim().toUpperCase();
}

function rowMultiset(rows) {
  const values = new Map();
  for (const row of rows) {
    const key = JSON.stringify(row);
    values.set(key, (values.get(key) || 0) + 1);
  }
  return values;
}

export function buildStateDropPartitions(drops, { contractVersion, generatedAt, activeStates = [] }) {
  const states = [...new Set([...activeStates, ...drops.map((drop) => normalizeState(drop.state)).filter(Boolean)].map(normalizeState))].sort();
  const payloads = new Map();
  const stateRows = states.map((state) => {
    const rows = drops.filter((drop) => normalizeState(drop.state) === state);
    payloads.set(state, { contractVersion, generatedAt, state, count: rows.length, drops: rows });
    return { state, file: `states/${state}/drops.json`, count: rows.length };
  });
  return {
    index: {
      contractVersion,
      generatedAt,
      totalCount: drops.length,
      stateCount: states.length,
      states: stateRows,
    },
    payloads,
  };
}

export function verifyStateDropPartitions(sourceDrops, partitions) {
  const errors = [];
  const combined = [];
  let declaredTotal = 0;
  for (const entry of partitions.index.states || []) {
    const payload = partitions.payloads.get(entry.state);
    if (!payload) {
      errors.push(`Missing partition payload for ${entry.state}`);
      continue;
    }
    if (payload.state !== entry.state) errors.push(`${entry.state} partition has mismatched state ${payload.state}`);
    if (payload.count !== payload.drops.length || entry.count !== payload.drops.length) errors.push(`${entry.state} partition count mismatch`);
    const foreign = payload.drops.filter((drop) => normalizeState(drop.state) !== entry.state);
    if (foreign.length) errors.push(`${entry.state} partition contains ${foreign.length} foreign row(s)`);
    declaredTotal += entry.count;
    combined.push(...payload.drops);
  }
  if (partitions.index.totalCount !== sourceDrops.length) errors.push('Partition index total does not match source');
  if (declaredTotal !== sourceDrops.length) errors.push('Partition declared counts do not match source');

  const sourceSet = rowMultiset(sourceDrops);
  const combinedSet = rowMultiset(combined);
  if (sourceSet.size !== combinedSet.size || [...sourceSet].some(([key, count]) => combinedSet.get(key) !== count)) {
    errors.push('Partition rows are not a complete, lossless copy of source drops');
  }
  return { ok: errors.length === 0, errors };
}
