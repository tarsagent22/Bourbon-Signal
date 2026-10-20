const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleFrom } = require('./astra-security-test-helpers.cjs');
const entitlements = moduleFrom('src/lib/entitlements.ts');
const plans = moduleFrom('src/lib/stripe-plans.ts');
const catalog = moduleFrom('src/lib/membership-plan-catalog.ts');

function harness({ sold = 0, sessions = [], currentTier = 'free' } = {}) {
  const created = [], reserved = [], activated = [];
  const stripe = {
    prices: { retrieve: async id => {
      const plan = plans.getCheckoutPlanByPriceId(id);
      return { id, active: true, livemode: true, currency: 'usd', unit_amount: plan.amountCents,
        recurring: plan.interval ? { interval: plan.interval, interval_count: 1 } : null, product: { active: true } };
    } },
    checkout: { sessions: {
      list: async () => ({ data: sessions, has_more: false }),
      listLineItems: async () => ({ data: [{ price: { id: plans.getStripePriceId('barrel_monthly') }, quantity: 1 }], has_more: false }),
      create: async input => { created.push(input); return { id: 'cs_new', url: 'https://checkout.stripe.invalid/new' }; },
    } },
  };
  const user = { publicMetadata: {}, privateMetadata: {}, emailAddresses: [{ id: 'email_fixture', emailAddress: 'fixture@example.invalid' }], primaryEmailAddressId: 'email_fixture' };
  const route = moduleFrom('src/app/api/checkout/route.ts', {
    stripe: class Stripe { constructor() { return stripe; } },
    'next/server': { NextResponse: { json: (body, opts) => ({ ...body, status: opts?.status || 200 }) } },
    '@clerk/nextjs/server': { auth: async () => ({ userId: 'user_fixture' }), clerkClient: async () => ({ users: { getUser: async () => user, updateUserMetadata: async () => {} } }) },
    '@/lib/entitlements': entitlements,
    '@/lib/stripe-plans': plans,
    '@/lib/membership-plan-catalog': catalog,
    '@/lib/site-mode': { CHECKOUT_ENABLED: true },
    '@/lib/founder-allocation': { countFounderMemberships: () => sold },
    '@/lib/founder-reservations': { reconcileAllFounderReservationAuthority: async () => ({ users: [], availability: { claimed: sold } }) },
    '@/lib/gift-repository': { createGiftRepository: () => ({
      findLiveDirectFounderCheckout: async () => null,
      reserveDirectFounder: async (userId, attemptId) => { reserved.push(attemptId); return { attemptId, entitlementVersion: 'v1' }; },
      attachDirectFounderCheckout: async () => true,
    }) },
    '@/lib/membership-server': { activateMembership: async (...args) => activated.push(args) },
    '@/lib/referral-service': { reconcileReferredMembership: async () => {} },
    '@/lib/growth-events': { normalizeCheckoutSource: () => 'pricing', mergeGrowthMilestoneMetadata: () => ({ activation: {} }) },
    '@/lib/server-entitlements': { resolveServerEffectiveMembershipTier: async () => currentTier },
    '@/lib/membership-trial': moduleFrom('src/lib/membership-trial.ts'),
    '@/lib/membership-trial-stripe': { enforceMembershipSubscriptionActivation: async () => ({ accepted: true }) },
    '@/lib/july-sale': { julySaleCheckoutConfig: () => ({ state: 'inactive' }), buildJulySaleSessionFields: () => ({}), sessionHasCouponId: () => false },
  });
  return { created, reserved, activated, run: body => route.POST({ json: async () => body, nextUrl: { origin: 'https://www.bourbonsignal.com' } }) };
}

test('new monthly checkout charges the six dollar plan without a trial and never reuses an old trial session', async () => {
  const h = harness({ sessions: [{ id: 'cs_trial', status: 'open', url: 'https://checkout.stripe.invalid/old-trial', metadata: { userId: 'user_fixture', plan: 'barrel_monthly', trial_offer: 'monthly_7_day_v1' } }] });
  const response = await h.run({ plan: 'barrel_monthly' });
  assert.equal(response.status, 200); assert.equal(h.created.length, 1);
  assert.equal(h.created[0].mode, 'subscription');
  assert.equal(h.created[0].line_items[0].price, plans.getStripePriceId('barrel_monthly'));
  assert.equal(h.created[0].metadata.trial_offer, 'none');
  assert.equal(h.created[0].subscription_data.trial_period_days, undefined);
  assert.equal(h.created[0].subscription_data.trial_settings, undefined);
});

test('stale advertised trial requests cannot silently turn into a paid checkout', async () => {
  const h = harness(); const response = await h.run({ plan: 'barrel_monthly', trialOfferExpected: true });
  assert.equal(response.status, 409); assert.match(response.error, /Free trials have ended/);
  assert.equal(h.created.length, 0);
});

test('only monthly and lifetime Founder can start a new website purchase', async () => {
  for (const plan of ['standard_monthly', 'standard_annual', 'barrel_annual']) {
    const h = harness(); assert.equal((await h.run({ plan })).status, 410); assert.equal(h.created.length, 0);
  }
  const h = harness({ currentTier: 'barrel' }); assert.equal((await h.run({ plan: 'bib_lifetime' })).status, 200);
  assert.equal(h.created[0].mode, 'payment'); assert.equal(h.created[0].subscription_data, undefined);
  assert.equal(h.created[0].line_items[0].price, plans.getStripePriceId('bib_lifetime'));
  assert.equal(h.reserved.length, 1); assert.equal(h.activated.length, 0, 'checkout creation cannot grant lifetime access');
});

test('Founder allocation cap still prevents an extra lifetime checkout', async () => {
  const h = harness({ sold: 100 }); assert.equal((await h.run({ plan: 'bib_lifetime' })).status, 409);
  assert.equal(h.created.length, 0); assert.equal(h.reserved.length, 0);
});
