import assert from 'node:assert/strict';
import { test } from 'node:test';
import { photoPresentationScale, groundedPhotoFrame } from './photo-presentation';
test('only three visually reviewed immutable photos receive proportional presentation correction', () => {
  assert.equal(photoPresentationScale('f0ea7ac8d8abde55fee08ba57de7daf5768b6978f8d13675db9e8130e437e09b'), .84);
  assert.equal(photoPresentationScale('ad8017ffb3efb40f3ac06ac015260fd9ae1219125a4b69d65c64a90f634257b8'), .90);
  assert.equal(photoPresentationScale('e08b9f5e00e953eba6b2bb39eb16a82f5f94cc75d3dc8aca5165ae971fd65139'), .94);
  for (const key of [undefined, '1792', '1792-small-batch', 'woodford', 'f0ea7ac8']) assert.equal(photoPresentationScale(key), 1);
});
test('presentation preserves aspect and approved alpha baseline for grid and list frames', () => {
  for (const [w,h] of [[80,116],[44,62]]) for (const s of [.84,.9,.94,1]) {
    const f=groundedPhotoFrame(w,h,s);
    assert.equal(f.width, w*s);
    assert.equal(f.height, h*s);
    assert.ok(Math.abs(f.width/f.height-w/h)<1e-12);
    assert.ok(Math.abs(h-f.bottom-f.height*(16/600)-h*(584/600))<1e-8);
    assert.ok(f.width>0 && f.height>0 && f.bottom>=0);
  }
});
