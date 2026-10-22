import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { BourbonBible } from '../src/core/bible.mjs';
import { buildIndianaPaylessBarrelSelectionSignals } from '../src/collectors/precision-probes.mjs';
import { canonicalizeSignal, candidateFromChange } from '../src/operational-report.mjs';
import { bibleLookup, buildDrops, buildAlerts, buildCurrentInventoryAlertsFromDrops, applyAlertPolicyToCandidate, capAlertCandidatesByState } from '../src/export-site-contract.mjs';
import { isIndianaRetailerInventory, isIndianaRetailerSignalIdentity } from '../src/indiana-retailer-policy.mjs';
import { reviewedIndianaPaylessBottleMatch, buildIndianaPaylessAvailabilityProof, hasIndianaPaylessPickupProof, normalizeIndianaCityHiveQuantity } from '../src/collectors/indiana-retailer-matching.mjs';

const capture = JSON.parse(await readFile(new URL('./fixtures/indiana-retailer/2026-10-22-identity-regressions.json', import.meta.url), 'utf8'));
const bible = await BourbonBible.load(new URL('../out/bourbon-bible.json', import.meta.url));
const lookup = bibleLookup(bible.records);
const now = Date.parse(capture.observedAt) + 10 * 60_000;
const clone = (value) => JSON.parse(JSON.stringify(value));
const pickupText = capture.paylessPage.html.replace(/<[^>]+>/g, ' ');
const paylessObservedAt = capture.paylessPage.observedAt;
const paylessCaptured = capture.signals.find((row) => row.rawName === 'Maker’s Mark Private Selections');
const unsafeCaptured = capture.signals.filter((row) => row.rawName === 'Woodford Reserve Rye' || row.rawName === 'Wild Turkey Bourbon');
const positiveCaptured = capture.signals.filter((row) => row.rawName === 'Buffalo Trace Bourbon');

function paylessSignal(mutate = () => {}) {
  const collected = buildIndianaPaylessBarrelSelectionSignals({ id: 'IN' }, bible, { text: capture.paylessPage.html, observedAt: paylessObservedAt });
  assert.equal(collected.signals.length, 1, 'actual captured list excerpt retains Maker private selection and rejects Woodford Rye');
  const source = clone(collected.signals[0]);
  mutate(source);
  return source;
}

function pipeline(signals) {
  const operational = clone(signals.map((row) => canonicalizeSignal(row, bible)));
  const drops = clone(buildDrops(operational, lookup, operational));
  const reported = clone(buildAlerts({ candidates: operational.map((row) => candidateFromChange({ type: 'new_signal', key: row.key, after: row }, false)) }));
  const current = clone(buildCurrentInventoryAlertsFromDrops(drops));
  const combined = [...new Map([...reported, ...current].map(applyAlertPolicyToCandidate).map((row) => [row.dedupeKey || row.id, row])).values()]
    .filter((row) => row.eligibleForDelivery)
    .sort((a, b) => Number(b.eligibleForDelivery) - Number(a.eligibleForDelivery) || (b.reliabilityScore || 0) - (a.reliabilityScore || 0) || (b.score || 0) - (a.score || 0));
  return { operational, drops, reported, current, combined, alerts: capAlertCandidatesByState(combined, 1000, 200) };
}

test('reviewed Payless source title keeps Maker private selection and rejects captured Woodford Rye misidentification', () => {
  assert.equal(reviewedIndianaPaylessBottleMatch('Woodford Reserve Rye', bible).record, null);
  assert.equal(reviewedIndianaPaylessBottleMatch('Woodford Reserve Rye', bible).unsafeReason, 'rye_matched_non_rye');
  assert.equal(reviewedIndianaPaylessBottleMatch('Maker’s Mark Private Selections', bible).record?.canonical, "Maker's Mark Private Selection");
});

test('Payless pickup proof requires exact premises, original time and both page statements without creating shelf quantity', () => {
  const input = { ...paylessCaptured, observedAt: paylessObservedAt, pickupText };
  const proof = buildIndianaPaylessAvailabilityProof(input);
  assert.equal(proof.quantity, 0);
  assert.equal(proof.quantityIsExact, false);
  assert.equal(proof.sourceProductBinding.observedAt, paylessObservedAt);
  assert.equal(hasIndianaPaylessPickupProof(paylessSignal()), true);
  for (const patch of [
    { sourceUrl: 'https://www.paylessliquors.info:444/barrel-selections' },
    { storeAddress: 'Some other store, Indianapolis, IN 46227' },
    { observedAt: null }, { pickupText: 'Available at our East Street location' },
    { pickupText: 'Stop by and pick your bottle up today!' },
  ]) assert.equal(buildIndianaPaylessAvailabilityProof({ ...input, ...patch }), null);
  for (const patch of [{ quantity: 1 }, { quantityIsExact: true }, { sourceAvailabilityVerified: false }, { observedAt: '2026-10-22T19:42:50.474Z' }, { sourceProductBinding: null }]) {
    assert.equal(isIndianaRetailerInventory(paylessSignal((row) => { Object.assign(row, patch); if ('sourceProductBinding' in patch) row.raw.productBinding = null; })), false);
  }
});

