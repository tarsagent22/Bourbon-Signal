import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

test('staging CLI rejects inside-repository private audit paths before reading inputs or writing', () => {
  const cwd = fileURLToPath(new URL('../', import.meta.url));
  for (const name of ['..private-audit.json', '..private/audit.json', 'public/private-audit.json']) {
    // The intentionally missing input prevents writes even against the old faulty gate.
    const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/stage-bottle-photos.mts',
      '__missing_first50_regression_manifest__.json', resolve(cwd, name)], { cwd, encoding: 'utf8' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Error: Private audit must be outside repository/, name);
  }
});
const root = new URL('../', import.meta.url);
const load = () => import(new URL('./stage-bottle-photos.mts', import.meta.url).href);
const read = (path: string) => readFileSync(new URL(path, root));
const json = (path: string) => JSON.parse(read(path).toString());
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const catalog = () => json('apps/mobile/src/cellar/bottle-catalog-seed.json');
const first50 = () => json('scripts/fixtures/first50-photo-approvals.json');
const wave02 = () => json('scripts/fixtures/wave02-photo-approvals.json');
const approved = () => [...first50(), ...wave02()];
const approvedHashes = () => new Set(approved().map((r: any) => r.sha256)).size;
function privateRows() {
  return approved().map((r: any) => ({ catalogId: r.catalogId, catalogName: r.displayName, sha256: r.sha256,
    path: `public/bottle-photos/${r.sha256}.png`, bytes: read(`public/bottle-photos/${r.sha256}.png`).length,
    width: 400, height: 600, rightsStatus: 'unverified', ownerDeferredLicensing: true,
    identityReviewed: true, visualReviewed: true, reviewedAt: '2026-09-09T14:12:15Z', reviewEvidence: ['private-review.jpg'],
    sourcePage: 'https://source.test/product', originalPath: 'private-original',
  }));
}

test('publication validator exists before staging images', async () => {
  const api = await load().catch(() => null);
  assert.equal(typeof api?.buildPhotoPublication, 'function', 'missing reviewed publication gate');
});

test('cumulative approved batches are exactly staged, preserving all first50 mappings and hashes', () => {
  const registry = json('public/bottle-photos/registry.v1.json');
  assert.equal(registry.schemaVersion, 1);
  assert.equal(first50().length, 50);
  assert.equal(wave02().length, 39);
  assert.equal(new Set(approved().map((r: any) => r.catalogId)).size, approved().length);
  assert.equal(registry.entries.length, approved().length);
  assert.deepEqual(registry.entries.slice(0, 50).map(({ catalogId, displayName, sha256 }: any) => ({ catalogId, displayName, sha256 })), first50());
  assert.deepEqual(registry.entries.map(({ catalogId, displayName, sha256 }: any) => ({ catalogId, displayName, sha256 })), approved());
  assert.equal(new Set(registry.entries.map((r: any) => r.sha256)).size, approvedHashes());
  assert.equal(readdirSync(new URL('public/bottle-photos/', root)).filter(n => n.endsWith('.png')).length, approvedHashes());
  assert.equal(registry.revision, hash(Buffer.from(JSON.stringify(registry.entries))));
  for (const r of registry.entries) {
    const bytes = read(`public/bottle-photos/${r.sha256}.png`);
    assert.equal(hash(bytes), r.sha256);
    assert.equal(bytes.readUInt32BE(16), 400);
    assert.equal(bytes.readUInt32BE(20), 600);
    assert.equal(bytes[25], 6);
    assert.ok(bytes.length < 500_000);
  }
  assert.ok(read('next.config.ts').toString().includes('/bottle-photos/:hash([a-f0-9]{64}).png'));
  const mobile = read('apps/mobile/src/bottle-photos/native.ts').toString();
  assert.ok(!mobile.includes('registry.v1.json";'));
  assert.ok(!mobile.includes('public/bottle-photos'));
});

