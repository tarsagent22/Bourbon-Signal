// Reviewer reproductions, with real recovery/enforcement/activation and live report caller.
// Every provider import is an isolated double; no network modules are resolved.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { moduleFrom, functions, root } = require('./astra-security-test-helpers.cjs');
const plain = value => JSON.parse(JSON.stringify(value));
const entitlements = moduleFrom('src/lib/entitlements.ts');
const trial = moduleFrom('src/lib/membership-trial.ts');
const plans = moduleFrom('src/lib/stripe-plans.ts');
const plan = plans.LAUNCH_BILLING_PLANS.standard_annual;
const json = (body, options) => ({ ...body, status: options?.status || 200 });
function recoveryHarness({ change, phase = 'provider', managedTrial = false } = {}) {
  let user = { id: 'user_fixture', publicMetadata: { tier: 'standard', plan: plan.id, membershipStatus: 'unpaid' }, privateMetadata: { stripeCustomerId: 'cus_fixture', stripeSubscriptionId: 'sub_old' } };
  let reads = 0;
  const writes = [], cancellations = [], claims = [], referrals = [];
  const mutate = () => { if (change) user = { ...user, publicMetadata: { ...user.publicMetadata, ...change.publicMetadata }, privateMetadata: { ...user.privateMetadata, ...change.privateMetadata } }; };
  const clerk = { users: {
    getUser: async () => { reads++; if ((phase === 'enforcement' && reads === 2) || (phase === 'activation' && reads === 3)) mutate(); return structuredClone(user); },
    updateUserMetadata: async (_id, patch) => { writes.push(plain(patch)); user = { ...user, publicMetadata: { ...user.publicMetadata, ...patch.publicMetadata }, privateMetadata: { ...user.privateMetadata, ...patch.privateMetadata } }; },
  } };
  const stubs = {
    'server-only': {}, '@clerk/nextjs/server': { clerkClient: async () => clerk, auth: async () => ({ userId: user.id }) },
    '@/lib/entitlements': entitlements, '@/lib/membership-trial': trial,
    '@/lib/founder-allocation': moduleFrom('src/lib/founder-allocation.ts', { '@/lib/entitlements': entitlements }),
    '@/lib/growth-events': { mergeGrowthMilestoneMetadata: () => ({ activation: {} }) },
    '@/lib/founder-reservations': {}, '@/lib/server-entitlements': {}, '@/lib/direct-founder-revocation': {},
    '@/lib/gift-repository': { createGiftRepository: () => ({ findLiveDirectFounderCheckout: async () => null, findDirectFounderOwnershipForUser: async () => null }) },
    '@/lib/membership-trial-repository': { getMembershipTrialRepository: () => ({ claimStart: async input => { claims.push(input); return { accepted: true }; }, markConverted: async () => {} }) },
  };
  const membership = moduleFrom('src/lib/membership-server.ts', stubs);
  stubs['@/lib/membership-server'] = membership;
  stubs.stripe = class Stripe {};
  const enforcement = moduleFrom('src/lib/membership-trial-stripe.ts', stubs);
  const selectedPlan = managedTrial ? plans.LAUNCH_BILLING_PLANS.standard_monthly : plan;
  const session = { id: 'cs_fixture', customer: 'cus_fixture', subscription: 'sub_old', status: 'complete', payment_status: 'paid', metadata: { source: 'bourbon_signal_launch', userId: user.id, plan: selectedPlan.id } };
  const stripe = { customers: { list: async () => ({ data: [], has_more: false }) }, checkout: { sessions: {
    list: async () => ({ data: [session], has_more: false }),
    listLineItems: async () => ({ data: [{ quantity: 1, price: { id: plans.DIRECT_STRIPE_PRICE_IDS[selectedPlan.id] } }], has_more: false }),
  } }, subscriptions: {
    retrieve: async () => { if (phase === 'provider') mutate(); return { id: 'sub_old', customer: 'cus_fixture', status: 'active', metadata: { userId: user.id, ...(managedTrial ? { trial_offer: 'monthly_7_day_v1' } : {}) }, items: { data: [{ price: { id: plans.DIRECT_STRIPE_PRICE_IDS[selectedPlan.id] } }], has_more: false } }; },
    cancel: async id => { cancellations.push(id); },
  } };
  const route = moduleFrom('src/app/api/checkout/recover/route.ts', {
    ...stubs, stripe: class Stripe { constructor() { return stripe; } }, 'next/server': { NextResponse: { json } },
    '@/lib/stripe-plans': plans, '@/lib/owner-auth': { verifiedPrimaryClerkEmail: () => '' },
    '@/lib/membership-trial-stripe': enforcement, '@/lib/referral-service': { reconcileReferredMembership: async input => referrals.push(input) },
  });
  return { run: route.POST, membership, writes, cancellations, claims, referrals, user: () => plain(user) };
}
const changes = [
  ['Founder', { publicMetadata: { tier: 'bottled-in-bond', plan: 'bib_lifetime', membershipStatus: 'lifetime', founderNumber: 7 } }],
  ['canceled-free', { publicMetadata: { tier: 'free', plan: 'free', membershipStatus: 'canceled' } }],
  ['new subscription', { privateMetadata: { stripeSubscriptionId: 'sub_new' } }],
  ['new customer', { privateMetadata: { stripeCustomerId: 'cus_new' } }],
  ['gift', { publicMetadata: { tier: 'barrel', plan: 'gift_barrel_annual', giftOrderId: 'gift_fixture', giftAccessExpiresAt: '2099-01-01T00:00:00Z', membershipStatus: 'active' } }],
];
for (const phase of ['provider', 'enforcement', 'activation']) for (const [label, change] of changes) test(`SEC-01 ${label} at ${phase} read fails closed without metadata/provider side effects`, async () => {
  const h = recoveryHarness({ change, phase });
  const result = await h.run();
  assert.notEqual(result.activated, true);
  assert.equal(h.writes.length, 0);
  assert.equal(h.cancellations.length, 0);
  assert.equal(h.claims.length, 0);
  assert.equal(h.referrals.length, 0);
});
test('SEC-01 unchanged reviewer Standard Annual control activates with actual helper', async () => {
  const h = recoveryHarness(); assert.equal((await h.run()).activated, true);
  assert.equal(h.writes.length, 2); assert.equal(h.user().privateMetadata.stripeSubscriptionId, 'sub_old');
  assert.equal(h.user().publicMetadata.membershipStatus, 'active');
});
test('SEC-01 intentional new checkout activation still replaces prior subscription', async () => {
  const h = recoveryHarness();
  await h.membership.activateMembership('user_fixture', { tier: 'barrel', plan: 'barrel_annual', stripeCustomerId: 'cus_fixture', stripeSubscriptionId: 'sub_new', status: 'active' });
  assert.equal(h.user().publicMetadata.tier, 'barrel'); assert.equal(h.user().privateMetadata.stripeSubscriptionId, 'sub_new');
});
test('SEC-01 managed recovery refuses changed gift before trial claim or cancellation', async () => {
  const h = recoveryHarness({ change: changes.at(-1)[1], managedTrial: true }); await h.run();
  assert.equal(h.claims.length, 0); assert.equal(h.cancellations.length, 0); assert.equal(h.writes.length, 0);
});

