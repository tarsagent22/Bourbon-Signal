import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const STATUSES = ['unsearched', 'candidate_found', 'needs_identity_review', 'needs_permission', 'needs_processing', 'ready', 'published', 'no_verified_source'];
export const stable = value => JSON.stringify(canonical(value));
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, canonical(value[k])]));
  return value;
}
export const digest = value => createHash('sha256').update(stable(value)).digest('hex');
const sorted = values => [...values].sort();
export function requireValue(ok, message) { if (!ok) throw new Error(message); }
export function validDate(value) { return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
function ids(rows) {
  requireValue(Array.isArray(rows), 'rows must be an array');
  const found = new Set();
  for (const r of rows) {
    requireValue(r && typeof r.id === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(r.id), 'missing or malformed ID (never normalized)');
    requireValue(!found.has(r.id), `duplicate ID: ${r.id}`); found.add(r.id);
  }
  return found;
}
function checkSnapshot(snapshot) {
  requireValue(snapshot && Number.isSafeInteger(snapshot.total) && snapshot.total >= 0, 'snapshot must declare total');
  ids(snapshot.bottles);
  requireValue(snapshot.total === snapshot.bottles.length, 'declared total does not equal row count');
  // Unknown pagination envelopes are rejected rather than assumed complete.
  for (const key of ['hasMore', 'has_more', 'next', 'nextPage', 'nextCursor', 'next_cursor', 'next_page'])
    requireValue(!snapshot[key], `incomplete pagination: ${key}`);
  requireValue(!snapshot.pagination && !snapshot.pageInfo, 'flatten and reconcile pagination before inventory');
  for (const row of snapshot.bottles) requireValue(typeof row.canonicalName === 'string' && row.canonicalName.trim(), `missing exact name: ${row.id}`);
}
export function snapshotHash(snapshot) {
  checkSnapshot(snapshot);
  return digest({ ...snapshot, bottles: [...snapshot.bottles].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0) });
}
export function checkLedger(ledger) {
  requireValue(ledger?.schemaVersion === 1, 'unsupported ledger version'); ids(ledger.items);
  requireValue(ledger.items.filter(r => r.present).length === ledger.snapshot?.total && ledger.items.length === ledger.summary?.totalWorkItems, 'ledger rows lost: snapshot/retained counts disagree');
  for (const row of ledger.items) {
    requireValue(STATUSES.includes(row.status), `invalid status: ${row.id}`);
    requireValue(typeof row.present === 'boolean' && typeof row.requiresReview === 'boolean', `invalid lifecycle: ${row.id}`);
    requireValue(row.catalog?.id === row.id && digest(row.catalog) === row.catalogHash, `corrupt catalog hash: ${row.id}`);
    requireValue(Array.isArray(row.history) && row.history.length > 0, `missing history: ${row.id}`);
  }
}
export function reconcile(snapshot, previous = null, at, seed = null) {
  checkSnapshot(snapshot); requireValue(validDate(at), 'at must be a real UTC ISO timestamp with milliseconds');
  if (previous !== null) checkLedger(previous);
  const hash = snapshotHash(snapshot), current = ids(snapshot.bottles);
  const items = new Map((previous?.items ?? []).map(row => [row.id, structuredClone(row)]));
  for (const catalog of snapshot.bottles) {
    const catalogHash = digest(catalog); let row = items.get(catalog.id);
    if (!row) {
      row = { id: catalog.id, catalog: structuredClone(catalog), catalogHash, status: 'unsearched', present: true,
        priority: catalog.isSignalTracked === true ? 'tracked' : 'normal', requiresReview: false,
        history: [{ event: 'added', at, snapshotHash: hash }] };
      items.set(row.id, row);
    } else {
      if (!row.present) { row.history.push({ event: 'readded', at, snapshotHash: hash }); row.requiresReview = true; }
      if (row.catalogHash !== catalogHash) {
        row.history.push({ event: 'changed', at, snapshotHash: hash, previousCatalog: row.catalog, previousCatalogHash: row.catalogHash });
        row.catalog = structuredClone(catalog); row.catalogHash = catalogHash; row.requiresReview = true;
      }
      row.present = true;
    }
  }
  for (const row of items.values()) if (!current.has(row.id) && row.present) {
    row.present = false; row.requiresReview = true; row.history.push({ event: 'removed', at, snapshotHash: hash });
  }
  const byName = new Map();
  for (const row of snapshot.bottles) {
    const name = row.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
    byName.set(name, [...(byName.get(name) ?? []), row.id]);
  }
  for (const row of items.values()) {
    const name = row.catalog.canonicalName.toLowerCase().replace(/[^a-z0-9]/g, '');
    row.possibleDuplicateIds = sorted((byName.get(name) ?? []).filter(id => id !== row.id));
  }
  const rows = [...items.values()].sort((a,b) => a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
  const statusCounts = Object.fromEntries(STATUSES.map(s => [s, rows.filter(r => r.present && r.status === s).length]));
  const summary = { snapshotTotal: snapshot.total, active: current.size, retainedRemoved: rows.filter(r => !r.present).length,
    totalWorkItems: rows.length, statusCounts, requiresReview: rows.filter(r => r.present && r.requiresReview).length,
    possibleDuplicateRecords: rows.filter(r => r.present && r.possibleDuplicateIds.length).length };
  if (seed !== null) {
    const seedIds = ids(seed);
    summary.seedTotal = seedIds.size;
    summary.seedOnlyIds = sorted([...seedIds].filter(id => !current.has(id)));
    summary.snapshotOnlyIds = sorted([...current].filter(id => !seedIds.has(id)));
  }
  return { schemaVersion: 1, snapshot: { hash, total: snapshot.total, capturedAt: previous?.snapshot?.hash === hash ? previous.snapshot.capturedAt : at }, items: rows, summary };
}
export function readJson(file) { return JSON.parse(fs.readFileSync(file, 'utf8')); }
export function externalOutput(file) {
  const output = path.resolve(file), repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
  const rel = path.relative(repo, output);
  requireValue(rel.startsWith(`..${path.sep}`) || path.isAbsolute(rel), 'data outputs must be outside repository');
  let ancestor = path.dirname(output);
  while (!fs.existsSync(ancestor)) ancestor = path.dirname(ancestor);
  const realRel = path.relative(fs.realpathSync(repo), fs.realpathSync(ancestor));
  requireValue(realRel.startsWith(`..${path.sep}`) || path.isAbsolute(realRel), 'output parent resolves inside repository');
  requireValue(!fs.existsSync(output) || !fs.lstatSync(output).isSymbolicLink(), 'output must not be a symlink');
  return output;
}
export function writeJson(file, value) {
  externalOutput(file); fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  const temp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', { flag: 'wx' });
  try { fs.renameSync(temp, file); } finally { if (fs.existsSync(temp)) fs.unlinkSync(temp); }
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const [snapshotFile, ledgerFile, summaryFile, at, seedFile, ...extra] = process.argv.slice(2);
    requireValue(snapshotFile && ledgerFile && summaryFile && at && !extra.length, 'usage: node inventory.mjs SNAPSHOT LEDGER SUMMARY UTC_TIMESTAMP [SEED]');
    requireValue(new Set([snapshotFile, ledgerFile, summaryFile, seedFile].filter(Boolean).map(p => path.resolve(p).toLowerCase())).size === (seedFile ? 4 : 3), 'paths must be distinct');
    externalOutput(ledgerFile); externalOutput(summaryFile);
    const seedData = seedFile ? readJson(seedFile) : null;
    let previous = null;
    if (fs.existsSync(ledgerFile)) { previous = readJson(ledgerFile); checkLedger(previous); }
    const ledger = reconcile(readJson(snapshotFile), previous, at, seedData ? (Array.isArray(seedData) ? seedData : seedData.bottles) : null);
    writeJson(ledgerFile, ledger); writeJson(summaryFile, { ...ledger.summary, snapshot: ledger.snapshot });
    console.log(JSON.stringify(ledger.summary));
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
