import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRemoteSiteSnapshotReader } from '../src/lib/remote-site-snapshot.ts';

type Row = Record<string, any>;
export const BASELINE_FILES = Object.freeze(['drops', 'stores', 'locations', 'state-health']);
const MAX_SNAPSHOTS = 6, MAX_EVENT_ROWS = 20, MAX_OBJECT_BYTES = 12 * 1024 * 1024, MAX_TOTAL_BYTES = 64 * 1024 * 1024, MAX_ROWS = 100_000;
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
const canonical = (value: any): any => Array.isArray(value) ? value.map(canonical) : value && typeof value === 'object'
  ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const snapshotId = (value: any) => typeof value === 'string' && /^[A-Za-z0-9._:-]{1,180}$/.test(value);
const scalar = (value: any, limit = 240) => typeof value === 'string' ? value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, limit) : '';
const first = (...values: any[]) => values.map(value => scalar(value)).find(Boolean) || '';
const addressKey = (value: string) => value.toLowerCase().replace(/\bavenue\b/g, 'ave').replace(/\bstreet\b/g, 'st').replace(/\bboulevard\b/g, 'blvd')
  .replace(/\broad\b/g, 'rd').replace(/\bsouthwest\b/g, 'sw').replace(/\bsuite\b/g, 'unit').replace(/\bste\b/g, 'unit').replace(/[^a-z0-9]+/g, ' ').trim();
function sourceHost(row: Row) {
  try { const url = new URL(first(row.sourceUrl, row.source_url, row.website)); return url.protocol === 'https:' && !url.username && !url.password ? url.hostname : ''; }
  catch { return ''; }
}

/** Public physical/source fields only; never copy a raw row or product identity. */
export function projectPremise(row: Row, file: string, origin: string, asOf: number, sourceSnapshotId: string | null = null) {
  const address = first(row.storeAddress, row.store_address, row.address);
  const state = first(row.state, row.stateCode, row.state_code).toUpperCase();
  if (!address || !/^[A-Z]{2}$/.test(state)) return null;
  const type = first(row.type, row.eventType, row.event_type).toLowerCase();
  const precision = first(row.locationPrecision, row.location_precision, row.precision);
  const alertEligible = row.canAlertAsInventory === true || row.can_alert_as_inventory === true;
  // Disabling an alert does not erase an earlier physical inventory connection.
  const isInventory = file === 'drops' && precision === 'store_level' && (alertEligible || /retailer_store_inventory|store_inventory|inventory_result/.test(type))
    && !/shipment|warehouse|purchase|lottery|event|catalog/.test(type);
  const at = Date.parse(first(row.lastConfirmedAt, row.last_confirmed_at, row.observedAt, row.observed_at));
  const stale = row.stale === true || row.sourceStale === true || row.source_stale === true || !Number.isFinite(at) || at > asOf || asOf - at > 3600_000;
  const directory = file === 'stores' || file === 'locations' || file === 'registry';
  return { state, address, addressKey: addressKey(address), name: first(row.storeName, row.store_name, directory ? row.name : '', row.locationName),
    city: first(row.city, row.storeCity, row.store_city), zip: first(row.zip, row.postalCode, row.store_postal_code),
    storeId: first(row.storeId, row.store_id, directory ? row.id : ''), sourceId: first(row.sourcePollId, row.sourceRuntimeId, row.sourceLaneId),
    sourceChain: first(row.sourceChain, row.source_chain), sourceLabel: first(row.sourceLabel, row.source), sourceHost: sourceHost(row),
    layer: file === 'stores' || file === 'locations' || file === 'registry' ? 'directory' : isInventory ? 'retailer_inventory' : /shipment|warehouse/.test(type) ? 'intelligence' : 'catalog_or_other',
    inventoryObserved: isInventory, currentWithinOneHour: origin === 'active' && isInventory && alertEligible && !stale,
    staleOrUnconfirmed: isInventory && (stale || !alertEligible || origin !== 'active'),
    sourceSnapshotId, sourceObservedAt: Number.isFinite(at) ? new Date(at).toISOString() : null, origin, file };
}

function healthMatches(value: Row, commit: string, active: string) {
  if (value?.release?.status !== 'healthy' || value.release.commit !== commit || value?.engine?.snapshotId !== active) throw new Error('Live release/snapshot identity mismatch');
}
async function bounded<T>(operation: Promise<T>, ms = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try { return await Promise.race([operation, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error('Baseline read timeout')), ms); })]); }
  finally { clearTimeout(timer!); }
}

