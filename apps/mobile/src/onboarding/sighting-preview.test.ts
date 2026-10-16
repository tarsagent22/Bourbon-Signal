import assert from 'node:assert/strict';
import test from 'node:test';
import { COVERAGE_STATES } from '../../../../shared/coverage-states';
import { resolveLabelFreeBottleArtwork } from '../components/label-free-bottle-artwork';
import { sightingPreviewForState } from './sighting-preview';

test('every selectable state has its own concrete store and approved Eagle Rare 12 artwork', () => {
  for (const { code } of COVERAGE_STATES) {
    const preview = sightingPreviewForState(code);
    assert.equal(preview.state, code);
    assert.ok(preview.store.length > 3);
    assert.ok(preview.city.length > 2);
    assert.match(preview.sourceUrl, /^https:/);
    assert.equal(resolveLabelFreeBottleArtwork(preview), 'eagle-12');
  }
  assert.equal(sightingPreviewForState(' nc ').city, 'Raleigh');
  assert.equal(sightingPreviewForState('').state, 'NC');
});
