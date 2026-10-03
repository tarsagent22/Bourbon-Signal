import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const cabinet = readFileSync(new URL('../components/ShelfCabinet.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx', import.meta.url), 'utf8');
test('showcase replaces cabinet plates with a single ledge and larger named bottles', () => {
  assert.ok(cabinet.includes('Shelf Highlights'));
  assert.ok(cabinet.includes('showcase-ledge'));
  assert.ok(cabinet.includes('size="showcase"'));
  assert.ok(cabinet.includes('{highlightName(bottle.bottleName)}'));
  assert.ok(!cabinet.includes('cabinetAssets'));
  assert.ok(!cabinet.includes('placement.json'));
});
test('compact controls keep accessible actions without clipped search or unbounded tab labels', () => {
  assert.ok(page.includes('placeholder="Search"'));
  assert.ok(page.includes('accessibilityLabel="Search My Shelf"'));
  assert.ok(page.includes('styles.tabCount'));
  assert.ok(page.includes('Sort by'));
  assert.ok(page.includes('minWidth: 44, minHeight: 44'));
});