const zones = moduleFrom('src/lib/retailer-time-zone.ts');
const portal = moduleFrom('src/lib/retailer-portal.ts');
function actionHarness(address) {
  let saved;
  const ctx = functions('src/app/retailers/portal/page.tsx', ['submitRetailerUpdate'], {
    ...zones, auth: async () => ({ userId: 'user_fixture' }), randomUUID: () => 'fixture', revalidatePath: () => {}, redirect: url => { throw new Error(url); },
    getRetailerRepository: () => ({ getApplication: async () => ({ status: 'verified' }), getStore: async () => ({ storeAddress: address }), createSubmission: async input => { saved = input.submission; return input; } }),
    normalizeRetailerSubmission: input => portal.normalizeRetailerSubmission(input, new Date('2026-09-04T00:00:00Z')),
  });
  return { saved: () => saved, run: async timeZone => {
    const form = new FormData();
    for (const [key, value] of Object.entries({ kind: 'bottle_drop', storeId: 'fixture', title: 'Fixture', availabilityTiming: 'scheduled', startsAt: '2027-01-01T12:00', ...(timeZone === undefined ? {} : { timeZone }) })) form.set(key, value);
    return ctx.submitRetailerUpdate(form);
  } };
}
test('LOGIC-02 reviewer accepted no-ZIP CA address preserves explicit Pacific scheduling', async () => {
  const address = '1 Fixture Street, Los Angeles, CA';
  assert.equal(portal.normalizeRetailerStore({ storeName: 'Fixture', storeAddress: address, listedPhone: 'fixture-phone' }).ok, true);
  const h = actionHarness(address); await assert.rejects(h.run('America/Los_Angeles'), /submitted=1/);
  assert.equal(h.saved().timeZone, 'America/Los_Angeles'); assert.equal(h.saved().startsAt, '2027-01-01T20:00:00.000Z');
});
for (const address of ['1 Fixture Street, Los Angeles, CA', 'Unknown location', '1 Fixture, Tampa, FL 33601']) test(`LOGIC-02 ${address} requires supported explicit scheduling choice`, async () => {
  for (const zone of [undefined, 'Mars/Fixture']) {
    const h = actionHarness(address); await assert.rejects(h.run(zone), /error=/); assert.equal(h.saved(), undefined);
  }
});
test('LOGIC-02 confident fixed-zone anti-override survives', async () => {
  const h = actionHarness('1 Fixture St, Raleigh, NC 27601'); await assert.rejects(h.run('America/Los_Angeles'), /submitted=1/);
  assert.equal(h.saved().startsAt, '2027-01-01T17:00:00.000Z');
});
for (const { value } of zones.RETAILER_TIME_ZONES) test(`LOGIC-02 unknown location accepts supported ${value}`, async () => {
  const h = actionHarness('Unknown location'); await assert.rejects(h.run(value), /submitted=1/); assert.equal(h.saved().timeZone, value);
});

