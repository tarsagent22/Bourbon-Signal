import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { PGlite } from '@electric-sql/pglite';
import { discoveryRegion, readSavedBottle } from '../shared/local-discovery';
import { parseMobileConversion } from '../shared/mobile-conversion';
import { selectLocalReport } from '../src/lib/local-discovery';
import { huntPreviewKey, isAlertPreviewMarket } from '../src/lib/one-alert-preview';
import { claimHuntPreview, loadSavedHunt, saveHunt } from '../src/lib/mobile-saved-hunt';
import { isMobileConversionEnabled, readMobileConversion } from '../src/lib/mobile-conversion-repository';

const now = Date.parse('2026-11-25T15:02:00Z');
const at = '2026-11-25T15:00:00Z';
const inventory = {
  id: 'internal-source-id', state: 'FL', canonical_name: 'Eagle Rare 10 Year', canonical_id: 'eagle-rare-10',
  type: 'store_inventory_result', location_precision: 'store_level', store_city: 'Tampa', store_zip: '33602',
  source: 'Official retailer inventory', store_id: 'retailer-111', store_name: 'Example Retailer',
  store_address: '123 Source Street, Tampa, FL 33602', sourceUrl: 'https://example.com/internal', timestamp: at,
  last_confirmed_at: at, availabilityEpisodeStartedAt: at, availability_status: 'in_stock', quantity: 3, canAlertAsInventory: true,
  sourceAvailabilityVerified: true, rarity_tier: 'allocated', price: 45,
};

test('one local report is current, bound to the requested place, and redacted', () => {
  const region = discoveryRegion('fl', ' Tampa ')!;
  assert.deepEqual(region, { state: 'FL', city: 'Tampa' });
  const report = selectLocalReport([inventory], region, now);
  assert.deepEqual(report, {
    bottle: 'Eagle Rare 10 Year', bottleId: 'eagle-rare-10', location: 'Example Retailer · Tampa',
    source: 'Official retailer inventory', kind: 'inventory', reportedAt: at, price: 45, alertsAvailable: true,
  });
  assert.equal(selectLocalReport([inventory], { ...region, city: 'Orlando' }, now), null);
  assert.equal(selectLocalReport([inventory], { ...region, city: '33603' }, now), null);
  assert.equal(selectLocalReport([inventory], { ...region, city: '33602' }, now)?.bottleId, report?.bottleId);
  assert.equal(selectLocalReport([{ ...inventory, store_id: '', store_address: '' }], region, now), null);
  assert.equal(selectLocalReport([{ ...inventory, sourceStale: true }], region, now), null);
  assert.equal(selectLocalReport([inventory], region, Date.parse('2026-11-29T15:02:00Z')), null);
});

test('shipment reports cannot become store inventory or one-alert previews', () => {
  const region = { state: 'NC', city: 'Wake' };
  const shipment = { state: 'NC', canonicalName: 'Eagle Rare', canonicalId: 'eagle-rare-10',
    type: 'nc_board_shipment_snapshot', location_precision: 'board', board_name: 'Wake',
    timestamp: at, source: 'ABC shipment report', price: 35, canAlertAsInventory: true };
  const report = selectLocalReport([shipment], region, now);
  assert.equal(report?.kind, 'shipment');
  assert.equal(report?.price, null);
  assert.equal(report?.alertsAvailable, false);
  const saved = { ...region, bottleId: 'eagle-rare-10', bottle: 'Eagle Rare', savedAt: '2026-11-24T15:00:00Z' };
  assert.equal(selectLocalReport([shipment], region, now, saved), null);
});

test('the no-card preview requires one newly verified report for the exact saved bottle', () => {
  const watch = readSavedBottle({ state: 'FL', city: 'Tampa', bottleId: 'eagle-rare-10',
    bottle: 'Eagle Rare 10 Year', savedAt: '2026-11-24T15:00:00Z' })!;
  const match = selectLocalReport([inventory], watch, now, watch)!;
  assert.ok(match);
  assert.equal(selectLocalReport([{ ...inventory, canonical_id: 'wrong-bottle' }], watch, now, watch), null);
  assert.equal(selectLocalReport([inventory], watch, now, { ...watch, savedAt: at }), null);
  const reconfirmed = { ...inventory, last_confirmed_at: '2026-11-25T15:01:00Z' };
  assert.equal(selectLocalReport([reconfirmed], watch, now, { ...watch, savedAt: at }), null);
  assert.equal(huntPreviewKey(watch, selectLocalReport([reconfirmed], watch, now, watch)!), huntPreviewKey(watch, match));
  assert.notEqual(huntPreviewKey(watch, match), huntPreviewKey(watch, { ...match, location: 'Other store' }));
  assert.equal(isAlertPreviewMarket('FL', ''), false);
  assert.equal(isAlertPreviewMarket('FL', 'CA, FL'), true);
});

