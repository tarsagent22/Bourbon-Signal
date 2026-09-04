const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleFrom, functions } = require('./astra-security-test-helpers.cjs');
const entitlements = moduleFrom('src/lib/entitlements.ts');
const plan = { id: 'standard_monthly', tier: 'standard' };
function harness({ knownCustomer = true, sessions, status = 'active', subscription = 'sub_fixture', publicMetadata = {}, privateMetadata = {}, primaryVerified = true, founder = false, refunded = false, currentPrice = 'price_fixture' } = {}) {
  const lists = [], activated = [], customerQueries = [];
  const session = { id: 'cs_fixture', status: 'complete', payment_status: 'paid', customer: 'cus_fixture', subscription, metadata: { userId: 'user_fixture', plan: plan.id, source: 'bourbon_signal_launch' } };
  if (founder) Object.assign(session, { customer: null, subscription: null, mode: 'payment', payment_intent: 'pi_fixture', metadata: { ...session.metadata, plan: 'bib_lifetime', tier: 'bottled-in-bond', founder_checkout_attempt_id: 'attempt_fixture' } });
  const selectedPlan = founder ? { id: 'bib_lifetime', tier: 'bottled-in-bond' } : plan;
  const stripe = { checkout: { sessions: {
    retrieve: async () => session,
    list: async args => { lists.push(args); return sessions ? sessions(args, session) : { data: [session], has_more: false }; },
    listLineItems: async () => ({ data: [{ quantity: 1, price: { id: 'price_fixture' } }], has_more: false }),
  } }, customers: { list: async args => { customerQueries.push(args); return { data: [{ id: 'cus_fixture', email: 'fixture@example.invalid', metadata: {} }], has_more: false }; } },
    paymentIntents: { retrieve: async () => ({ latest_charge: 'ch_fixture' }) },
    charges: { retrieve: async () => ({ paid: true, refunded, disputed: false, amount_refunded: refunded ? 5000 : 0 }) },
    subscriptions: { retrieve: async id => ({ id, customer: 'cus_fixture', status, metadata: { userId: 'user_fixture' }, items: { data: [{ price: { id: currentPrice } }], has_more: false } }) } };
  class Stripe { constructor() { return stripe; } }
  const user = { id: 'user_fixture', primaryEmailAddressId: 'email_fixture', emailAddresses: [{ id: 'email_fixture', emailAddress: 'fixture@example.invalid', verification: { status: primaryVerified ? 'verified' : 'unverified' } }], publicMetadata, privateMetadata: { ...(knownCustomer ? { stripeCustomerId: 'cus_fixture' } : {}), ...privateMetadata } };
  const route = moduleFrom('src/app/api/checkout/recover/route.ts', {
    stripe: Stripe, 'next/server': { NextResponse: { json: (body, opts) => ({ ...body, httpStatus: opts?.status || 200 }) } },
    '@clerk/nextjs/server': { auth: async () => ({ userId: 'user_fixture' }), clerkClient: async () => ({ users: { getUser: async () => user } }) },
    '@/lib/owner-auth': { verifiedPrimaryClerkEmail: u => u.emailAddresses.find(e => e.id === u.primaryEmailAddressId && e.verification.status === 'verified')?.emailAddress || '' },
    '@/lib/entitlements': entitlements,
    '@/lib/membership-trial': moduleFrom('src/lib/membership-trial.ts'),
    '@/lib/stripe-plans': { LAUNCH_BILLING_PLANS: { [selectedPlan.id]: selectedPlan }, getCheckoutPlanByPriceId: id => id === 'price_fixture' ? selectedPlan : null },
    '@/lib/gift-repository': { createGiftRepository: () => ({ findLiveDirectFounderCheckout: async () => founder ? { attemptId: 'attempt_fixture', checkoutSessionId: 'cs_fixture', userId: 'user_fixture' } : null, findDirectFounderOwnershipForUser: async () => null }) },
    '@/lib/membership-server': { activateMembership: async (...args) => activated.push(args) },
    '@/lib/referral-service': { reconcileReferredMembership: async () => {} },
    '@/lib/membership-trial-stripe': { enforceMembershipSubscriptionActivation: async () => ({ accepted: true }) },
  });
  return { run: route.POST, lists, activated, customerQueries };
}
test('F7 guest founder checkout recovers through durable owner session mapping, never global list', async () => {
  const h = harness({ founder: true, knownCustomer: false, primaryVerified: false });
  assert.equal((await h.run()).activated, true);
  assert.equal(h.activated[0][1].founderCheckoutAttemptId, 'attempt_fixture');
  assert.equal(h.lists.length, 0);
});
test('F7 refunded founder payment cannot be reactivated during recovery', async () => {
  const h = harness({ founder: true, refunded: true, knownCustomer: false, primaryVerified: false });
  assert.equal((await h.run()).activated, false);
  assert.equal(h.activated.length, 0);
});
test('F7 recovery uses customer-scoped pagination, never global sessions', async () => {
  const h = harness({ sessions: (args, session) => !args.customer ? { data: [], has_more: true } : args.starting_after ? { data: [session], has_more: false } : { data: [{ id: 'cs_incomplete', status: 'open' }], has_more: true } });
  assert.equal((await h.run()).activated, true);
  assert.equal(h.lists.length, 2);
  assert.ok(h.lists.every(args => args.customer === 'cus_fixture'));
  assert.equal(h.lists[1].starting_after, 'cs_incomplete');
});
test('F7 legacy recovery discovers only exact verified-email customers', async () => {
  const h = harness({ knownCustomer: false });
  assert.equal((await h.run()).activated, true);
  assert.equal(h.customerQueries[0]?.email, 'fixture@example.invalid');
  assert.equal(h.lists[0]?.customer, 'cus_fixture');
  const unverified = harness({ knownCustomer: false, primaryVerified: false });
  assert.equal((await unverified.run()).activated, false);
  assert.equal(unverified.lists.length, 0);
});
test('F7 customer pagination has a finite search budget and reports incompleteness', async () => {
  let i = 0;
  const h = harness({ sessions: () => ({ data: [{ id: 'cs_open_' + i++, status: 'open' }], has_more: true }) });
  const result = await h.run();
  assert.ok(h.lists.length <= 5);
  assert.equal(result.httpStatus, 503);
  assert.equal(h.activated.length, 0);
});
for (const scenario of [
  { label: 'changed subscription price', currentPrice: 'price_other' },
  { label: 'existing lifetime authority', publicMetadata: { tier: 'bottled-in-bond', plan: 'bib_lifetime', membershipStatus: 'active' } },
  { label: 'active gift authority', publicMetadata: { tier: 'barrel', plan: 'gift_barrel_annual', giftOrderId: 'gift_fixture', membershipStatus: 'active', giftAccessExpiresAt: '2099-01-01T00:00:00Z' } },
  { label: 'missing subscription', subscription: null },
  { label: 'canceled subscription', status: 'canceled' },
  { label: 'new current subscription', privateMetadata: { stripeSubscriptionId: 'sub_new' } },
  { label: 'free cancellation hold', publicMetadata: { tier: 'free', plan: 'free', membershipStatus: 'canceled' } },
  { label: 'foreign customer', sessions: (_a, s) => ({ data: [{ ...s, customer: 'cus_other' }], has_more: false }) },
  { label: 'foreign user', sessions: (_a, s) => ({ data: [{ ...s, metadata: { ...s.metadata, userId: 'user_other' } }], has_more: false }) },
  { label: 'gift', sessions: (_a, s) => ({ data: [{ ...s, metadata: { ...s.metadata, purchase_type: 'gift' } }], has_more: false }) },
  { label: 'nonmembership source', sessions: (_a, s) => ({ data: [{ ...s, metadata: { ...s.metadata, source: 'other' } }], has_more: false }) },
]) test(`F7 recovery rejects ${scenario.label}`, async () => { const h = harness(scenario); await h.run(); assert.equal(h.activated.length, 0); });
test('F7 browser retries transient failure with bounded backoff and marks only success', async () => {
  const storage = new Map(), timers = [];
  let calls = 0, reloads = 0, effect;
  const user = { id: 'user_fixture', publicMetadata: {}, reload: async () => reloads++ };
  const ctx = functions('src/lib/auth.ts', ['useAuth'], {
    useUser: () => ({ isLoaded: true, isSignedIn: true, user }), useClerk: () => ({}), useEffect: fn => { effect = fn; },
    resolveEffectiveMembershipTier: () => 'free', getEntitlements: () => ({}), isPaidTier: () => false,
    window: { sessionStorage: { getItem: k => storage.get(k), setItem: (k,v) => storage.set(k,v), removeItem: k => storage.delete(k) } },
    fetch: async () => { calls++; return calls === 1 ? { ok: false, status: 503 } : { ok: true, json: async () => ({ ok: true, activated: true }) }; },
    setTimeout: fn => { timers.push(fn); return timers.length; }, clearTimeout: () => {},
  });
  ctx.useAuth(); effect();
  await new Promise(resolve => setImmediate(resolve));
  assert.notEqual(storage.get('bourbon_signal_checkout_recover_user_fixture'), '1');
  assert.equal(timers.length, 1);
  timers.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(calls, 2); assert.equal(reloads, 1);
  assert.equal(storage.get('bourbon_signal_checkout_recover_user_fixture'), '1');
});
test('F6 configured headers permit same-origin geolocation only, keep camera/microphone denied', async () => {
  const config = moduleFrom('next.config.ts').default;
  const rules = await config.headers();
  const rule = rules.find(r => r.source.startsWith('/((?!'));
  const policy = rule.headers.find(h => h.key === 'Permissions-Policy').value;
  assert.match(policy, /geolocation=\(self\)/);
  assert.match(policy, /camera=\(\)/); assert.match(policy, /microphone=\(\)/);
  assert.doesNotMatch(policy, /geolocation=\(\*\)/);
});
