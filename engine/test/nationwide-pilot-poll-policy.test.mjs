import assert from 'node:assert/strict';
import test from 'node:test';
import { sourceScopeMatches, mergePollProjection, recoveryPolicy, validatePollPolicy, failClosedPollRows } from '../src/sources/poll-policy.mjs';
import { buildDrops, buildCurrentInventoryAlertsFromDrops } from '../src/export-site-contract.mjs';
import { BourbonBible } from '../src/core/bible.mjs';
import { fingerprintName } from '../src/core/text.mjs';
import { JENSENS_RUNTIME_SOURCE, collectJensensSource } from '../src/collectors/florida-jensens-runtime-source.mjs';

const source = {
  id: 'fl:jensens-miami', state: 'FL', kind: 'jensens', chain: 'jensens-liquors', expiryHours: 1,
  storeIds: ['jensens-liquors:1646-sw-27th'], productIds: ['15414448390218'], variantIds: ['67703590977610'],
  failClosedOnError: true, accessDeniedPauseSeconds: 86400, rateLimitedPauseSeconds: 14400,
};
const now = Date.now();
const at = new Date(now - 10 * 60_000).toISOString();
const owned = { id: 'owned', state: 'FL', sourceChain: source.chain, storeId: source.storeIds[0], productId: source.productIds[0], variantId: source.variantIds[0],
  observedAt: at, signalAt: at, lastConfirmedAt: at, canonicalBottleId: 'ec18', canAlertAsInventory: true, canAlertAsWatch: true };
const others = [
  { ...owned, id: 'other-product', productId: '7793267081290', variantId: '41616729079882' },
  { ...owned, id: 'other-variant', variantId: 'another-variant' },
  { ...owned, id: 'other-store', storeId: 'jensens-liquors:other-store' },
  { ...owned, id: 'fl-abc', sourceChain: 'abc-fine-wine-spirits' },
  { ...owned, id: 'ca-sibling', state: 'CA', sourceChain: 'mission-trails-wine-spirits' },
];
function job(projection, last_reason = 'accepted') { return { source_id: source.id, last_reason, projection }; }
function projection(row = owned) { return { drops: [row], candidates: [{ ...row, dedupeKey: 'candidate-episode' }] }; }
function assertStale(row) { assert.equal(row.stale, true); assert.equal(row.canAlertAsInventory, false); assert.equal(row.canAlertAsWatch, false); }
function assertSiblingsUnchanged(rows) {
  for (const sibling of others) assert.deepEqual(rows.find(row => row.id === sibling.id), sibling);
}

test('pilot ownership is exactly one reviewed store/product/variant while existing broad sources retain their scope', () => {
  assert.equal(sourceScopeMatches(source, owned), true);
  for (const row of others) assert.equal(sourceScopeMatches(source, row), false, row.id);
  for (const field of ['storeId', 'productId', 'variantId']) {
    assert.equal(sourceScopeMatches(source, { ...owned, [field]: undefined }), false, `missing ${field}`);
  }
  assert.equal(sourceScopeMatches({ state: 'FL', chain: source.chain }, others[0]), true);
  assert.equal(sourceScopeMatches({ kind: 'nc-shipments', state: 'NC' }, { state: 'NC', type: 'nc_board_shipment_snapshot' }), true);
  assert.equal(sourceScopeMatches({ kind: 'oh-probe', state: 'OH' }, { state: 'OH' }), false);
});

test('accepted positive replaces only its owned seed; a complete negative cannot revive snapshot stock', () => {
  const fresh = { ...owned, id: 'fresh', lastConfirmedAt: new Date(now).toISOString() };
  const rows = mergePollProjection([owned, ...others], [job(projection(fresh))], [source], 'drops', now);
  assertSiblingsUnchanged(rows);
  assertStale(rows.find(row => row.id === 'owned'));
  assert.equal(rows.find(row => row.id === 'fresh').stale, undefined);
  const negativeRows = mergePollProjection([owned, ...others], [job({ drops: [], candidates: [] })], [source], 'drops', now);
  assertStale(negativeRows.find(row => row.id === owned.id));
  assertSiblingsUnchanged(negativeRows);
  const candidates = mergePollProjection([owned, ...others], [job({ drops: [], candidates: [] })], [source], 'candidates', now);
  assert.deepEqual(candidates, others);
});

test('latest source failure immediately vetoes its still-young projection and snapshot candidates', () => {
  for (const reason of ['source_access_denied', 'rate_limited', 'source_identity_or_schema_failure', 'timeout']) {
    for (const stored of [projection(), null]) {
      const rows = mergePollProjection([owned, ...others], [job(stored, reason)], [source], 'drops', now);
      assertStale(rows.find(row => row.id === owned.id));
      assertSiblingsUnchanged(rows);
      assert.deepEqual(mergePollProjection([owned, ...others], [job(stored, reason)], [source], 'candidates', now), others);
    }
  }
});

test('disabling a registered source retains its veto with and without a persisted projection', () => {
  const disabled = { ...source, disabled: true };
  for (const jobs of [[], [job(null)], [job(projection())]]) {
    const rows = mergePollProjection([owned, ...others], jobs, [disabled], 'drops', now);
    assertStale(rows.find(row => row.id === owned.id));
    assertSiblingsUnchanged(rows);
    assert.deepEqual(mergePollProjection([owned, ...others], jobs, [disabled], 'candidates', now), others);
  }
});

