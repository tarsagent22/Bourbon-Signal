import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { formatCollectionRating } from '../interactions/member-interactions';

const page = readFileSync(new URL('../../app/(app)/(tabs)/cellar.tsx', import.meta.url), 'utf8');
const tile = page.slice(page.indexOf('function WhiskeyTile('), page.indexOf('function WhiskeyListRow('));
const row = page.slice(page.indexOf('function WhiskeyListRow('), page.indexOf('function ViewModeButton('));

test('owned and tasted grid cards display the personal rating without a star', () => {
  assert.ok(tile.length > 0);
  assert.doesNotMatch(tile, /[★☆]|name=["']star/);
  assert.match(tile, /<Text style=\{styles\.tileRating\}>\{rating\}<\/Text>/);
  assert.match(tile, /const rating = formatCollectionRating\(bottle\)/);
  assert.match(tile, /Rating \$\{rating\}/);
  assert.match(tile, /kind === "owned" \? <CellarBottleArtwork bottle=\{bottle\} \/> : <CellarGlencairnSilhouette \/>/);
  assert.match(tile, /onPress=\{onPress\}/);
});

test('shared list renderer keeps numeric rating and unrated semantics, already star-free', () => {
  assert.ok(row.length > 0);
  assert.doesNotMatch(row, /[★☆]|name=["']star/);
  assert.match(row, /const rating = formatCollectionRating\(bottle\)/);
  assert.match(row, /<Text style=\{styles\.listRating\}>\{bottle\.isRated \? `Rated \$\{rating\}` : "Unrated"\}<\/Text>/);
  assert.match(row, /accessibilityLabel=/);
  assert.match(row, /onPress=\{onPress\}/);
});

test('personal rating formatter retains decimals, valid zero and unrated distinction', () => {
  assert.equal(formatCollectionRating({ rating: 95, isRated: true }), '9.5');
  assert.equal(formatCollectionRating({ rating: 0, isRated: true }), '0.0');
  assert.equal(formatCollectionRating({ rating: 0, isRated: false }), 'Unrated');
  assert.equal(formatCollectionRating({ rating: 95, isRated: false }), 'Unrated');
});

test('rating editing remains the existing conditional ScoreSlider and save path', () => {
  assert.match(page, /\{isRated \? <ScoreSlider onChange=\{setRating\} value=\{rating\} \/> : null\}/);
  assert.match(page, /<BottleEditor bottle=\{selected\}/);
  assert.match(page, /onSave=\{saveBottle\}/);
});
