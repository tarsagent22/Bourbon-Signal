import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import catalog from '../cellar/bottle-catalog-seed.json';

// Dynamic import lets RED assert the missing contract explicitly before implementation.
const moduleUrl = new URL('./registry.ts', import.meta.url);
const load = () => import(moduleUrl.href).then(m => m.default ?? m);
const registry = () => JSON.parse(readFileSync(new URL('../../../../public/bottle-photos/registry.v1.json', import.meta.url), 'utf8'));
const fixtures = () => JSON.parse(readFileSync(new URL('./saved-identities.fixture.json', import.meta.url), 'utf8'));

test('shared photo registry contract exists', async () => {
  const api = await load().catch(() => null);
  assert.equal(typeof api?.resolveBottlePhoto, 'function', 'missing exact photo registry resolver');
});

test('all cumulative exact ID/name mappings and immutable images resolve', async () => {
  const { parsePhotoRegistry, resolveBottlePhoto, photoUrl } = await load();
  const data = parsePhotoRegistry(registry());
  assert.ok(data);
  assert.equal(data.entries.length, 89);
  assert.equal(new Set(data.entries.map((r: any) => r.sha256)).size, 81);
  for (const row of data.entries) {
    for (const identity of [{ bottleId: row.catalogId }, { bottleName: row.displayName }, { bottleId: row.catalogId, bottleName: row.displayName }]) {
      assert.equal(resolveBottlePhoto(data, identity, catalog)?.sha256, row.sha256, JSON.stringify(identity));
    }
    assert.equal(photoUrl(row), `https://www.bourbonsignal.com/bottle-photos/${row.sha256}.png`);
  }
});

test('actual 17 saved identities: exact Russell wave02 match resolves; unapproved Taylor and non-exact Jack spelling fall back', async () => {
  const { resolveBottlePhoto } = await load();
  const absent = new Set(['e-h-taylor-jr-barrel-proof-bourbon', 'bb_7a177344b1290314']);
  assert.equal(fixtures().length, 17);
  for (const row of fixtures()) {
    const result = resolveBottlePhoto(registry(), { bottleId: row.bottle_id, bottleName: row.bottle_name, canonicalKey: row.canonical_key }, catalog);
    assert.equal(Boolean(result), !absent.has(row.bottle_id), row.bottle_name);
    if (result) assert.ok(result.exactNames.includes(row.bottle_name), row.bottle_name);
  }
});

test('no lossy key lookup, fuzzy name, generic age normalization, or stale ID/name edition substitution', async () => {
  const { resolveBottlePhoto } = await load();
  const data = registry();
  for (const identity of [
    { canonicalKey: 'eagle rare' }, { canonicalKey: 'reserve russells year' },
    { bottleName: 'Eagle Rare 10 Yr' }, { bottleName: 'Eagle Rare 12 Year' },
    { bottleId: 'eagle-rare-10', bottleName: 'Eagle Rare 17 Year' },
    { bottleId: 'eagle-rare-10', bottleName: 'Wild Turkey 101 Bourbon' },
    { bottleId: 'e-h-taylor-jr-barrel-proof-bourbon', bottleName: 'E.H. Taylor Small Batch' },
    { bottleId: 'bible-russells-reserve-single-barrel', bottleName: "Russell's Reserve 10 Year" },
    { bottleId: '1792-full-proof', bottleName: '1792 Small Batch' },
    { bottleId: 'wild-turkey-101', bottleName: 'Wild Turkey 101 Rye' },
    { bottleId: 'penelope-riviera-cask-finish', bottleName: 'Penelope Riviera Cask Finish 120 Proof' },
    { bottleId: 'woodford-reserve', bottleName: 'Woodford Reserve Double Oaked' },
  ]) assert.equal(resolveBottlePhoto(data, identity, catalog), undefined, JSON.stringify(identity));
  assert.equal(resolveBottlePhoto(data, { bottleName: 'Eagle Rare 10Y' })?.catalogId, 'eagle-rare-10');
});

test('duplicate exact names only resolve when every matching approved product image agrees, including ID/name lookups', async () => {
  const { resolveBottlePhoto } = await load();
  const data = registry();
  const row = data.entries[0];
  const duplicate = { ...row, catalogId: 'another-exact-catalog-id' };
  const same = { ...data, entries: [...data.entries, duplicate] };
  assert.equal(resolveBottlePhoto(same, { bottleName: row.displayName })?.sha256, row.sha256);
  const conflict = { ...data, entries: [...data.entries, { ...duplicate, sha256: '0'.repeat(64) }] };
  assert.equal(resolveBottlePhoto(conflict, { bottleName: row.displayName }), undefined);
  assert.equal(resolveBottlePhoto(conflict, { bottleId: row.catalogId, bottleName: row.displayName }), undefined);
  const { photoIdentityConflicts } = await load();
  assert.equal(photoIdentityConflicts(conflict, { bottleName: row.displayName }), true, 'ambiguous name cannot fall through to a static pilot');
});

test('public schema is strict, versioned, bounded, no arbitrary origins or provenance', async () => {
  const { parsePhotoRegistry, photoUrl } = await load();
  const data = registry();
  assert.ok(parsePhotoRegistry(data));
  for (const change of [{ schemaVersion: 2 }, { revision: 'latest' }, { sourcePage: 'private' }, { entries: [...data.entries, data.entries[0]] }])
    assert.equal(parsePhotoRegistry({ ...data, ...change }), undefined);
  for (const change of [{ url: 'http://evil.test/x.png' }, { sha256: '../photo' }, { sha256: 'A'.repeat(64) }, { width: 0 }, { localPath: 'C:/private' }, { rightsStatus: 'cleared' }])
    assert.equal(parsePhotoRegistry({ ...data, entries: [{ ...data.entries[0], ...change }] }), undefined);
  assert.equal(photoUrl({ ...data.entries[0], sha256: 'https://evil.test/a.png' }), undefined);
});
