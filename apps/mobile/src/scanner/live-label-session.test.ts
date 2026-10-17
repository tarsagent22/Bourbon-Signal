import assert from 'node:assert/strict';
import test from 'node:test';
import seed from '../cellar/bottle-catalog-seed.json';
import { createLabelIndex } from './label-matching';
import { createLiveLabelSession, visibleLabelBlocks, type LabelFrame } from './live-label-session';
const index = createLabelIndex(seed);
const view = { width: 320, height: 380 };
const scene = Array.from({ length: 36 }, (_, i) => 70 + i * 2);
const frame = (sequence: number, text: string, patch: Partial<LabelFrame> = {}): LabelFrame => ({
  scanToken: 1, sequence, timestamp: sequence * 250, processingMs: 45, width: 1080, height: 1440, scene,
  blocks: text ? text.split('\n').map((text, i) => ({ text, confidence: 0.92, x: 0.2, y: 0.35 + i * 0.08, width: 0.6, height: 0.06 })) : [], ...patch,
});

test('first frame publishes provisional candidates and an expression refines immediately', () => {
  const scan = createLiveLabelSession(index);
  const first = scan.observe(frame(1, 'PENELOPE'), view, 100)!;
  assert.ok(first.matches.length); assert.equal(first.phase, 'suggesting'); assert.equal(first.metrics.firstSuggestionMs, 100);
  const second = scan.observe(frame(2, 'RIVIERA'), view, 350)!;
  assert.equal(second.matches[0].id, 'penelope-riviera-cask-finish'); assert.equal(second.phase, 'suggesting');
  const third = scan.observe(frame(3, 'RIVIERA'), view, 600)!;
  assert.equal(third.phase, 'ready'); assert.equal(third.metrics.confirmedMs, 600);
  assert.equal(scan.observe(frame(4, 'BUFFALO TRACE'), view, 850), null, 'held scan does not change after confirmation');
});
test('one expression read cannot confirm itself from later brand-only or blank frames', () => {
  const scan = createLiveLabelSession(index);
  assert.equal(scan.observe(frame(1, 'PENELOPE RIVIERA'), view, 100)!.phase, 'suggesting');
  assert.notEqual(scan.observe(frame(2, 'PENELOPE'), view, 350)!.phase, 'ready');
  assert.notEqual(scan.observe(frame(3, ''), view, 600)!.phase, 'ready');
});
test('new specific expression wins over the prior expression before confirmation', () => {
  const scan = createLiveLabelSession(index);
  scan.observe(frame(1, 'PENELOPE RIVIERA'), view, 100);
  assert.equal(scan.observe(frame(2, 'RIO'), view, 350)!.matches[0].id, 'penelope-rio-cask-finish');
  assert.equal(scan.observe(frame(3, 'RIO'), view, 600)!.phase, 'ready');
});
test('history clears on confirmed scene change, expiration, a different brand, and blank gaps', () => {
  for (const [name, second, now] of [
    ['scene', frame(2, 'RIVIERA', { scene: scene.map((_, i) => i % 2 ? 240 : 15) }), 350],
    ['expired', frame(2, 'RIVIERA'), 1600],
  ] as const) {
    const scan = createLiveLabelSession(index); scan.observe(frame(1, 'PENELOPE'), view, 100);
    const result = scan.observe(second, view, now)!;
    if (name === 'scene') {
      assert.equal(result.phase, 'suggesting', 'one changed scene sample preserves provisional choices');
      assert.notEqual(result.matches[0]?.id, 'penelope-riviera-cask-finish', 'old brand is not lent to a fragment in a different scene');
      assert.equal(scan.observe({ ...second, sequence: 3 }, view, now + 250)!.matches.length, 0, name);
    } else assert.equal(result.matches.length, 0, name);
  }
  const changed = createLiveLabelSession(index); changed.observe(frame(1, 'PENELOPE'), view, 100);
  assert.equal(changed.observe(frame(2, 'BUFFALO TRACE KENTUCKY STRAIGHT BOURBON'), view, 350)!.matches[0].id, 'buffalo-trace-bourbon');
  const blank = createLiveLabelSession(index); blank.observe(frame(1, 'PENELOPE'), view, 100);
  blank.observe(frame(2, ''), view, 350);
  assert.deepEqual(blank.observe(frame(3, ''), view, 1100)!.matches, []);
  assert.deepEqual(blank.observe(frame(4, 'RIVIERA'), view, 1350)!.matches, []);
});

test('brief OCR gaps keep family controls and candidates stable without confirming old text', () => {
  const scan = createLiveLabelSession(index);
  const first = scan.observe(frame(1, 'PENELOPE'), view, 100)!;
  for (const [sequence, text, now] of [[2, '', 350], [3, 'HANDCRAFTED', 600], [4, '', 850]] as const) {
    const next = scan.observe(frame(sequence, text), view, now)!;
    assert.equal(next.family?.identity, first.family?.identity);
    assert.deepEqual(next.matches, first.matches);
    assert.equal(next.changed, false);
    assert.equal(next.phase, 'suggesting');
  }
});