test('CityHive finite quantities and sentinel orderability remain distinct through JSON projection', () => {
  for (const value of [2, '7']) {
    const normalized = normalizeIndianaCityHiveQuantity(value);
    assert.equal(normalized.quantity, Number(value));
    assert.equal(normalized.quantityIsExact, true);
  }
  for (const value of [100, 106, '115']) {
    const normalized = normalizeIndianaCityHiveQuantity(value);
    assert.equal(normalized.quantity, 0);
    assert.equal(normalized.quantityIsExact, false);
    const row = clone(positiveCaptured[0]);
    Object.assign(row, normalized, { availabilityStatus: 'binary_retailer_in_stock' });
    row.raw.reportedQuantity = Number(value);
    row.raw.binaryAvailability = true;
    assert.equal(isIndianaRetailerInventory(row), true);
    const projected = clone(canonicalizeSignal(row, bible));
    assert.equal(isIndianaRetailerInventory(projected), true);
    assert.equal(isIndianaRetailerInventory({ ...projected, quantity: 1 }), false);
    assert.equal(isIndianaRetailerInventory({ ...projected, sourceAvailabilityVerified: false }), false);
  }
  for (const value of [null, '', -1, 'garbage', Infinity, 1.5]) assert.equal(normalizeIndianaCityHiveQuantity(value).sourceAvailabilityVerified, false);
});

test('captured wrong identities fail closed through canonical JSON, public drops and both actual alert paths', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now });
  assert.equal(unsafeCaptured.length, 3);
  const projected = pipeline(unsafeCaptured);
  assert.ok(projected.operational.every((row) => !isIndianaRetailerSignalIdentity(row) && row.canAlertAsInventory === false && row.canAlertAsWatch === false));
  assert.equal(projected.drops.length, 0);
  assert.equal(projected.reported.length, 0);
  assert.equal(projected.current.length, 0);
  assert.equal(projected.alerts.length, 0);
  // A higher tier cannot turn the same captured generic title into a named special release.
  const promoted = unsafeCaptured.map((row) => ({ ...clone(row), canonicalName: row.rawName === 'Wild Turkey Bourbon' ? "Wild Turkey Master's Keep" : "Woodford Reserve Master's Collection", canonicalBottleId: null }));
  const attempted = pipeline(promoted);
  assert.equal(attempted.drops.length, 0);
  assert.equal(attempted.alerts.length, 0);
});

test('verified binary Payless availability survives canonical JSON and both exporter paths with quantity zero', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(paylessObservedAt) + 10 * 60_000 });
  const result = pipeline([paylessSignal()]);
  assert.equal(result.drops.length, 1);
  assert.equal(result.reported.length, 1);
  assert.equal(result.current.length, 1);
  assert.equal(result.alerts.length, 2, 'reported changes and current inventory retain distinct candidate keys');
  assert.ok([...result.operational, ...result.drops, ...result.alerts].every((row) => row.quantity === 0 && row.quantityIsExact === false && row.observedAt === paylessObservedAt));
  assert.ok(result.alerts.every((row) => isIndianaRetailerInventory(row)));
  assert.ok(result.alerts.every((row) => row.eligibleForOnSite && !row.eligibleForEmail && !row.eligibleForSms));
  assert.equal(new Set(result.alerts.map((row) => row.dedupeKey || row.id)).size, 2);
});

test('a CityHive sentinel input preserves binary availability through both composed exporter paths', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now });
  // Deliberate format mutation tests the sentinel contract; this is not a new live observation.
  const source = clone(positiveCaptured[0]);
  Object.assign(source, normalizeIndianaCityHiveQuantity(106), { availabilityStatus: 'binary_retailer_in_stock' });
  Object.assign(source.raw, { reportedQuantity: 106, binaryAvailability: true });
  source.raw.option.quantity = 106;
  const result = pipeline([source]);
  assert.equal(result.drops.length, 1);
  assert.equal(result.reported.length, 1);
  assert.equal(result.current.length, 1);
  assert.equal(result.alerts.length, 2);
  assert.ok([...result.drops, ...result.alerts].every((row) => row.quantity === 0 && row.quantityIsExact === false && row.observedAt === capture.observedAt));
  assert.ok(result.alerts.every((row) => !row.eligibleForEmail && !row.eligibleForSms));
});

test('captured existing positive identities remain public once, and real exporter cap preserves valid distinct candidates', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now });
  const result = pipeline([...positiveCaptured, ...clone(positiveCaptured)]);
  assert.equal(result.drops.filter((row) => row.rawName === 'Buffalo Trace Bourbon').length, 1, 'existing canonical/store duplicate collapse remains unchanged');
  assert.ok(result.alerts.every((row) => row.eligibleForDelivery && isIndianaRetailerInventory(row)));
  assert.equal(result.alerts.length, 3, 'two captured variant/quantity change candidates and one deduplicated public current-inventory candidate retain their actual exporter keys');
  const highCardinality = Array.from({ length: 1_100 }, (_, index) => ({ ...result.combined[index % result.combined.length], id: `candidate-${index}`, dedupeKey: `dedupe-${index}` }));
  assert.equal(capAlertCandidatesByState(highCardinality, 1000, 200).length, 1000, 'the state fairness allowance is soft and unused global slots fill normally');
});

test('stale original source time and explicit stale flags cannot become fresh alert candidates', (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: Date.parse(paylessObservedAt) + 10 * 60_000 });
  for (const patch of [{ sourceStale: true }, { stale: true }]) {
    const row = paylessSignal((signal) => Object.assign(signal, patch));
    assert.equal(isIndianaRetailerInventory(row), false);
    assert.equal(pipeline([row]).alerts.length, 0);
  }
  t.mock.timers.setTime(Date.parse(paylessObservedAt) + 3 * 3_600_000);
  const expired = pipeline([paylessSignal()]);
  assert.equal(expired.alerts.length, 0);
  assert.ok(expired.operational.every((row) => row.observedAt === paylessObservedAt));
});
