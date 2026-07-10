function key(value) {
  return String(value || '').trim().toLowerCase();
}

function add(index, indexKey, id) {
  if (!indexKey) return;
  (index[indexKey] ||= []).push(id);
}

export function buildQueryIndexes(rows = [], options = {}) {
  const idFor = options.idFor || ((row) => String(row.id || row.key));
  const indexes = { state: {}, board: {}, county: {}, city: {}, store: {}, details: {} };
  for (const row of rows) {
    const id = idFor(row);
    if (!id || id === 'undefined') throw new Error('Query index rows require a stable id or key');
    indexes.details[id] = structuredClone(row);
    const state = key(row.state);
    add(indexes.state, state, id);
    add(indexes.board, key(row.board || row.boardName), id);
    add(indexes.county, state && row.county ? `${state}|${key(row.county)}` : '', id);
    add(indexes.city, state && row.city ? `${state}|${key(row.city)}` : '', id);
    add(indexes.store, state && (row.storeId || row.storeName) ? `${state}|${key(row.storeId || row.storeName)}` : '', id);
  }
  for (const index of [indexes.state, indexes.board, indexes.county, indexes.city, indexes.store]) {
    for (const values of Object.values(index)) values.sort();
  }
  return indexes;
}
