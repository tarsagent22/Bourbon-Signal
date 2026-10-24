import { createHash } from 'node:crypto';
import { lstat, mkdir, open, realpath } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const CONTRACT = 'bourbon-signal/tn-cityhive-public-status@1';
export const CACHE_PATH = 'engine/out/browser/TN-cityhive-retailer-inventory.json';
export const OUTPUT_PATH = 'engine/out/optimization/tn-cityhive-public-status.json';
export const MAX_INPUT_BYTES = 4 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 16 * 1024;
export const MERCHANT_IDS = Object.freeze(['5b52b2903ff14a3c5d9cdd19', '5c2a8cae7309395802faf15d']);
const MAX_ROWS = 100_000;
const INPUT_STATES = new Set(['READ', 'MISSING', 'MALFORMED', 'OVERSIZE', 'UNSTABLE', 'UNSAFE_PATH', 'UNREADABLE']);
const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

function clock(value) {
  if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    const ms = Date.parse(value);
    if (Number.isFinite(ms) && new Date(ms).toISOString() === value) return { state: 'RECORDED', value };
  }
  return { state: 'UNKNOWN', value: null };
}

function observations(rows) {
  const values = rows.map((row) => clock(row.observedAt)).filter((entry) => entry.state === 'RECORDED').map((entry) => entry.value).sort();
  return {
    state: values.length ? 'RECORDED_CACHE_OBSERVATIONS' : 'UNKNOWN',
    earliestAt: values[0] ?? null,
    latestAt: values.at(-1) ?? null,
    recordedClockCount: values.length,
    unknownClockCount: rows.length - values.length,
  };
}

// Closed scalar projection: no input object, arbitrary string, URL, or raw error is returned.
// These are cached row types, not independently validated current customer inventory.
export function projectTnCityHivePublicStatus(cache, { now = Date.now(), inputState = 'READ', inputBytes = null, inputSha256 = null } = {}) {
  let state = INPUT_STATES.has(inputState) ? inputState : 'UNREADABLE';
  if (state === 'READ' && (!object(cache) || cache.schemaVersion !== 2 || !Array.isArray(cache.signals))) state = 'MALFORMED';
  if (state === 'READ' && cache.signals.length > MAX_ROWS) state = 'OVERSIZE';
  const usable = state === 'READ';
  const nowClock = clock(typeof now === 'number' && Number.isFinite(now) && Math.abs(now) <= 8.64e15 ? new Date(now).toISOString() : null);
  const generatedAt = clock(usable ? cache.generatedAt : null);
  const maxAgeMs = usable && Number.isSafeInteger(cache.cacheMaxAgeMs) && cache.cacheMaxAgeMs > 0 ? cache.cacheMaxAgeMs : null;
  const ageMs = nowClock.state === 'RECORDED' && generatedAt.state === 'RECORDED' ? now - Date.parse(generatedAt.value) : null;
  const ageState = ageMs === null || maxAgeMs === null ? 'UNKNOWN' : ageMs < 0 ? 'FUTURE_CLOCK' : ageMs <= maxAgeMs ? 'WITHIN_RECORDED_CACHE_AGE' : 'EXCEEDS_RECORDED_CACHE_AGE';
  const rows = usable ? cache.signals : [];
  const matching = (row, id) => object(row) && row.sourceChain === 'corkdorks'
    && row.merchantId === id && row.storeId === `corkdorks:${id}`
    && (row.state === 'TN' || row.stateCode === 'TN')
    && (row.state === undefined || row.state === 'TN' || row.state === 'Tennessee')
    && (row.stateCode === undefined || row.stateCode === 'TN')
    && (!object(row.raw) || row.raw.chain === undefined || row.raw.chain === 'corkdorks')
    && (!object(row.raw) || row.raw.merchantId === undefined || row.raw.merchantId === id);
  const merchants = MERCHANT_IDS.map((merchantId) => {
    const scoped = rows.filter((row) => matching(row, merchantId));
    return {
      merchantId,
      storeId: `corkdorks:${merchantId}`,
      state: !usable || !scoped.length ? 'UNKNOWN' : 'CACHE_ROWS_RECORDED',
      cachedRowCount: usable ? scoped.length : null,
      inventoryTypedRowCount: usable ? scoped.filter((row) => row.eventType === 'cityhive_store_inventory_result').length : null,
      locationTypedRowCount: usable ? scoped.filter((row) => row.eventType === 'retailer_store_location').length : null,
      otherTypedRowCount: usable ? scoped.filter((row) => !['cityhive_store_inventory_result', 'retailer_store_location'].includes(row.eventType)).length : null,
      observations: observations(scoped),
      merchantHttpStatus: 'UNKNOWN',
      merchantCooldown: 'UNKNOWN',
      currentInventory: 'UNKNOWN',
    };
  });
  return {
    contract: CONTRACT,
    projectedAt: nowClock,
    input: {
      state,
      bytes: Number.isSafeInteger(inputBytes) && inputBytes >= 0 && inputBytes <= MAX_INPUT_BYTES ? inputBytes : null,
      sha256: typeof inputSha256 === 'string' && /^[a-f0-9]{64}$/.test(inputSha256) ? inputSha256 : null,
    },
    sourceId: 'corkdorks',
    clockScope: 'RECORDED_SOURCE_CHAIN_MAP_NOT_MERCHANT_HTTP',
    sourceAttemptAt: clock(usable && object(cache.sourceAttemptAt) ? cache.sourceAttemptAt.corkdorks : null),
    sourceRefreshAt: clock(usable && object(cache.sourceRefreshAt) ? cache.sourceRefreshAt.corkdorks : null),
    cache: { generatedAt, recordedMaxAgeMs: maxAgeMs, ageMs, ageState },
    merchants,
    inventoryValidation: 'NOT_PERFORMED',
    completeness: 'TWO_FIXED_MERCHANT_CACHE_ROWS_ONLY',
  };
}