/** No collection/writes. Storage exposes read capabilities only. History absence is never a newness proof. */
export async function captureCoveragePremisesBaseline({ storage, encryptionKey, expectedCommit, health, independentSources, history = async () => ({ ids: [], limited: true }), registry = [], now = () => Date.now() }: {
  storage: { readPointer(): Promise<Row | null>; readObject(key: string): Promise<string | null> }; encryptionKey: string; expectedCommit: string;
  health(): Promise<Row>; independentSources?: () => Promise<Row>; history?: () => Promise<{ ids: string[]; limited: boolean; eventCount?: number }>; registry?: Row[]; now?: () => number;
}) {
  if (!/^[a-f0-9]{40}$/.test(expectedCommit)) throw new Error('Exact expected production commit required');
  const pointer = await bounded(storage.readPointer());
  if (!pointer || !snapshotId(pointer.active)) throw new Error('Active pointer missing');
  const pointerHash = hash(JSON.stringify(canonical(pointer))), active = pointer.active;
  healthMatches(await bounded(health()), expectedCommit, active);
  const independent = independentSources ? await bounded(independentSources()) : null;
  if (independent && (independent.contractVersion !== 'bourbon-signal/source-premises-baseline@1' || independent.releaseCommit !== expectedCommit)) throw new Error('Independent source baseline identity mismatch');
  const retained = await bounded(history());
  if (!Array.isArray(retained.ids) || retained.ids.some(id => !snapshotId(id)) || retained.ids.length > MAX_EVENT_ROWS) throw new Error('Invalid bounded history identities');
  const selected = [...new Set([active, ...(snapshotId(pointer.previous) ? [pointer.previous] : []), ...retained.ids])].slice(0, MAX_SNAPSHOTS);
  const rows: Row[] = [], snapshots: Row[] = [], gaps: string[] = [], blockedStates = new Set<string>();
  let bytes = 0, reads = 0;
  for (const id of selected) {
    const descriptors: Row[] = [];
    const startingRows = rows.length;
    let manifestSha256 = '';
    let generatedAt: string | null = null;
    const pinned = { ...pointer, active: id };
    const reader = createRemoteSiteSnapshotReader({ encryptionKey, storage: {
      readPointer: async () => pinned,
      readObject: async key => {
        const prefix = `engine/snapshots/${id}/`;
        if (key !== `${prefix}manifest.json` && !BASELINE_FILES.some(name => key === `${prefix}files/${name}.json.enc`)) throw new Error('Non-whitelisted baseline file');
        if (++reads > MAX_SNAPSHOTS * 8) throw new Error('Baseline request bound exceeded');
        const raw = await bounded(storage.readObject(key));
        if (raw === null) return null;
        bytes += Buffer.byteLength(raw);
        if (Buffer.byteLength(raw) > MAX_OBJECT_BYTES || bytes > MAX_TOTAL_BYTES) throw new Error('Baseline byte bound exceeded');
        if (key.endsWith('/manifest.json')) {
          manifestSha256 = hash(raw);
          const manifest = JSON.parse(raw);
          for (const name of BASELINE_FILES) {
            const descriptor = manifest.files?.[`${name}.json`];
            if (descriptor && !descriptors.some(row => row.name === name)) descriptors.push({ name, bytes: descriptor.bytes, sha256: descriptor.sha256 });
          }
        }
        return raw;
      },
    } });
    try {
      for (const file of BASELINE_FILES) {
        const result = await reader.read(file);
        if (result.snapshotId !== id) throw new Error('Pinned read changed identity');
        generatedAt = result.generatedAt;
        if (file === 'state-health') {
          if (!Array.isArray(result.payload.states)) throw new Error('State health schema missing');
          if (id === active) for (const state of result.payload.states) if (state.health === 'blocked' && /^[A-Z]{2}$/.test(state.state)) blockedStates.add(state.state);
          continue;
        }
        const values = result.payload[file];
        if (!Array.isArray(values)) throw new Error('Baseline row schema missing');
        for (const row of values) {
          const projected = projectPremise(row, file, id === active ? 'active' : 'retained_history', now(), id);
          if (projected) { if (rows.length >= MAX_ROWS) throw new Error('Baseline row bound exceeded'); rows.push(projected); }
        }
      }
      snapshots.push({ snapshotId: id, generatedAt, manifestKey: `engine/snapshots/${id}/manifest.json`, manifestSha256, files: descriptors, complete: true });
    } catch {
      if (id === active) throw new Error('Active baseline unavailable or invalid');
      rows.length = startingRows;
      gaps.push(id); snapshots.push({ snapshotId: id, complete: false });
    }
  }
  for (const row of registry) { const projected = projectPremise(row, 'registry', 'selected_repository_registry', now()); if (projected) { if (rows.length >= MAX_ROWS) throw new Error('Baseline row bound exceeded'); rows.push(projected); } }
  const ending = await bounded(storage.readPointer());
  if (hash(JSON.stringify(canonical(ending))) !== pointerHash) throw new Error('Active pointer changed during baseline');
  healthMatches(await bounded(health()), expectedCommit, active);
  // Deduplicate observations, while preserving each address spelling/unit for alias reconciliation.
  const unique = [...new Map(rows.map(row => {
    if (row.origin === 'active' && row.inventoryObserved && blockedStates.has(row.state)) row = { ...row, currentWithinOneHour: false, staleOrUnconfirmed: true };
    return [JSON.stringify(row), row];
  })).values()];
  return { contractVersion: 'bourbon-signal/premises-baseline@1', capturedAt: new Date(now()).toISOString(), expectedProductionCommit: expectedCommit,
    activeSnapshotId: active, activePointerSha256: pointerHash, provenance: snapshots, readAccounting: { objectReads: reads, encryptedAndManifestBytes: bytes },
    independentSources: independent, independentSourcesMissing: independent === null,
    history: { scope: 'bounded_retained_activation_window', requestedSnapshots: selected.length, eventCount: retained.eventCount ?? null,
      limited: retained.limited || new Set([active, pointer.previous, ...retained.ids].filter(Boolean)).size > MAX_SNAPSHOTS || gaps.length > 0, gaps,
      exhaustiveHistoricalAbsenceProven: false },
    limits: ['Independent scheduler projections are separately timestamped when captured; verified-retailer submissions are excluded.', 'Selected JSON registries do not enumerate every source configuration or address alias.',
      'One-hour raw inventory flag is a conservative classification, not customer feed eligibility or physical stock verification.', 'No matching address is not proof of a new physical store.'],
    premises: unique };
}

