import test from 'node:test';
import assert from 'node:assert/strict';
import { INDIANA_CAPTURED_SOURCE_DENIALS, indianaDeniedSourceSkip } from '../src/collectors/indiana-source-denial-policy.mjs';

const keys = ['ilg-events', 'kahns', 'penguin-liquor', 'doordash-frontier'];
const aggregateFinish = '2026-10-22T19:34:58.190Z';

test('only the four captured Indiana 403 lanes return explicit zero-request policy results', () => {
  assert.deepEqual(Object.keys(INDIANA_CAPTURED_SOURCE_DENIALS), keys);
  for (const sourceKey of keys) {
    const skipped = indianaDeniedSourceSkip(sourceKey);
    assert.deepEqual(skipped.signals, []);
    assert.equal(skipped.roadblocks.length, 1);
    const roadblock = skipped.roadblocks[0];
    assert.equal(roadblock.source, INDIANA_CAPTURED_SOURCE_DENIALS[sourceKey].source);
    assert.equal(roadblock.url, INDIANA_CAPTURED_SOURCE_DENIALS[sourceKey].url);
    assert.equal(roadblock.sourceRuntimeId, 'precision:in');
    assert.equal(roadblock.status, 'source_policy_disabled');
    assert.equal(roadblock.sourceKey, sourceKey);
    assert.equal(roadblock.attemptCount, 0);
    assert.equal(roadblock.historicalHttpStatus, 403);
    assert.equal(skipped.metadata.decision, 'disabled');
    assert.equal(skipped.metadata.directRequestsAllowed, false);
    assert.equal(skipped.metadata.attemptCount, 0);
    assert.equal(Object.hasOwn(skipped.metadata, 'observedAt'), false);
  }
});

test('retained denial evidence preserves the actual prior runtime clock and does not label publication as a network attempt', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse('2026-10-22T22:00:00.000Z') });
  for (const key of keys) {
    const first = indianaDeniedSourceSkip(key);
    t.mock.timers.setTime(Date.parse('2026-11-22T22:00:00.000Z'));
    const later = indianaDeniedSourceSkip(key);
    assert.deepEqual(first, later);
    const evidence = later.metadata.denialEvidence;
    assert.equal(evidence.aggregatePrecisionCheckedAt, aggregateFinish);
    assert.equal(evidence.clockSemantics, 'aggregate_precision_finish_upper_bound');
    assert.equal(evidence.individualRequestFinishedAt, null);
    assert.equal(evidence.reportFinishedAt, '2026-10-22T20:27:28.250Z');
    assert.equal(evidence.sourceResultStatus, 'not_due');
    assert.equal(evidence.sourceAttemptCount, 0);
    assert.equal(evidence.httpStatus, 403);
    assert.equal(later.roadblocks[0].evidenceRuntimeFinishedAt, aggregateFinish);
    assert.equal(later.roadblocks[0].evidenceClockSemantics, evidence.clockSemantics);
    assert.equal(Object.hasOwn(later.roadblocks[0], 'lastAttemptAt'), false, 'there is no exact per-retailer attempt timestamp');
    assert.equal(Object.hasOwn(later.roadblocks[0], 'checkedAt'), false, 'the policy does not manufacture a new source check');
  }
});

test('captured routes retain their narrow endpoint identity and Kahn page-zero bourbon query', () => {
  assert.equal(indianaDeniedSourceSkip('ilg-events').roadblocks[0].url, 'https://indianaliquor.com/our-events/');
  assert.equal(indianaDeniedSourceSkip('penguin-liquor').roadblocks[0].url, 'https://www.penguinliquor.com/c/spirits/whiskey/19');
  assert.equal(indianaDeniedSourceSkip('doordash-frontier').roadblocks[0].url, 'https://www.doordash.com/convenience/store/frontier-liquors-evansville-26286224/');
  const url = new URL(indianaDeniedSourceSkip('kahns').roadblocks[0].url);
  assert.equal(url.origin + url.pathname, 'https://www.kahnsfinewines.com/api/trpc/product.getAll');
  const input = JSON.parse(url.searchParams.get('input')).json;
  assert.equal(input.text, 'bourbon');
  assert.equal(input.inStock, true);
  assert.deepEqual(input.pagination, { pageIndex: 0, pageSize: 100 });
});

test('other states, healthy lanes, different routes and unknown keys are unaffected', () => {
  for (const stateId of ['AZ', 'PA', 'OH', 'ZZ', 'in']) for (const key of keys) assert.equal(indianaDeniedSourceSkip(key, { stateId }), null);
  for (const key of ['big-red', 'cap-n-cork', 'wise-guys', 'belmont-beverage', 'payless', 'bourbon-world', 'atc', 'target', 'vine-and-table', 'unknown', 'constructor', '__proto__', '', null, undefined]) {
    assert.equal(indianaDeniedSourceSkip(key), null, String(key));
  }
  for (const [key, url] of [
    ['ilg-events', 'https://indianaliquor.com/'],
    ['penguin-liquor', 'https://www.penguinliquor.com/p/bourbon/123'],
    ['doordash-frontier', 'https://www.doordash.com/convenience/store/different-store-123/'],
    ['kahns', 'https://www.kahnsfinewines.com/spirits?search=bourbon'],
  ]) assert.equal(indianaDeniedSourceSkip(key, { url }), null);
});

test('policy outputs can be serialized and cannot mutate the captured audit evidence for a later pass', () => {
  for (const key of keys) {
    const skipped = indianaDeniedSourceSkip(key);
    assert.deepEqual(JSON.parse(JSON.stringify(skipped)), skipped);
    skipped.metadata.denialEvidence.aggregatePrecisionCheckedAt = '2099-01-01T00:00:00.000Z';
    skipped.roadblocks[0].denialEvidence.httpStatus = 200;
    skipped.roadblocks[0].url = 'https://unrelated.invalid';
    const subsequent = indianaDeniedSourceSkip(key);
    assert.equal(subsequent.metadata.denialEvidence.aggregatePrecisionCheckedAt, aggregateFinish);
    assert.equal(subsequent.roadblocks[0].denialEvidence.httpStatus, 403);
    assert.equal(subsequent.roadblocks[0].url, INDIANA_CAPTURED_SOURCE_DENIALS[key].url);
  }
});
