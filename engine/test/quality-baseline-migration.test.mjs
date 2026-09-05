import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import * as quality from '../src/state-quality-scorecard.mjs';

const fixture = JSON.parse(await readFile(new URL('./fixtures/quality-baseline-production.json', import.meta.url), 'utf8'));
const { buildStateQualityScorecard, compareStateQuality, mergePartialRefreshStateQuality, scopeStateQualityForRefresh } = quality;
const current = () => buildStateQualityScorecard(fixture.states.map(row => row.replay.input), { generatedAt: fixture.generatedAt });
const previous = () => ({ schemaVersion: 2, generatedAt: fixture.acceptedGeneratedAt, states: fixture.states.map(row => row.accepted) });
const migrate = (card = previous(), drops = fixture.drops) => quality.migrateStateQualityBaseline(card, { drops });

test('production-derived RED: scalar proxy comparison reproduces both logged failures', () => {
  assert.deepEqual(current().states.map(row => [row.state, row.score]), [['MD-MONTGOMERY', 58], ['KY', 48]]);
  assert.deepEqual(compareStateQuality(previous(), current()).failures, [
    'MD-MONTGOMERY: quality score fell from 74 to 58.', 'KY: quality score fell from 70 to 48.',
  ]);
});

test('production baseline migrates chronology, not thresholds or non-freshness dimensions', () => {
  const migrated = migrate();
  assert.equal(migrated.schemaVersion, 3);
  assert.equal(current().schemaVersion, 3);
  assert.deepEqual(migrated.states.map(row => [row.state, row.score]), [['MD-MONTGOMERY', 64], ['KY', 50]]);
  assert.equal(compareStateQuality(migrated, current()).ok, true);
  for (const row of migrated.states) {
    const old = previous().states.find(before => before.state === row.state);
    assert.equal(row.releaseEligible, false);
    assert.equal(row.threshold, old.threshold);
    assert.equal(row.freshness.distributionKnown, true);
    for (const key of Object.keys(row.dimensions).filter(key => key !== 'freshness')) assert.equal(row.dimensions[key], old.dimensions[key]);
  }
});

test('partial/adaptive TX refresh migrates untouched states, repeats without scalar laundering, and re-ages', () => {
  const migrated = migrate();
  const summary = { partialRefresh: true, attemptedStateIds: ['TX'] };
  let result = mergePartialRefreshStateQuality(migrated, current(), summary);
  assert.deepEqual(result.states.map(row => row.score), [64, 50]);
  result = mergePartialRefreshStateQuality(result, buildStateQualityScorecard(current().states.map(row => row.input), { generatedAt: '2026-09-12T23:24:17.014Z' }), summary);
  assert.deepEqual(result.states.map(row => row.score), [54, 50]);
  assert.ok(result.states.every(row => row.freshness.distributionKnown && !row.releaseEligible));
  assert.deepEqual(result.states.map(row => row.input.freshnessEvidence), migrated.states.map(row => row.input.freshnessEvidence));
  assert.equal(scopeStateQualityForRefresh(result, summary).states.length, 0);
  assert.deepEqual(migrate(result), result, 'new evidence-backed baseline is not repeatedly rebuilt from public history');
});

test('version controls reject unsupported or mislabeled baselines and scalar partial retention', () => {
  assert.throws(() => migrate({ ...previous(), schemaVersion: 99 }), /schema|version/i);
  assert.throws(() => migrate({ ...previous(), schemaVersion: 3 }), /evidence/i);
  assert.throws(() => quality.migrateStateQualityBaseline(previous(), {}), /drops|baseline/i);
  assert.throws(() => mergePartialRefreshStateQuality(previous(), current(), { partialRefresh: true, attemptedStateIds: ['TX'] }), /migrat|schema|evidence/i);
});

test('true comparable regression remains blocked in full and explicit targeted refresh', () => {
  const migrated = migrate();
  const damaged = buildStateQualityScorecard(migrated.states.map(row => ({ ...row.input, dropCount: 0, storeLevelDropCount: 0, alertCandidateCount: 0, freshnessEvidence: [], status: 'failed' })), { generatedAt: fixture.generatedAt });
  for (const summary of [{ partialRefresh: false }, { partialRefresh: true, attemptedStateIds: ['MD-MONTGOMERY', 'KY'] }]) {
    const result = compareStateQuality(migrated, scopeStateQualityForRefresh(damaged, summary));
    assert.equal(result.ok, false);
    assert.ok(result.failures.some(message => message.includes('quality score fell')));
    assert.ok(result.failures.some(message => message.includes('public drops fell')));
    assert.ok(result.failures.some(message => message.includes('state status became degraded')));
  }
});

test('migration retains existing v2 row evidence and never replaces it with fresher public clocks', () => {
  const known = current();
  const mixed = { ...previous(), states: [previous().states[0], known.states[1]] };
  const migrated = migrate(mixed);
  assert.deepEqual(migrated.states.find(row => row.state === 'KY').input, known.states[1].input);
  assert.equal(migrated.states.find(row => row.state === 'KY').score, 48);
});