async function main() {
  if (process.env.GITHUB_ACTIONS !== 'true' || process.env.GITHUB_REF !== 'refs/heads/main') throw new Error('Credentialed baseline is restricted to reviewed main-branch GitHub Actions execution');
  const { VercelBlobSnapshotStorage } = await import('../src/lib/vercel-blob-snapshot-storage.ts');
  const { list } = await import('@vercel/blob');
  const storage = new VercelBlobSnapshotStorage();
  const registry: Row[] = [];
  const registryFiles: Row[] = [];
  for (const file of (await readdir('engine/data/store-universe')).filter(file => /^[A-Z]{2}\.json$/.test(file)).sort()) {
    const raw = await readFile(`engine/data/store-universe/${file}`, 'utf8');
    const parsed = JSON.parse(raw); registry.push(...(parsed.stores || []).map((row: Row) => ({ ...row, state: row.state || parsed.state })));
    registryFiles.push({ file: `engine/data/store-universe/${file}`, sha256: hash(raw) });
  }
  const result = await captureCoveragePremisesBaseline({ storage, encryptionKey: process.env.ENGINE_SNAPSHOT_ENCRYPTION_KEY || '', expectedCommit: process.env.BASELINE_EXPECTED_COMMIT || '', registry,
    independentSources: async () => {
      if (!process.env.SOURCE_SCHEDULER_SECRET) throw new Error('Independent source read credential missing');
      const response = await fetch('https://www.bourbonsignal.com/api/ops/source-scheduler?read=1&premises=1', {
        headers: { authorization: `Bearer ${process.env.SOURCE_SCHEDULER_SECRET}` }, signal: AbortSignal.timeout(15_000), cache: 'no-store', redirect: 'error',
      });
      if (response.status !== 200) throw new Error('Independent source premises unavailable');
      const raw = await response.text(); if (Buffer.byteLength(raw) > 2 * 1024 * 1024) throw new Error('Independent source premises bound');
      return JSON.parse(raw);
    },
    health: async () => {
      const response = await fetch('https://www.bourbonsignal.com/api/ops/health', { signal: AbortSignal.timeout(15_000), cache: 'no-store' });
      if (![200, 503].includes(response.status)) throw new Error('Health unavailable');
      const raw = await response.text(); if (Buffer.byteLength(raw) > 512 * 1024) throw new Error('Health size bound'); return JSON.parse(raw);
    },
    history: async () => {
      const events = await list({ prefix: 'engine/pointer-events/', limit: MAX_EVENT_ROWS, token: process.env.BLOB_READ_WRITE_TOKEN });
      const ids: string[] = [];
      for (const event of events.blobs.slice(0, MAX_EVENT_ROWS)) {
        if (!/^engine\/pointer-events\/[0-9]{13}-[a-f0-9-]+\.json$/.test(event.pathname)) throw new Error('Invalid pointer event key');
        const raw = await bounded(storage.readObject(event.pathname));
        if (!raw || Buffer.byteLength(raw) > 16_384) throw new Error('Pointer event unavailable');
        const pointer = JSON.parse(raw); if (!snapshotId(pointer.active)) throw new Error('Pointer event missing identity'); ids.push(pointer.active);
      }
      return { ids, limited: events.hasMore, eventCount: events.blobs.length };
    },
  });
  const output = resolve(process.env.BASELINE_OUTPUT || 'out/coverage-premises-baseline.json');
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, JSON.stringify({ ...result, registryFiles, workflowProvenance: { commit: process.env.GITHUB_SHA || null, runId: process.env.GITHUB_RUN_ID || null } }, null, 2) + '\n', { flag: 'wx' });
  console.log(JSON.stringify({ status: 'captured', snapshotId: result.activeSnapshotId, premises: result.premises.length, historicalAbsenceProven: false }));
}
if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) main().catch(() => { console.error('Premises baseline failed closed; no partial baseline or raw payload was exported.'); process.exitCode = 1; });
