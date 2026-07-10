import { isDeepStrictEqual } from 'node:util';

export function buildChangeSet(previous = [], current = [], options = {}) {
  const keyFor = options.keyFor || ((row) => row.key || row.id);
  const before = new Map(previous.map((row) => [keyFor(row), row]));
  const after = new Map(current.map((row) => [keyFor(row), row]));
  const changes = [];
  for (const [key, oldRow] of before) {
    const newRow = after.get(key);
    if (newRow && !isDeepStrictEqual(oldRow, newRow)) changes.push({ type: 'updated', key, before: oldRow, after: newRow });
  }
  for (const [key, oldRow] of before) if (!after.has(key)) changes.push({ type: 'removed', key, before: oldRow, after: null });
  for (const [key, newRow] of after) if (!before.has(key)) changes.push({ type: 'added', key, before: null, after: newRow });
  return changes;
}

export function planIncrementalPartitions(changes, options = {}) {
  const dimensions = options.dimensions || ['state'];
  const threshold = Number(options.fullRebuildThreshold ?? 0.6);
  const affected = new Set();
  for (const change of changes) {
    for (const row of [change.before, change.after]) {
      if (!row) continue;
      for (const dimension of dimensions) if (row[dimension] != null && row[dimension] !== '') affected.add(`${dimension}:${row[dimension]}`);
    }
  }
  const all = options.allPartitions || [];
  const full = Boolean(options.forceFull) || (all.length > 0 && affected.size / all.length > threshold);
  return {
    mode: full ? 'full' : changes.length ? 'incremental' : 'noop',
    rebuild: (full ? all : [...affected]).sort(),
    changedRecordCount: changes.length
  };
}