test('private unverified rights remain distinct from owner deferral; public projection excludes provenance', async () => {
  const { buildPhotoPublication } = await load();
  const rows = privateRows();
  const result = buildPhotoPublication(rows, catalog(), (path: string) => read(path));
  assert.equal(result.registry.entries.length, approved().length);
  assert.equal(result.assets.size, approvedHashes());
  assert.equal(result.privateAudit.length, approved().length);
  for (const row of result.privateAudit) {
    assert.equal(row.rightsStatus, 'unverified');
    assert.equal(row.ownerDeferredLicensing, true);
  }
  assert.deepEqual(result.registry, json('public/bottle-photos/registry.v1.json'));
  const publicText = JSON.stringify(result.registry);
  for (const secret of ['sourcePage', 'originalPath', 'reviewEvidence', 'rightsStatus', 'ownerDeferredLicensing', 'private-', 'account', 'C:\\']) assert.ok(!publicText.includes(secret), secret);
  assert.equal(rows[0].rightsStatus, 'unverified');
});

test('publication rejects missing reviews, false cleared rights, hash/identity/PNG mismatches before any writes', async () => {
  const { buildPhotoPublication } = await load();
  for (const change of [
    { rightsStatus: 'cleared' }, { ownerDeferredLicensing: false }, { identityReviewed: false }, { visualReviewed: false },
    { reviewEvidence: [] }, { reviewedAt: '' }, { sha256: '0'.repeat(64) }, { width: 401 }, { bytes: 1 },
    { catalogName: 'Wrong edition' }, { catalogId: 'unknown' },
  ]) {
    const rows = privateRows(); rows[0] = { ...rows[0], ...change };
    assert.throws(() => buildPhotoPublication(rows, catalog(), (path: string) => read(path)), JSON.stringify(change));
  }
  const rows = privateRows();
  assert.throws(() => buildPhotoPublication([...rows, rows[0]], catalog(), (path: string) => read(path)));
  assert.throws(() => buildPhotoPublication(rows, catalog(), () => Buffer.from('not a PNG')));
});

test('publication permits shared identical photos but rejects same-name differing-image ambiguity', async () => {
  const { buildPhotoPublication } = await load();
  const rows = privateRows();
  const other = { ...rows[0], catalogId: 'another-reviewed-id' };
  const known = [...catalog(), { id: other.catalogId, name: other.catalogName }];
  assert.equal(buildPhotoPublication([rows[0], other], known, (path: string) => read(path)).assets.size, 1);
  const different = { ...rows[1], catalogId: other.catalogId, catalogName: other.catalogName };
  assert.throws(() => buildPhotoPublication([rows[0], different], known, (path: string) => read(path)), /ambiguity/i);
});

test('server catalog attaches same shared exact photo metadata without lossy key lookup', async () => {
  const api = await import(new URL('../src/lib/bottle-photos.ts', import.meta.url).href).then(m => m.default ?? m).catch(() => null);
  assert.equal(typeof api?.catalogBottlePhoto, 'function', 'missing catalog photo adapter');
  for (const row of approved()) assert.equal(api.catalogBottlePhoto({ id: row.catalogId, canonicalName: row.displayName })?.sha256, row.sha256);
  assert.equal(api.catalogBottlePhoto({ id: 'eagle-rare-10', canonicalName: 'Eagle Rare 17 Year' }), undefined);
  assert.match(read('src/lib/bourbonBible.ts').toString(), /photo: catalogBottlePhoto\(bottle\)/);
  assert.match(read('src/app/api/bottle-catalog/route.ts').toString(), /photo: bottle.photo/);
});

test('public static registry bypasses auth middleware, while member routes stay protected', () => {
  const middleware = read('src/middleware.ts').toString();
  assert.ok(middleware.includes('bottle-photos/registry[.]v1[.]json$'), 'exact public registry must not require Clerk');
  assert.ok(middleware.includes('"/api/bottles(.*)"'));
  assert.ok(middleware.includes('"/dashboard(.*)"'));
});