test('a single scene spike neither flickers results nor borrows brand evidence', () => {
  const scan = createLiveLabelSession(index);
  const first = scan.observe(frame(1, 'PENELOPE'), view, 100)!;
  const spike = scan.observe(frame(2, 'RIVIERA', { scene: scene.map((_, i) => i % 2 ? 240 : 15) }), view, 350)!;
  assert.deepEqual(spike.matches, first.matches);
  assert.equal(spike.phase, 'suggesting');
  assert.equal(spike.changed, false);
  const recovered = scan.observe(frame(3, 'PENELOPE'), view, 600)!;
  assert.deepEqual(recovered.matches, first.matches);
  assert.equal(recovered.metrics.resets, 0);
});

test('unrelated nonblank text cannot keep old candidates alive indefinitely', () => {
  const scan = createLiveLabelSession(index);
  scan.observe(frame(1, 'PENELOPE'), view, 100);
  scan.observe(frame(2, 'HANDCRAFTED'), view, 350);
  scan.observe(frame(3, 'HANDCRAFTED'), view, 850);
  const expired = scan.observe(frame(4, 'HANDCRAFTED'), view, 1400)!;
  assert.deepEqual(expired.matches, []);
  assert.equal(expired.family, undefined);
});

test('switching to a bottle with no family alternatives clears the previous brand controls and evidence', () => {
  const smallIndex = createLabelIndex(seed.filter(bottle => ['penelope-bourbon', 'penelope-riviera-cask-finish', 'henry-mckenna-10-year'].includes(bottle.id))
    .map(bottle => bottle.name.startsWith('Penelope ') ? { ...bottle, brand: 'Penelope' } : bottle));
  const scan = createLiveLabelSession(smallIndex);
  assert.equal(scan.observe(frame(1, 'PENELOPE'), view, 100)!.family?.identity, 'penelope');
  const different = scan.observe(frame(2, 'HENRY MCKENNA AGED 10 YEARS SINGLE BARREL BOTTLED IN BOND'), view, 350)!;
  assert.equal(different.matches[0].id, 'henry-mckenna-10-year');
  assert.equal(different.family, undefined);
  assert.notEqual(scan.observe(frame(3, 'RIVIERA'), view, 600)!.matches[0]?.id, 'penelope-riviera-cask-finish');
});

test('unknown/empty guidance waits for a persistent read while matches appear immediately', () => {
  const scan = createLiveLabelSession(index);
  for (const [sequence, text, now] of [[1, 'WOODEN TABLE', 100], [2, '', 350], [3, 'WOODEN TABLE', 600], [4, '', 850], [5, 'WOODEN TABLE', 1100], [6, 'WOODEN TABLE', 1400]] as const) {
    assert.equal(scan.observe(frame(sequence, text), view, now)!.phase, 'reading');
  }
  assert.equal(scan.observe(frame(7, 'WOODEN TABLE'), view, 1750)!.phase, 'unknown');
  assert.equal(scan.observe(frame(8, 'PENELOPE'), view, 2000)!.phase, 'suggesting');
});
test('pause/rescan resets all evidence and drops out-of-order events', () => {
  const scan = createLiveLabelSession(index); scan.observe(frame(2, 'PENELOPE'), view, 100);
  assert.equal(scan.observe(frame(1, 'RIVIERA'), view, 350), null);
  scan.reset(400);
  const next = scan.observe(frame(3, 'RIVIERA'), view, 500)!;
  assert.deepEqual(next.matches, []); assert.equal(next.metrics.firstFrameMs, 100);
});
test('low-confidence and off-screen text never add identity evidence', () => {
  const sample = frame(1, 'PENELOPE');
  assert.equal(visibleLabelBlocks({ ...sample, blocks: [{ ...sample.blocks[0], confidence: 0.1 }] }, view).length, 0);
  assert.equal(visibleLabelBlocks({ ...sample, blocks: [{ ...sample.blocks[0], y: 0 }] }, view).length, 0);
  assert.equal(visibleLabelBlocks(sample, view).length, 1);
});
test('multiple visible brands cannot be combined or confirmed', () => {
  const scan = createLiveLabelSession(index);
  for (let sequence = 1; sequence <= 3; sequence++) assert.notEqual(scan.observe(frame(sequence, 'PENELOPE RIVIERA\nBUFFALO TRACE'), view, sequence * 250)!.phase, 'ready');
});
test('uncertain expression text remains selectable without borrowing confidence from the brand', () => {
  const scan = createLiveLabelSession(index);
  for (let sequence = 1; sequence <= 3; sequence++) {
    const sample = frame(sequence, 'PENELOPE\nRIVIERA');
    sample.blocks[1].confidence = 0.35;
    const result = scan.observe(sample, view, sequence * 250)!;
    assert.equal(result.matches[0].id, 'penelope-riviera-cask-finish');
    assert.equal(result.phase, 'suggesting');
  }
  assert.equal(scan.observe(frame(4, 'PENELOPE\nRIVIERA'), view, 1000)!.phase, 'suggesting', 'one strong read after weak reads does not confirm');
  assert.equal(scan.observe(frame(5, 'PENELOPE\nRIVIERA'), view, 1250)!.phase, 'ready');
});