test('saved bottle retries keep the original date and preview claims survive replacement and removal', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  await db.exec('CREATE TABLE account_deletion_requests (user_id text primary key);' + readFileSync('src/lib/mobile-conversion-schema.sql', 'utf8'));
  const sql = { query: async (text: string, params: unknown[] = []) => ({ rows: (await db.query<Record<string, unknown>>(text, params)).rows }) };
  const watch = { ...discoveryRegion('FL', 'Tampa')!, bottleId: 'eagle-rare-10', bottle: 'Eagle Rare', savedAt: '2026-11-24T15:00:00Z' };
  const other = { ...watch, bottleId: 'different-bottle', savedAt: '2026-11-25T15:00:00Z' };
  assert.equal((await saveHunt('free-account', watch, sql))?.bottleId, watch.bottleId);
  assert.equal((await saveHunt('free-account', { ...watch, savedAt: other.savedAt }, sql))?.savedAt, watch.savedAt);
  assert.equal(await claimHuntPreview('free-account', other, 'first-report', sql), false);
  assert.equal(await claimHuntPreview('free-account', watch, 'first-report', sql), true);
  assert.equal(await claimHuntPreview('free-account', watch, 'first-report', sql), true);
  await saveHunt('free-account', null, sql);
  assert.deepEqual(await loadSavedHunt('free-account', sql), { saved: null, previewKey: 'first-report' });
  await saveHunt('free-account', other, sql);
  assert.equal(await claimHuntPreview('free-account', other, 'later-report', sql), false);
  await db.query('INSERT INTO account_deletion_requests VALUES ($1)', ['free-account']);
  assert.deepEqual(await loadSavedHunt('free-account', sql), { saved: null, previewKey: null });
  await assert.rejects(saveHunt('free-account', other, sql));
});

test('conversion cohorts distinguish observed renewals and store-paid starts from trials', async t => {
  const db = new PGlite();
  t.after(() => db.close());
  for (const name of ['mobile-conversion', 'apple-membership', 'google-membership']) {
    await db.exec(readFileSync(`src/lib/${name}-schema.sql`, 'utf8'));
  }
  await db.exec(`INSERT INTO mobile_conversion_events
    (installation_hash,event,entry,platform,coverage,user_id,event_day,event_at) VALUES
    ('installation','first_open','welcome','ios','unknown',NULL,'1970-01-01',now()-interval '50 days'),
    ('installation','local_report_seen','welcome','ios','current',NULL,'1970-01-01',now()-interval '50 days'+interval '30 seconds'),
    ('installation','area_saved','first_run','ios','current','first-paid','1970-01-01',now()-interval '50 days'),
    ('installation','app_active','welcome','ios','unknown','first-paid',((now()-interval '43 days') AT TIME ZONE 'UTC')::date,now()-interval '43 days'),
    ('installation','paywall_viewed','saved_bottle','ios','current','first-paid','1970-01-01',now()-interval '27 days');`);
  const product = 'com.bourbonsignal.app.barrel.monthly';
  await db.exec(`INSERT INTO apple_memberships
    (original_transaction_id,clerk_user_id,environment,product_id,entitlement_status,offer_state,ordered_event_at,status_priority) VALUES
    ('cohort','first-paid','production','${product}','active','none',now(),1),
    ('tenured','old-paid','production','${product}','active','none',now(),1),
    ('trial','trial-only','production','${product}','trialing','introductory_trial',now(),1);
    INSERT INTO apple_membership_events
    (provider_event_id,clerk_user_id,original_transaction_id,environment,product_id,entitlement_status,expires_at,offer_state,ordered_event_at,received_at) VALUES
    ('start','first-paid','cohort','production','${product}','active',now()+interval '3 days','none',now()-interval '27 days',now()),
    ('initial','old-paid','tenured','production','${product}','active',now()-interval '31 days','none',now()-interval '61 days',now()),
    ('renew','old-paid','tenured','production','${product}','active',now()-interval '1 day','none',now()-interval '31 days',now()),
    ('trial','trial-only','trial','production','${product}','trialing',now()+interval '5 days','introductory_trial',now()-interval '2 days',now());`);
  const result = await readMobileConversion({ query: async text => ({ rows: (await db.query<Record<string, unknown>>(text)).rows }) });
  assert.deepEqual(result.cohort, { d7Mature: 1, d7Returned: 1, secondsToValue: 30, d35Mature: 1, d35Paid: 1 });
  assert.deepEqual(result.paid, [{ platform: 'ios', accounts: 1 }]);
  assert.deepEqual(result.renewals, [{ platform: 'ios', mature: 1, extended: 1 }]);
  assert.deepEqual(result.steps, [{ event: 'paywall_viewed', platform: 'ios', entry: 'saved_bottle', coverage: 'current', installs: 1 }]);
});

test('funnel telemetry accepts only specific guest events and discards unneeded inputs', () => {
  const payload = { platform: 'ios', event: 'signup_started', installation: '31d0896e-0379-4df2-bdbd-880ff7ac5ef5',
    entry: 'local_preview', coverage: 'current', state: 'AZ', city: 'Phoenix', email: 'discard@example.com' };
  const parsed = parseMobileConversion(payload, false);
  assert.deepEqual(parsed, { platform: 'ios', event: 'signup_started', installation: payload.installation,
    entry: 'local_preview', coverage: 'current' });
  assert.equal(parseMobileConversion({ ...payload, event: 'membership_confirmed' }, false), null);
  assert.equal(parseMobileConversion({ ...payload, installation: 'not-a-uuid' }, true), null);
  assert.equal(parseMobileConversion({ ...payload, event: 'app_active' }, false)?.event, 'app_active');
  assert.equal(isMobileConversionEnabled('ios', ''), false);
  assert.equal(isMobileConversionEnabled('android', 'ios, android'), true);
  assert.equal(isMobileConversionEnabled('web', 'web'), false);
});
