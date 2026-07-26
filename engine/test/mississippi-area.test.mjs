import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MISSISSIPPI_REGION_IDS,
  assignMississippiRegion,
  isMississippiAreaMatch,
  normalizeMississippiPlace,
} from '../src/mississippi-area.mjs';

test('Mississippi canonical program exposes exactly nine reviewed regions', () => {
  assert.equal(MISSISSIPPI_REGION_IDS.length, 9);
  assert.equal(new Set(MISSISSIPPI_REGION_IDS).size, 9);
});

test('Mississippi region aliases use exact normalized city/county membership', () => {
  assert.equal(assignMississippiRegion({ city: 'Southaven', county: 'DeSoto County' }), 'northwest-desoto-memphis-fringe');
  assert.equal(assignMississippiRegion({ city: 'Oxford', county: 'Lafayette' }), 'north-central-oxford');
  assert.equal(assignMississippiRegion({ city: 'Tupelo', county: 'Lee' }), 'northeast-tupelo-golden-triangle');
  assert.equal(assignMississippiRegion({ city: 'Greenville', county: 'Washington' }), 'delta');
  assert.equal(assignMississippiRegion({ city: 'Jackson', county: 'Hinds' }), 'central-jackson-madison-rankin');
  assert.equal(assignMississippiRegion({ city: 'Meridian', county: 'Lauderdale' }), 'east-central-meridian');
  assert.equal(assignMississippiRegion({ city: 'Hattiesburg', county: 'Forrest' }), 'pine-belt-hattiesburg-laurel');
  assert.equal(assignMississippiRegion({ city: 'Gulfport', county: 'Harrison' }), 'gulf-coast');
  assert.equal(assignMississippiRegion({ city: 'Natchez', county: 'Adams' }), 'southwest-natchez-brookhaven-mccomb-vicksburg');
  assert.equal(assignMississippiRegion({ city: 'Gulfport Heights', county: 'Unknown' }), null);
  assert.equal(normalizeMississippiPlace(' DeSoto County '), 'desoto');
});

test('area matching does not bleed across substrings or other states', () => {
  const row = { state: 'MS', city: 'Gulfport', county: 'Harrison', regionId: 'gulf-coast' };
  assert.equal(isMississippiAreaMatch(row, 'gulf-coast'), true);
  assert.equal(isMississippiAreaMatch(row, 'Gulf Coast'), true);
  assert.equal(isMississippiAreaMatch({ ...row, state: 'AL' }, 'gulf-coast'), false);
  assert.equal(isMississippiAreaMatch({ state: 'MS', city: 'Not Gulfport Heights', county: 'Unknown' }, 'gulf-coast'), false);
});