test('capped/history partitions preserve original non-freshness inputs; missing rows remain unknown', () => {
  const prior = previous();
  const before = structuredClone(prior);
  const capped = fixture.drops.filter(row => row.state !== 'MD-MONTGOMERY' || row.id === fixture.drops.find(drop => drop.state === 'MD-MONTGOMERY').id);
  const migrated = migrate(prior, capped);
  const md = migrated.states.find(row => row.state === 'MD-MONTGOMERY');
  assert.equal(md.input.dropCount, 8);
  assert.equal(md.freshness.rowCount, 8);
  assert.equal(md.freshness.unknownRowCount, 7);
  assert.equal(md.releaseEligible, false);
  assert.equal(md.input.freshnessEvidenceOrigin.unknownRowCount, 7);
  assert.deepEqual(prior, before);
  const history = migrate(prior, [...fixture.drops, { ...fixture.drops[0], id: 'synthetic-extra-history' }]);
  for (const row of history.states) assert.equal(row.input.dropCount, prior.states.find(old => old.state === row.state).input.dropCount);
  assert.throws(() => migrate(prior, fixture.drops.filter(row => row.state !== 'KY')), /missing accepted baseline/);
});

test('real subsequent aging remains a comparable score regression, not another migration', () => {
  const liveInput = { ...fixture.states[0].replay.input, coverageTier: 'live_store_inventory', dropCount: 1, storeLevelDropCount: 1, freshnessEvidence: [{ confirmedAt: fixture.generatedAt, eventAt: fixture.generatedAt, inventory: true }] };
  const accepted = buildStateQualityScorecard([liveInput], { generatedAt: fixture.generatedAt });
  const expired = buildStateQualityScorecard([liveInput], { generatedAt: '2026-09-20T23:24:17.014Z' });
  const result = compareStateQuality(migrate(accepted), expired);
  assert.equal(result.ok, false);
  assert.ok(result.failures.some(message => message.includes('quality score fell')));
});

test('empty publication quality and internally inconsistent legacy scores are not reusable baselines', () => {
  assert.throws(() => migrate({ ...previous(), states: [] }), /baseline/i);
  for (const mutate of [row => { row.score = 0; }, row => { row.dimensions.alerts += 1; }]) {
    const card = structuredClone(previous());
    mutate(card.states[0]);
    assert.throws(() => migrate(card), /baseline/i);
  }
});

test('all required numeric fields and v2/v3 evidence structures fail closed before reuse', () => {
  for (const schemaVersion of [2, 3]) {
    const base = migrate();
    base.schemaVersion = schemaVersion;
    const fields = ['score', 'threshold', ...Object.keys(base.states[0].dimensions).map(key => `dimensions.${key}`), ...['signalCount', 'dropCount', 'storeLevelDropCount', 'alertCandidateCount', 'sourceCount', 'roadblockCount'].map(key => `input.${key}`)];
    for (const field of fields) for (const value of [undefined, null, '12', NaN, Infinity, -Infinity]) {
      const card = structuredClone(base);
      const keys = field.split('.');
      const owner = keys.length === 2 ? card.states[0][keys[0]] : card.states[0];
      owner[keys.at(-1)] = value;
      assert.throws(() => migrate(card), /baseline/i, `${schemaVersion} ${field} ${value}`);
    }
    for (const mutate of [
      row => { row.input.freshnessEvidence[0] = []; },
      row => { delete row.input.freshnessEvidence[0].confirmedAt; },
      row => { row.input.freshnessEvidence[0].eventAt = 123; },
      row => { row.input.freshnessEvidence[0].stale = 'false'; },
      row => { row.input.freshnessEvidence[0].store = {}; },
      row => { delete row.freshness.freshRowRatio; },
      row => { row.freshness.confirmationAgeHours.p95 = Infinity; },
    ]) {
      const card = structuredClone(base);
      mutate(card.states[0]);
      assert.throws(() => migrate(card), /baseline/i);
    }
  }
});

test('schema 3 scorecard content must agree with retained input evidence', () => {
  for (const mutate of [row => { row.score -= 1; }, row => { row.releaseEligible = true; }, row => { row.freshness.freshRowCount += 1; }, row => { row.dimensions.alerts += 1; }]) {
    const card = migrate();
    mutate(card.states[0]);
    assert.throws(() => migrate(card), /inconsistent/i);
  }
});

test('original declared score-drop guard remains strict at 15 points', () => {
  const before = { states: [{ state: 'PA', score: 98, releaseEligible: true, input: { dropCount: 3600, status: 'useful' } }] };
  const after = (score) => ({ states: [{ state: 'PA', score, releaseEligible: true, input: { dropCount: 3637, status: 'useful' }, weaknesses: ['no_alert_candidates'] }] });
  assert.equal(compareStateQuality(before, after(83)).ok, true);
  assert.equal(compareStateQuality(before, after(82)).ok, false);
  assert.equal(compareStateQuality(before, after(80)).ok, false);
});
