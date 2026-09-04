const { test } = require('node:test');
const assert = require('node:assert/strict');
const { moduleFrom } = require('./astra-security-test-helpers.cjs');
const entitlements = moduleFrom('src/lib/entitlements.ts');
const trial = moduleFrom('src/lib/membership-trial.ts');
const plan = { id: 'standard_monthly', tier: 'standard' };
function harness({ status = 'unpaid', publicMetadata = {}, privateMetadata = {}, providerCustomer = 'cus_fixture', providerUser = 'user_fixture', swapDuringRetrieve = false } = {}) {
  let user = { id: 'user_fixture', publicMetadata: { tier: 'standard', plan: plan.id, membershipStatus: 'unpaid', stripeCustomerId: 'cus_fixture', ...publicMetadata }, privateMetadata: { stripeCustomerId: 'cus_fixture', stripeSubscriptionId: 'sub_current', stripePlan: plan.id, ...privateMetadata } };
  const writes = [], retrieved = [], trialCalls = [];
  const clerk = { users: { getUser: async () => structuredClone(user), getUserList: async () => ({ data: [structuredClone(user)] }), updateUserMetadata: async (_id, patch) => { writes.push(patch); user = { ...user, publicMetadata: { ...user.publicMetadata, ...patch.publicMetadata }, privateMetadata: { ...user.privateMetadata, ...patch.privateMetadata } }; } } };
  const stubs = { '@clerk/nextjs/server': { clerkClient: async () => clerk }, '@/lib/entitlements': entitlements, '@/lib/membership-trial': trial };
  for (const id of ['founder-allocation', 'growth-events', 'gift-repository', 'founder-reservations', 'server-entitlements', 'direct-founder-revocation']) stubs['@/lib/' + id] = {};
  const membership = moduleFrom('src/lib/membership-server.ts', stubs);
  let event;
  const stripe = { webhooks: { constructEvent: () => event }, subscriptions: { retrieve: async id => {
    retrieved.push(id);
    if (swapDuringRetrieve) user.privateMetadata.stripeSubscriptionId = 'sub_new';
    return { id, customer: providerCustomer, status, metadata: { userId: providerUser, plan: plan.id }, items: { data: [{ price: { id: 'price_fixture' } }] } };
  } } };
  class Stripe { constructor() { return stripe; } static errors = { StripeInvalidRequestError: class extends Error {} }; }
  const web = moduleFrom('src/app/api/webhooks/stripe/route.ts', { ...stubs, stripe: Stripe,
    'next/server': { NextResponse: { json: body => body } },
    '@/lib/stripe-plans': { getPlanByPriceId: () => plan, LAUNCH_BILLING_PLANS: { [plan.id]: plan } },
    '@/lib/membership-server': membership, '@/lib/referral-service': {}, '@/lib/gifts': { isGiftPurchase: () => false },
    '@/lib/gift-stripe-webhook': { handleGiftStripeEvent: async () => false, handleDirectFounderStripeEvent: async () => false },
    '@/lib/membership-trial-repository': { getMembershipTrialRepository: () => ({ markCanceled: async () => {} }) },
    '@/lib/membership-trial-stripe': { enforceMembershipSubscriptionActivation: async () => { trialCalls.push('enforce'); return { accepted: true }; }, isManagedMembershipTrial: () => false },
  });
  return { writes, retrieved, trialCalls, user: () => user, run: async (type, invoice) => {
    event = { id: 'evt_fixture', type, created: 1788480000, data: { object: { customer: 'cus_fixture', ...invoice } } };
    return web.POST({ headers: { get: () => 'fixture-signature' }, text: async () => 'fixture-body' });
  } };
}
for (const type of ['invoice.payment_failed', 'invoice.payment_succeeded']) {
  for (const invoice of [{ subscription: 'sub_old' }, { parent: { subscription_details: { subscription: 'sub_old' } } }, { parent: { subscription_details: { subscription: { id: 'sub_old' } } } }, {}]) {
    test(`F3 ${type} unrelated or customer-only invoice never writes ${JSON.stringify(invoice)}`, async () => {
      const h = harness(); await h.run(type, invoice); assert.equal(h.writes.length, 0);
    });
  }
  for (const status of ['active', 'trialing', 'canceled', 'unpaid', 'paused', 'past_due']) {
    test(`F3 ${type} reconciles current provider ${status}, not event status`, async () => {
      const h = harness({ status });
      await h.run(type, { parent: { subscription_details: { subscription: { id: 'sub_current' } } }, customer: { id: 'cus_fixture' } });
      assert.deepEqual(h.retrieved, ['sub_current']);
      assert.equal(h.user().publicMetadata.membershipStatus, status);
    });
  }
}
test('F3 gift overlay retains access and updates only matching previous subscription status', async () => {
  const h = harness({ status: 'unpaid', publicMetadata: { tier: 'barrel', plan: 'gift_barrel_annual', giftOrderId: 'gift_fixture', membershipStatus: 'active', giftPreviousMembership: { tier: 'standard', plan: plan.id, status: 'active' } } });
  await h.run('invoice.payment_succeeded', { subscription: 'sub_current' });
  assert.equal(h.user().publicMetadata.membershipStatus, 'active');
  assert.equal(h.user().publicMetadata.giftPreviousMembership.status, 'unpaid');
  assert.equal(h.user().publicMetadata.plan, 'gift_barrel_annual');
});
test('F3 founder access and refunded/canceled free hold cannot be resurrected by invoice', async () => {
  for (const publicMetadata of [{ tier: 'bottled-in-bond', plan: 'bib_lifetime', membershipStatus: 'lifetime' }, { tier: 'free', plan: 'free', membershipStatus: 'canceled' }]) {
    const h = harness({ status: 'active', publicMetadata });
    await h.run('invoice.payment_succeeded', { subscription: 'sub_current' });
    assert.equal(h.writes.length, 0);
  }
});
test('F3 subscription/customer ownership mismatch and authority changes during provider read fail closed', async () => {
  for (const args of [{ providerCustomer: 'cus_other' }, { providerUser: 'user_other' }, { swapDuringRetrieve: true }, { privateMetadata: { stripeSubscriptionId: null } }]) {
    const h = harness({ status: 'active', ...args });
    await h.run('invoice.payment_succeeded', { subscription: 'sub_current' });
    assert.equal(h.writes.length, 0);
  }
});
test('F3 duplicate recovered invoices retain original trial history', async () => {
  const h = harness({ status: 'active', privateMetadata: { membershipTrialStartedAt: '2026-08-01T00:00:00.000Z', membershipTrialSubscriptionId: 'sub_current' } });
  await h.run('invoice.payment_succeeded', { subscription: 'sub_current' });
  const converted = h.user().privateMetadata.membershipTrialConvertedAt;
  assert.ok(converted);
  await h.run('invoice.payment_failed', { subscription: { id: 'sub_current' } });
  assert.equal(h.user().privateMetadata.membershipTrialConvertedAt, converted);
  assert.equal(h.user().privateMetadata.membershipTrialStartedAt, '2026-08-01T00:00:00.000Z');
  assert.equal(h.user().publicMetadata.membershipStatus, 'active');
});