const sameFile = (a, b) => ['dev', 'ino', 'size', 'mtimeNs', 'ctimeNs'].every((key) => a[key] === b[key]);
const samePath = (a, b) => process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;

// root is derived from this module's location by the CLI; it is not a CLI input.
// Exported only so tests can use an isolated fake repository and injected filesystem races.
export async function readFixedTnCache(root, { io = { lstat, realpath, open } } = {}) {
  let handle;
  try {
    const base = await io.realpath(root);
    const filename = path.resolve(base, CACHE_PATH);
    const beforePath = await io.lstat(filename, { bigint: true });
    if (!beforePath.isFile() || beforePath.isSymbolicLink() || !samePath(await io.realpath(filename), filename)) return { inputState: 'UNSAFE_PATH' };
    if (beforePath.size > BigInt(MAX_INPUT_BYTES)) return { inputState: 'OVERSIZE' };
    handle = await io.open(filename, 'r');
    const before = await handle.stat({ bigint: true });
    if (!before.isFile() || !sameFile(beforePath, before)) return { inputState: 'UNSTABLE' };
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let count = 0;
    while (count < bytes.length) {
      const result = await handle.read(bytes, count, bytes.length - count, count);
      if (!result.bytesRead) break;
      count += result.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    const afterPath = await io.lstat(filename, { bigint: true });
    if (count !== Number(before.size) || !sameFile(before, after) || !sameFile(after, afterPath)
      || afterPath.isSymbolicLink() || !samePath(await io.realpath(filename), filename)) return { inputState: 'UNSTABLE' };
    const body = bytes.subarray(0, count);
    const provenance = { inputBytes: count, inputSha256: createHash('sha256').update(body).digest('hex') };
    try {
      // Fatal UTF-8 decoding prevents replacement characters silently changing input evidence.
      return { cache: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(body)), inputState: 'READ', ...provenance };
    } catch {
      return { inputState: 'MALFORMED', ...provenance };
    }
  } catch (error) {
    return { inputState: error?.code === 'ENOENT' ? 'MISSING' : 'UNREADABLE' };
  } finally {
    await handle?.close().catch(() => {});
  }
}

export async function runFixedProjection(root, { now = Date.now() } = {}) {
  const read = await readFixedTnCache(root);
  const report = projectTnCityHivePublicStatus(read.cache, { now, ...read });
  const body = `${JSON.stringify(report, null, 2)}\n`;
  if (Buffer.byteLength(body) > MAX_OUTPUT_BYTES) return 'OUTPUT_BOUND_EXCEEDED';
  try {
    const base = await realpath(root);
    let directory = base;
    for (const component of path.dirname(OUTPUT_PATH).split('/')) {
      directory = path.join(directory, component);
      try { await mkdir(directory); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
      const info = await lstat(directory);
      if (!info.isDirectory() || info.isSymbolicLink() || !samePath(await realpath(directory), directory)) return 'UNSAFE_OUTPUT_PATH';
    }
    const output = await open(path.resolve(base, OUTPUT_PATH), 'wx', 0o600);
    try { await output.writeFile(body); await output.sync(); } finally { await output.close(); }
    return 'CREATED';
  } catch (error) {
    return error?.code === 'EEXIST' ? 'OUTPUT_ALREADY_EXISTS' : 'OUTPUT_UNAVAILABLE';
  }
}

if (process.argv[1] && samePath(path.resolve(process.argv[1]), fileURLToPath(import.meta.url))) {
  if (process.argv.length !== 2) {
    process.stderr.write('No arguments are accepted. Fixed local projection only.\n');
    process.exitCode = 1;
  } else {
    const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
    // Diagnostic failure must not change normal collection success or write its cache.
    const status = await runFixedProjection(root).catch(() => 'OUTPUT_UNAVAILABLE');
    process.stdout.write(`${status}\n`);
  }
}