test('confirmation expiry, future clocks and original event age each independently block delivery', () => {
  const old = new Date(now - 3_600_001).toISOString();
  const future = new Date(now + 1).toISOString();
  for (const row of [{ ...owned, lastConfirmedAt: old }, { ...owned, lastConfirmedAt: future }, { ...owned, lastConfirmedAt: 'invalid' }]) {
    assertStale(mergePollProjection([], [job(projection(row))], [source], 'drops', now)[0]);
    assert.deepEqual(mergePollProjection([], [job(projection(row))], [source], 'candidates', now), []);
  }
  const reconfirmedOldEvent = { ...owned, signalAt: old, lastConfirmedAt: new Date(now).toISOString() };
  assert.equal(mergePollProjection([], [job(projection(reconfirmedOldEvent))], [source], 'drops', now)[0].stale, undefined);
  assert.deepEqual(mergePollProjection([], [job(projection(reconfirmedOldEvent))], [source], 'candidates', now), []);
});

test('a stored projection outside the current reviewed seed cannot claim another product or sibling', () => {
  const stored = job({ drops: [owned, ...others], candidates: [owned, ...others] });
  assert.deepEqual(mergePollProjection([], [stored], [source], 'drops', now), [owned]);
  assert.deepEqual(mergePollProjection([], [stored], [source], 'candidates', now), [owned]);
});

test('policy loss and storage failure suppress only registered seed scope', () => {
  const policies = validatePollPolicy([job(projection())], [source], { byId: new Map([['ec18', { tier: 'regular' }]]) }, { states: [] });
  assertStale(policies[0].projection.drops[0]);
  assert.deepEqual(policies[0].projection.candidates, []);
  const rows = failClosedPollRows([owned, ...others], [source], 'drops');
  assertStale(rows[0]); assertSiblingsUnchanged(rows);
  assert.deepEqual(failClosedPollRows([owned, ...others], [source], 'candidates'), others);
});

test('source denial and rate limiting honor long pauses and Retry-After without changing sibling policy', () => {
  assert.deepEqual(recoveryPolicy('source_access_denied', 0, 60, source), { backoff: 86400, pause: 86400, retry: false });
  assert.deepEqual(recoveryPolicy('rate_limited', 0, 600, source), { backoff: 14400, pause: 14400, retry: false });
  const longer = recoveryPolicy('rate_limited', 0, 20000, source);
  assert.equal(longer.backoff, 20000); assert.ok(longer.pause >= 14400);
  for (const reason of ['source_access_denied', 'rate_limited']) {
    assert.equal(recoveryPolicy(reason, 0, 172800, source).backoff, 172800, 'Retry-After beyond one day must not be truncated');
  }
  assert.equal(recoveryPolicy('source_access_denied').pause, 3600);
  assert.equal(recoveryPolicy('transport_failure', 0, 0, source).retry, true);
});

test('actual collector and customer exporter preserve episode and candidate identity on positive reconfirmation', async () => {
  const canonical = 'Elijah Craig 18 Year';
  const record = { id: 'ec18', canonical, tier: 'unicorn', normalizedKey: fingerprintName(canonical), aliases: ['EC18'] };
  const bible = new BourbonBible([record]);
  const lookup = { byId: new Map([[record.id, record]]), byName: new Map([[canonical, record]]) };
  const seed = JENSENS_RUNTIME_SOURCE.products[0];
  const body = JSON.stringify({ product: { id: seed.productId, handle: seed.handle, title: seed.title, product_type: 'Bourbon', tags: [], body_html: '<p>750 ML</p>',
    variants: [{ id: seed.variantId, product_id: seed.productId, title: 'Default Title', price: '249.99' }] } });
  const html = `<pickup-availability-drawer><h2 id="PickupAvailabilityHeading">${seed.title}</h2><li class="pickup-availability-list__item"><h3>Jensen’s Liquors PICKUP</h3><p>Pickup available</p><address><p>1646 Southwest 27th Avenue<br>Miami FL 33145<br>United States</p></address></li></pickup-availability-drawer>`;
  const fetchText = async url => ({ ok: true, status: 200, url, text: url.endsWith('.json') ? body : html });
  const firstAt = new Date(now - 30 * 60_000).toISOString();
  const nextAt = new Date(now).toISOString();
  const first = await collectJensensSource(bible, { observedAt: firstAt, fetchText });
  const firstDrops = buildDrops(first.signals, lookup, first.signals, [], first.signals);
  assert.equal(firstDrops.length, 1);
  const baseline = job({ drops: firstDrops, candidates: [] });
  assert.equal(mergePollProjection([], [baseline], [source], 'drops', now).length, 1);
  assert.deepEqual(mergePollProjection([], [baseline], [source], 'candidates', now), []);
  const next = await collectJensensSource(bible, { observedAt: nextAt, fetchText });
  const nextDrops = buildDrops(next.signals, lookup, next.signals, firstDrops, next.signals);
  assert.equal(nextDrops.length, 1);
  assert.equal(nextDrops[0].availabilityEpisodeId, firstDrops[0].availabilityEpisodeId);
  assert.equal(nextDrops[0].firstSeenAt, firstAt);
  assert.equal(nextDrops[0].displayAt, firstDrops[0].displayAt);
  assert.equal(nextDrops[0].lastConfirmedAt, nextAt);
  const firstCandidates = buildCurrentInventoryAlertsFromDrops(firstDrops);
  const nextCandidates = buildCurrentInventoryAlertsFromDrops(nextDrops);
  assert.equal(firstCandidates.length, 1); assert.equal(nextCandidates.length, 1);
  assert.equal(nextCandidates[0].dedupeKey, firstCandidates[0].dedupeKey);
});
