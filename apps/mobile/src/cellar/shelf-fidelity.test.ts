import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { shelfGridLayout } from './shelf-cabinet';
test('grid shares ten-point safe page gutters at each phone width', () => {
  for (const width of [320, 390, 430]) assert.equal(shelfGridLayout(width, 'grid').tileWidth * 3 + 16 + 20, width);
});
const page = readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx', import.meta.url), 'utf8');
test('fidelity controls use real four-square/list icons, inline counts and responsive fallback', () => {
  assert.match(page, /name=\{label === "Grid" \? "view-grid" : "format-list-bulleted"\}/);
  assert.match(page, /styles\.filterChipInline/);
  assert.match(page, /fontScale/);
  assert.doesNotMatch(page, /"▦"|"☷"/);
});
test('fidelity cards use platform serif and expandable consistent title zones', () => {
  assert.match(page, /fontFamily: Platform\.select\(/);
  assert.match(page, /styles\.tileTitleZone/);
  assert.match(page, /paddingHorizontal: 10, paddingTop: 0/);
});
