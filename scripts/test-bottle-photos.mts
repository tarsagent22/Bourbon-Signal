import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
const root = new URL('../', import.meta.url);
const load = () => import(new URL('./stage-bottle-photos.mts', import.meta.url).href);
const read = (path: string) => readFileSync(new URL(path, root));
const json = (path: string) => JSON.parse(read(path).toString());
const hash = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const catalog = () => json('apps/mobile/src/cellar/bottle-catalog-seed.json');
const approved = () => json('scripts/fixtures/first50-photo-approvals.json');
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

test('all 50 approved mappings and 45 hashes are exactly staged, not imported into mobile', () => {
  const registry = json('public/bottle-photos/registry.v1.json');
  assert.equal(registry.schemaVersion, 1);
  assert.equal(registry.entries.length, 50);
  assert.deepEqual(registry.entries.map(({ catalogId, displayName, sha256 }: any) => ({ catalogId, displayName, sha256 })), approved());
  assert.equal(new Set(registry.entries.map((r: any) => r.sha256)).size, 45);
  assert.equal(readdirSync(new URL('public/bottle-photos/', root)).filter(n => n.endsWith('.png')).length, 45);
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
  assert.equal(result.registry.entries.length, 50);
  assert.equal(result.assets.size, 45);
  assert.equal(result.privateAudit.length, 50);
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
