import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, readFile, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { loadShopifyBatchInputs } from './prepare-shopify-onboarding.mts';
const exec = promisify(execFile);
const cli = fileURLToPath(new URL('./prepare-shopify-onboarding.mts', import.meta.url));
const repo = fileURLToPath(new URL('../', import.meta.url));

async function fixture(run: (input: any) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), 'bs-shopify-local-input-'));
  try {
    const source = JSON.parse(await readFile(new URL('../engine/data/shopify-pickup-onboarding-cohort-v2.json', import.meta.url), 'utf8')).sources[0];
    await mkdir(join(root, 'evidence'));
    await writeFile(join(root, 'manifest.json'), JSON.stringify({ schemaVersion: 1, sources: [source] }));
    await writeFile(join(root, 'catalog.json'), '{"records":[]}');
    await writeFile(join(root, 'classification.json'), '{"records":[]}');
    const capture = { requestedUrl: source.products[0].evidence.product.url, finalUrl: source.products[0].evidence.product.url,
      status: 200, capturedAt: source.products[0].evidence.product.capturedAt, sha256: 'a'.repeat(64), bytes: 2, file: 'product.json' };
    await writeFile(join(root, 'evidence', 'product.json'), '{}');
    await writeFile(join(root, 'evidence', 'manifest.json'), JSON.stringify({ captures: [capture] }));
    const options = { root, manifestFile: 'manifest.json', catalogFile: 'catalog.json', classificationFile: 'classification.json', captureManifestFiles: ['evidence/manifest.json'] };
    await run({ root, source, capture, options });
  } finally {
    const target = resolve(root), temporaryRoot = resolve(tmpdir());
    if (dirname(target) !== temporaryRoot || !basename(target).startsWith('bs-shopify-local-input-')) throw new Error('Temporary test cleanup escaped its verified directory');
    await rm(target, { recursive: true, force: true });
  }
}

test('loader returns exact local bytes and implementation pin without network or environment access', async () => fixture(async ({ options }) => {
  const original = globalThis.fetch;
  globalThis.fetch = (() => { throw Error('Network is forbidden in evidence loading'); }) as any;
  try {
    const input = await loadShopifyBatchInputs(options);
    assert.equal(input.captures.length, 1); assert.equal(input.captures[0].body.toString('utf8'), '{}');
    const actual = await readFile(new URL('../engine/src/collectors/shopify-variant-pickup.mjs', import.meta.url));
    assert.equal(createHash('sha256').update(input.collectorBytes).digest('hex'), createHash('sha256').update(actual).digest('hex'));
  } finally { globalThis.fetch = original; }
}));

for (const name of ['../private.json', '..\\private.json', '/private.json', 'https://example.invalid/private', 'nested/product.json']) {
  test(`capture metadata cannot load arbitrary private path: ${name}`, async () => fixture(async ({ root, capture, options }) => {
    await writeFile(join(root, 'private.json'), 'PRIVATE_ACCOUNT_DATA');
    await writeFile(join(root, 'evidence', 'manifest.json'), JSON.stringify({ captures: [{ ...capture, file: name }] }));
    await assert.rejects(() => loadShopifyBatchInputs(options), /basename|directory/);
  }));
}

test('out-of-directory symlink cannot smuggle a private input through a safe basename', async t => fixture(async ({ root, capture, options }) => {
  await writeFile(join(root, 'private.json'), 'PRIVATE_ACCOUNT_DATA');
  await rm(join(root, 'evidence', 'product.json'));
  try { await symlink(join(root, 'private.json'), join(root, 'evidence', 'product.json'), 'file'); }
  catch (error: any) { if (['EPERM', 'EACCES'].includes(error.code)) { t.skip('Host cannot create a file symlink'); return; } throw error; }
  await assert.rejects(() => loadShopifyBatchInputs(options), /directory/);
}));

test('oversized bodies and unbounded/duplicate capture-manifest lists fail closed', async () => fixture(async ({ root, options }) => {
  await writeFile(join(root, 'evidence', 'product.json'), Buffer.alloc(2 * 1024 * 1024 + 1));
  await assert.rejects(() => loadShopifyBatchInputs(options), /budget/);
  await assert.rejects(() => loadShopifyBatchInputs({ ...options, captureManifestFiles: [] }), /manifest/);
  await assert.rejects(() => loadShopifyBatchInputs({ ...options, captureManifestFiles: Array(5).fill('evidence/manifest.json') }), /manifest/);
  await assert.rejects(() => loadShopifyBatchInputs({ ...options, captureManifestFiles: ['evidence/manifest.json', 'evidence/manifest.json'] }), /manifest/);
}));

test('unused manifest entries cannot cause unrelated body files to be read', async () => fixture(async ({ root, capture, options }) => {
  await writeFile(join(root, 'evidence', 'manifest.json'), JSON.stringify({ captures: [capture, { ...capture, requestedUrl: 'https://unrelated.invalid/secret', file: '../private.json' }] }));
  const input = await loadShopifyBatchInputs(options); assert.equal(input.captures.length, 1);
}));

test('invalid empty batch writes a truthful rejected report and exits nonzero', async () => fixture(async ({ root }) => {
  const manifest = join(root, 'empty.json'), out = join(root, 'report.json');
  await writeFile(manifest, '{"schemaVersion":1,"sources":[]}');
  await assert.rejects(() => exec(process.execPath, ['--import', 'tsx', cli, `--manifest=${manifest}`, `--out=${out}`], { cwd: repo, windowsHide: true }), (error: any) => error.code === 1);
  const report = JSON.parse(await readFile(out, 'utf8'));
  assert.equal(report.accepted, 0); assert.equal(report.activated, false); assert.ok(report.blockers.length);
}));

test('valid V3 cohort is one command, pending gates are explicit, and an existing report cannot be overwritten', async () => fixture(async ({ root }) => {
  const out = join(root, 'report.json');
  const result = await exec(process.execPath, ['--import', 'tsx', cli, `--out=${out}`], { cwd: repo, windowsHide: true });
  assert.equal(JSON.parse(result.stdout).counts.fixtureCompatibleSources, 5);
  const saved = await readFile(out), report = JSON.parse(saved.toString('utf8'));
  assert.equal(report.accepted, 0); assert.equal(report.activated, false); assert.equal(report.counts.liveRequests, 0);
  assert.ok(report.sources.every((source: any) => source.stores.every((store: any) => store.blockers.includes('explicit_admission_pending'))));
  await assert.rejects(() => exec(process.execPath, ['--import', 'tsx', cli, `--out=${out}`], { cwd: repo, windowsHide: true }));
  assert.deepEqual(await readFile(out), saved);
}));

test('unsupported live or activation mode is rejected before producing a report', async () => fixture(async ({ root }) => {
  for (const option of ['--live=1', '--activate=1']) {
    await assert.rejects(() => exec(process.execPath, ['--import', 'tsx', cli, option, `--out=${join(root, 'forbidden.json')}`], { cwd: repo, windowsHide: true }));
    await assert.rejects(() => readFile(join(root, 'forbidden.json')), { code: 'ENOENT' });
  }
}));