function reportHarness({ userId = 'user_fixture', busy = false, lost = false, initialReports = [] } = {}) {
  let held = false;
  const writes = [], leases = [];
  let metadata = { tier: 'free', untouched: 'canonical', sightingsPreferences: { submittedSightings: [{ id: 'canonical', rewardState: { removedAt: 'preserve' } }], sightingVotes: [{ sightingId: 'canonical', kind: 'up' }], signalReports: initialReports } };
  const initialCanonical = plain(metadata);
  let queue = Promise.resolve();
  const bindings = {
    'next/server': { NextResponse: { json } }, '@clerk/nextjs/server': { auth: async () => ({ userId }), clerkClient: async () => ({ users: {
      getUser: async id => { assert.ok(held); assert.equal(id, userId); return { publicMetadata: plain(metadata) }; },
      updateUserMetadata: async (id, patch) => { assert.ok(held); assert.equal(id, userId); writes.push(plain(patch)); metadata = { ...metadata, ...patch.publicMetadata, sightingsPreferences: { ...metadata.sightingsPreferences, ...patch.publicMetadata.sightingsPreferences } }; },
    } }) },
    '@/lib/alert-queue/member-lease': { withMemberAlertLease: async (id, op, options) => {
      leases.push({ id, options }); if (busy) return { acquired: false };
      const previous = queue; let release; queue = new Promise(resolve => { release = resolve; }); await previous;
      held = true;
      try { return { acquired: true, result: await op(async () => { if (lost) throw new Error('member_lease_lost'); }) }; }
      finally { held = false; release(); }
    } },
  };
  const endpoint = 'src/app/api/sightings/reports/route.ts';
  const route = fs.existsSync(path.join(root, endpoint)) ? moduleFrom(endpoint, bindings) : null;
  const post = async body => route ? route.POST({ json: async () => body, text: async () => JSON.stringify(body) }) : json({ error: 'missing constrained endpoint' }, { status: 404 });
  const calls = [];
  let state = [], index = 0;
  const react = { useState: initial => { const i = index++; if (!(i in state)) state[i] = initial; return [state[i], value => { state[i] = typeof value === 'function' ? value(state[i]) : value; }]; }, useCallback: fn => fn, useMemo: fn => fn(), useEffect: () => {} };

  // moduleFrom deliberately provides no fetch global; use actual hook declaration with injected fetch.
  const hookCtx = functions('src/hooks/useSightings.ts', ['useSightings'], { ...react, EMPTY_SIGHTINGS_PREFERENCES: { submittedSightings: [], sightingVotes: [], signalReports: [] }, fetch: async (url, options) => {
    calls.push({ url, options });
    const response = options?.method === 'POST'
      ? (url === '/api/sightings/reports' ? await post(JSON.parse(options.body)) : json({ error: 'sightings_server_owned' }, { status: 400 }))
      : { sightingsPreferences: plain(metadata.sightingsPreferences), status: 200 };
    return { ok: response.status < 400, status: response.status, json: async () => response };
  } });
  return { post, writes, leases, calls, initialCanonical, metadata: () => plain(metadata), hook: () => { index = 0; return hookCtx.useSightings(); } };
}
const report = { signalId: 'signal:fixture', bottleName: 'Fixture Bottle', storeName: 'Fixture Store', storeAddress: '1 Fixture', state: 'CA', kind: 'seen' };
test('LOGIC-01 actual live Seen and Not seen hook reaches constrained authenticated API', async () => {
  const h = reportHarness();
  for (const kind of ['seen', 'not_seen']) {
    await h.hook().addSignalReport({ ...report, kind, id: 'caller-id', createdAt: '1900-01-01T00:00:00Z' });
    assert.equal(h.hook().reportsBySignalId.get(report.signalId).kind, kind);
  }
  assert.equal(h.metadata().sightingsPreferences.signalReports.length, 1);
  assert.ok(h.calls.every(call => call.url === '/api/sightings/reports'));
  assert.equal(h.metadata().sightingsPreferences.signalReports[0].kind, 'not_seen');
  assert.notEqual(h.metadata().sightingsPreferences.signalReports[0].id, 'caller-id');
});
test('LOGIC-01 report auth is mandatory', async () => { const h = reportHarness({ userId: null }); assert.equal((await h.post(report)).status, 401); assert.equal(h.writes.length, 0); });
for (const extra of ['submittedSightings', 'sightingVotes', 'reporterUserId', 'userId', 'rewardState', 'createdAt', 'id', 'sightingsPreferences']) test(`LOGIC-01 rejects caller authority ${extra}`, async () => {
  const h = reportHarness(); assert.equal((await h.post({ ...report, [extra]: [] })).status, 400); assert.equal(h.writes.length, 0);
});
for (const body of [null, [], { ...report, kind: 'up' }, { ...report, signalId: '' }, { ...report, signalId: 'x'.repeat(261) }, { ...report, bottleName: 'x'.repeat(141) }, { ...report, state: 'California' }, { ...report, storeName: [] }]) test(`LOGIC-01 invalid report ${JSON.stringify(body).slice(0, 90)}`, async () => {
  const h = reportHarness(); assert.equal((await h.post(body)).status, 400); assert.equal(h.writes.length, 0);
});
test('LOGIC-01 shared member lease merges concurrent reports and preserves canonical data', async () => {
  const h = reportHarness();
  const results = await Promise.all([h.post(report), h.post({ ...report, signalId: 'second', kind: 'not_seen' })]);
  assert.ok(results.every(result => result.status === 200));
  assert.equal(h.metadata().sightingsPreferences.signalReports.length, 2);
  assert.deepEqual(h.metadata().sightingsPreferences.submittedSightings, h.initialCanonical.sightingsPreferences.submittedSightings);
  assert.deepEqual(h.metadata().sightingsPreferences.sightingVotes, h.initialCanonical.sightingsPreferences.sightingVotes);
  assert.equal(h.metadata().untouched, 'canonical');
  assert.ok(h.leases.every(lease => lease.id === 'user_fixture' && lease.options.requireDurable));
  for (const write of h.writes) assert.deepEqual(Object.keys(write.publicMetadata.sightingsPreferences), ['signalReports']);
});
test('LOGIC-01 bounded reports and server timestamps', async () => {
  const h = reportHarness({ initialReports: Array.from({ length: 300 }, (_, i) => ({ ...report, id: `old-${i}`, signalId: `old-${i}`, createdAt: '2020-01-01T00:00:00Z' })) });
  assert.equal((await h.post(report)).status, 200);
  const reports = h.metadata().sightingsPreferences.signalReports; assert.equal(reports.length, 250); assert.equal(reports[0].signalId, report.signalId); assert.ok(Number.isFinite(Date.parse(reports[0].createdAt)));
});
for (const option of ['busy', 'lost']) test(`LOGIC-01 ${option} lease fails closed`, async () => { const h = reportHarness({ [option]: true }); assert.equal((await h.post(report)).status, 503); assert.equal(h.writes.length, 0); });

