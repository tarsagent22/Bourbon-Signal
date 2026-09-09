import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
const cabinet = readFileSync(new URL('../components/ShelfCabinet.tsx', import.meta.url), 'utf8');
const page = readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx', import.meta.url), 'utf8');
test('every preset uses the approved separate transparent cabinet geometries', () => {
  for (const theme of ['amber', 'walnut', 'black']) for (const rows of ['1', '2', '2spacious']) assert.ok(cabinet.includes(`${theme}-${rows}row.png`));
  assert.ok(cabinet.includes('cabinetAssets[shelfStyle][assetKey]'));
  assert.ok(cabinet.includes('bottle-contact-shadow.png'));
  assert.ok(!cabinet.includes('styles.grain'));
  assert.ok(!cabinet.includes('insetFrame'));
});
test('compact controls keep accessible actions without clipped search or unbounded tab labels', () => {
  assert.ok(page.includes('placeholder="Search"'));
  assert.ok(page.includes('accessibilityLabel="Search My Shelf"'));
  assert.ok(page.includes('styles.tabCount'));
  assert.ok(page.includes('Sort by'));
  assert.ok(page.includes('minWidth: 44, minHeight: 44'));
});
