import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, readFile, stat, lstat, realpath, open, copyFile, symlink, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  CONTRACT, CACHE_PATH, OUTPUT_PATH, MAX_INPUT_BYTES, MAX_OUTPUT_BYTES, MERCHANT_IDS,
  projectTnCityHivePublicStatus, readFixedTnCache, runFixedProjection,
} from './project-tn-cityhive-public-status.mjs';

const NOW = Date.parse('2026-10-24T15:30:00.000Z');
const OBSERVED = '2026-10-24T12:00:32.352Z';
const ATTEMPT = '2026-10-24T15:00:00.000Z';
const REFRESH = '2026-10-24T12:00:00.000Z';
const hash = (body) => createHash('sha256').update(body).digest('hex');
const row = (merchantId = MERCHANT_IDS[0], extra = {}) => ({
  state: 'Tennessee', stateCode: 'TN', sourceChain: 'corkdorks', merchantId,
  storeId: `corkdorks:${merchantId}`, eventType: 'cityhive_store_inventory_result', observedAt: OBSERVED, ...extra,
});
const cache = (extra = {}) => ({
  schemaVersion: 2, generatedAt: OBSERVED, cacheMaxAgeMs: 36_000_000,
  sourceAttemptAt: { corkdorks: ATTEMPT }, sourceRefreshAt: { corkdorks: REFRESH },
  signals: [row(), row(MERCHANT_IDS[1]), row(MERCHANT_IDS[1], { eventType: 'retailer_store_location' })], ...extra,
});
async function fixture(t, value) {
  const root = await mkdtemp(path.join(tmpdir(), 'tn-public-status-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  if (value !== undefined) {
    await mkdir(path.dirname(path.join(root, CACHE_PATH)), { recursive: true });
    await writeFile(path.join(root, CACHE_PATH), typeof value === 'string' || Buffer.isBuffer(value) ? value : JSON.stringify(value));
  }
  return root;
}

test('explicit chain clocks, merchant row types and observation clocks stay distinct', () => {
  const report = projectTnCityHivePublicStatus(cache(), { now: NOW });
  assert.equal(report.contract, CONTRACT);
  assert.equal(report.sourceAttemptAt.value, ATTEMPT);
  assert.equal(report.sourceRefreshAt.value, REFRESH);
  assert.equal(report.cache.generatedAt.value, OBSERVED);
  assert.equal(report.cache.recordedMaxAgeMs, 36_000_000);
  assert.equal(report.cache.ageMs, NOW - Date.parse(OBSERVED));
  assert.equal(report.cache.ageState, 'WITHIN_RECORDED_CACHE_AGE');
  assert.equal(report.merchants[0].inventoryTypedRowCount, 1);
  assert.equal(report.merchants[1].inventoryTypedRowCount, 1);
  assert.equal(report.merchants[1].locationTypedRowCount, 1);
  for (const merchant of report.merchants) {
    assert.equal(merchant.observations.latestAt, OBSERVED);
    assert.equal(merchant.currentInventory, 'UNKNOWN');
    assert.equal(merchant.merchantHttpStatus, 'UNKNOWN');
    assert.equal(merchant.merchantCooldown, 'UNKNOWN');
  }
});

test('private canaries and arbitrary keys never cross the closed scalar projection', () => {
  const PRIVATE = 'PRIVATE_CANARY_USER_PRODUCT_SECRET_917382';
  const report = projectTnCityHivePublicStatus(cache({
    secret: PRIVATE, users: [{ email: PRIVATE }], roadblocks: [PRIVATE],
    sourceAttemptAt: { corkdorks: PRIVATE, [PRIVATE]: PRIVATE },
    signals: [row(MERCHANT_IDS[0], { sourceUrl: `https://private.invalid/${PRIVATE}`, quantity: 99, rawName: PRIVATE, raw: { chain: 'corkdorks', user: PRIVATE }, evidence: PRIVATE })],
  }), { now: NOW });
  const serialized = JSON.stringify(report);
  assert.ok(!serialized.includes(PRIVATE));
  assert.ok(!serialized.includes('https:'));
  assert.ok(!serialized.includes('quantity'));
  assert.equal(report.sourceAttemptAt.state, 'UNKNOWN');
  assert.ok(Buffer.byteLength(serialized) < MAX_OUTPUT_BYTES);
});

test('observed/cache clocks never fill missing explicit attempt or refresh maps', () => {
  const report = projectTnCityHivePublicStatus(cache({ sourceAttemptAt: undefined, sourceRefreshAt: undefined }), { now: NOW });
  assert.deepEqual(report.sourceAttemptAt, { state: 'UNKNOWN', value: null });
  assert.deepEqual(report.sourceRefreshAt, { state: 'UNKNOWN', value: null });
  assert.equal(report.merchants[0].observations.latestAt, OBSERVED);
});

test('expired, future and missing cache policy never become HTTP, cooldown or inventory claims', () => {
  for (const patch of [{ cacheMaxAgeMs: 1 }, { generatedAt: '2026-10-25T12:00:00.000Z' }, { cacheMaxAgeMs: undefined }, { generatedAt: '2026-02-30T12:00:00.000Z' }]) {
    const report = projectTnCityHivePublicStatus(cache(patch), { now: NOW });
    assert.notEqual(report.cache.ageState, 'WITHIN_RECORDED_CACHE_AGE');
    assert.equal(report.merchants[0].currentInventory, 'UNKNOWN');
    assert.equal(report.merchants[0].merchantCooldown, 'UNKNOWN');
  }
  assert.equal(projectTnCityHivePublicStatus(cache(), { now: NaN }).projectedAt.state, 'UNKNOWN');
});

test('wrong merchant, source, store, state and conflicting raw IDs are excluded', () => {
  const report = projectTnCityHivePublicStatus(cache({ signals: [
    row('unreviewed'), row(MERCHANT_IDS[0], { storeId: `corkdorks:${MERCHANT_IDS[1]}` }),
    row(MERCHANT_IDS[0], { sourceChain: 'other' }), row(MERCHANT_IDS[0], { stateCode: 'KY' }),
    row(MERCHANT_IDS[0], { raw: { merchantId: MERCHANT_IDS[1] } }), row(MERCHANT_IDS[0], { raw: { chain: 'other' } }),
  ] }), { now: NOW });
  assert.equal(report.merchants.length, 2);
  for (const merchant of report.merchants) {
    assert.equal(merchant.cachedRowCount, 0);
    assert.equal(merchant.state, 'UNKNOWN');
  }
});

test('location and malformed observation rows are counted honestly, never as inventory', () => {
  const report = projectTnCityHivePublicStatus(cache({ signals: [row(MERCHANT_IDS[0], { eventType: 'retailer_store_location', observedAt: 'bad' })] }), { now: NOW });
  assert.equal(report.merchants[0].inventoryTypedRowCount, 0);
  assert.equal(report.merchants[0].locationTypedRowCount, 1);
  assert.equal(report.merchants[0].observations.state, 'UNKNOWN');
  assert.equal(report.merchants[0].observations.unknownClockCount, 1);
});

test('bounded reader binds the actual raw bytes/hash and leaves cache unchanged', async (t) => {
  const root = await fixture(t, cache());
  const filename = path.join(root, CACHE_PATH);
  const original = await readFile(filename);
  const originalStat = await stat(filename);
  const result = await readFixedTnCache(root);
  assert.equal(result.inputState, 'READ');
  assert.equal(result.inputSha256, hash(original));
  assert.equal(result.inputBytes, original.length);
  assert.equal(await runFixedProjection(root, { now: NOW }), 'CREATED');
  const output = await readFile(path.join(root, OUTPUT_PATH));
  assert.ok(output.length <= MAX_OUTPUT_BYTES);
  assert.equal(JSON.parse(output).input.sha256, hash(original));
  assert.deepEqual(await readFile(filename), original);
  assert.equal((await stat(filename)).mtimeMs, originalStat.mtimeMs);
});

test('missing, malformed, invalid UTF8 and unsupported schema produce labeled UNKNOWN artifacts', async (t) => {
  for (const [value, expected] of [[undefined, 'MISSING'], ['{broken', 'MALFORMED'], [Buffer.from([0xff]), 'MALFORMED'], [{ schemaVersion: 1, signals: [] }, 'MALFORMED']]) {
    const root = await fixture(t, value);
    assert.equal(await runFixedProjection(root, { now: NOW }), 'CREATED');
    const report = JSON.parse(await readFile(path.join(root, OUTPUT_PATH), 'utf8'));
    assert.equal(report.input.state, expected);
    assert.equal(report.sourceAttemptAt.state, 'UNKNOWN');
    assert.equal(report.merchants[0].cachedRowCount, null);
  }
});

test('oversize is rejected before open/read/parse', async (t) => {
  const root = await fixture(t, Buffer.alloc(MAX_INPUT_BYTES + 1, 0x20));
  let opened = false;
  const result = await readFixedTnCache(root, { io: { lstat, realpath, open: async () => { opened = true; throw new Error('must not open'); } } });
  assert.equal(result.inputState, 'OVERSIZE');
  assert.equal(opened, false);
  assert.equal(result.cache, undefined);
});

test('changed size/clock or path identity after read discards the entire cache', async (t) => {
  const root = await fixture(t, cache());
  let stats = 0;
  const io = {
    lstat, realpath,
    open: async (...args) => {
      const handle = await open(...args);
      return {
        read: (...readArgs) => handle.read(...readArgs), close: () => handle.close(),
        stat: async (...statArgs) => {
          const info = await handle.stat(...statArgs);
          if (++stats === 2) info.mtimeNs += 1n;
          return info;
        },
      };
    },
  };
  const result = await readFixedTnCache(root, { io });
  assert.equal(result.inputState, 'UNSTABLE');
  assert.equal(result.cache, undefined);
  assert.equal(result.inputSha256, undefined);
});

test('a replaced path after a stable handle read is rejected without parsing', async (t) => {
  const root = await fixture(t, cache());
  let pathStats = 0;
  const result = await readFixedTnCache(root, { io: {
    realpath, open,
    lstat: async (...args) => {
      const info = await lstat(...args);
      if (++pathStats === 2) info.ino += 1n;
      return info;
    },
  } });
  assert.equal(result.inputState, 'UNSTABLE');
  assert.equal(result.cache, undefined);
});

test('logical row bound rejects the complete projection rather than truncating counts', () => {
  const report = projectTnCityHivePublicStatus(cache({ signals: Array(100_001).fill(row()) }), { now: NOW });
  assert.equal(report.input.state, 'OVERSIZE');
  assert.equal(report.merchants[0].cachedRowCount, null);
});

test('create-only artifact is never overwritten, including a corrupt existing artifact', async (t) => {
  const root = await fixture(t, cache());
  await mkdir(path.dirname(path.join(root, OUTPUT_PATH)), { recursive: true });
  await writeFile(path.join(root, OUTPUT_PATH), 'immutable existing bytes');
  assert.equal(await runFixedProjection(root), 'OUTPUT_ALREADY_EXISTS');
  assert.equal(await readFile(path.join(root, OUTPUT_PATH), 'utf8'), 'immutable existing bytes');
});

test('fixed-path CLI accepts no path/live flags and missing cache does not fail collection', async (t) => {
  const root = await fixture(t);
  await mkdir(path.join(root, 'scripts'));
  const script = path.join(root, 'scripts/project-tn-cityhive-public-status.mjs');
  await copyFile(fileURLToPath(new URL('./project-tn-cityhive-public-status.mjs', import.meta.url)), script);
  for (const arg of ['--input=private.json', '--out=elsewhere.json', '--live', '--activate']) {
    const result = spawnSync(process.execPath, [script, arg], { encoding: 'utf8' });
    assert.equal(result.status, 1);
    await assert.rejects(readFile(path.join(root, OUTPUT_PATH)), { code: 'ENOENT' });
  }
  const result = spawnSync(process.execPath, [script], { cwd: tmpdir(), encoding: 'utf8' });
  assert.equal(result.status, 0);
  assert.equal(JSON.parse(await readFile(path.join(root, OUTPUT_PATH), 'utf8')).input.state, 'MISSING');
});

test('file symlink input cannot redirect reads', async (t) => {
  const root = await fixture(t);
  const outside = await fixture(t, cache());
  await mkdir(path.dirname(path.join(root, CACHE_PATH)), { recursive: true });
  try { await symlink(path.join(outside, CACHE_PATH), path.join(root, CACHE_PATH), 'file'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) return t.skip('Host disallows file symlinks'); throw error; }
  assert.equal((await readFixedTnCache(root)).inputState, 'UNSAFE_PATH');
});

test('directory symlink/junction output cannot redirect artifact writes', async (t) => {
  const root = await fixture(t, cache());
  const outside = await fixture(t);
  await symlink(outside, path.dirname(path.join(root, OUTPUT_PATH)), process.platform === 'win32' ? 'junction' : 'dir');
  assert.equal(await runFixedProjection(root), 'UNSAFE_OUTPUT_PATH');
  await assert.rejects(readFile(path.join(outside, 'tn-cityhive-public-status.json')), { code: 'ENOENT' });
});

test('implementation has no network, credential/environment reads, imports of collection or cache writes', async () => {
  const source = await readFile(new URL('./project-tn-cityhive-public-status.mjs', import.meta.url), 'utf8');
  assert.ok(!/process\.env|fetch\s*\(|https?:\/\/|node:(?:http|https|child_process)|precision-probes|writeFile\(filename|open\(filename,\s*['"](?:w|a)/.test(source));
});