test('LOGIC-01 real member lease and PGlite SQL contend, renew, release, and refuse stolen ownership', async () => {
  const { PGlite } = require('@electric-sql/pglite');
  const db = new PGlite();
  try {
    const { PostgresAlertQueueRepository } = moduleFrom('src/lib/alert-queue/postgres-repository.ts');
    const repository = new PostgresAlertQueueRepository({ query: (sql, params) => db.query(sql, params) });
    let configured = true, steal = false, writes = 0;
    const runtime = { alertQueueDatabaseConfigured: () => configured, createProductionAlertQueueRepository: () => repository };
    const lease = moduleFrom('src/lib/alert-queue/member-lease.ts', { './runtime': runtime });
    const competitor = moduleFrom('src/lib/alert-queue/member-lease.ts', { './runtime': runtime });
    const endpoint = moduleFrom('src/app/api/sightings/reports/route.ts', {
      'next/server': { NextResponse: { json } }, '@/lib/alert-queue/member-lease': lease,
      '@clerk/nextjs/server': { auth: async () => ({ userId: 'user_fixture' }), clerkClient: async () => ({ users: {
        getUser: async () => {
          assert.equal((await db.query("SELECT * FROM alert_delivery_leases WHERE lease_key = 'member:user_fixture'")).rows.length, 1);
          if (steal) await db.query("UPDATE alert_delivery_leases SET owner = 'new-owner' WHERE lease_key = 'member:user_fixture'");
          return { publicMetadata: { sightingsPreferences: { signalReports: [] } } };
        },
        updateUserMetadata: async (_id, patch) => { writes++; assert.deepEqual(Object.keys(patch.publicMetadata.sightingsPreferences), ['signalReports']); },
      } }) },
    });
    const post = () => endpoint.POST({ text: async () => JSON.stringify(report) });
    await competitor.withMemberAlertLease('user_fixture', async () => { assert.equal((await post()).status, 503); assert.equal(writes, 0); });
    assert.equal((await post()).status, 200); assert.equal(writes, 1);
    assert.equal((await db.query('SELECT * FROM alert_delivery_leases')).rows.length, 0);
    configured = false; assert.equal((await post()).status, 503); assert.equal(writes, 1);
    configured = true; steal = true; assert.equal((await post()).status, 503); assert.equal(writes, 1);
    assert.equal((await db.query('SELECT owner FROM alert_delivery_leases')).rows[0].owner, 'new-owner');
  } finally { await db.close(); }
});

test('LOGIC-01 rejects oversized and malformed request bodies before lease access', async () => {
  const endpoint = moduleFrom('src/app/api/sightings/reports/route.ts', {
    'next/server': { NextResponse: { json } }, '@clerk/nextjs/server': { auth: async () => ({ userId: 'user_fixture' }) },
    '@/lib/alert-queue/member-lease': { withMemberAlertLease: async () => { throw new Error('must not acquire'); } },
  });
  assert.equal((await endpoint.POST({ text: async () => 'x'.repeat(4097) })).status, 413);
  assert.equal((await endpoint.POST({ text: async () => '{bad' })).status, 400);
});
