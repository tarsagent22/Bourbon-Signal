import assert from 'node:assert/strict';
import test from 'node:test';
import { getEntitlements, resolveEffectiveMembershipTier } from '../src/lib/entitlements.ts';
import { isPublicCheckoutPlanId, PAID_MEMBERSHIP_PLANS } from '../src/lib/membership-plan-catalog.ts';
import { getPlanByPriceId, getStripePriceId, getCheckoutPlanByPriceId } from '../src/lib/stripe-plans.ts';
import { membershipPortalConfiguration } from '../src/lib/stripe-membership-portal.ts';
import { buildSignalMemberProfile } from '../src/lib/signals/signal-api-contract.ts';

test('legacy Standard receives every paid capability while its billing identity stays intact', () => {
  const legacy = { tier: 'standard', plan: 'standard_monthly', membershipStatus: 'active' };
  const { tier: _legacyTier, ...legacyAccess } = getEntitlements(legacy);
  const { tier: _barrelTier, ...barrelAccess } = getEntitlements('barrel');
  assert.deepEqual(legacyAccess, barrelAccess);
  assert.equal(resolveEffectiveMembershipTier(legacy), 'standard');
  const plan = getPlanByPriceId(getStripePriceId('standard_monthly'));
  assert.equal(plan?.amountCents, 300);
  assert.equal(plan?.tier, 'standard');
  for (const status of ['canceled', 'unpaid', 'incomplete_expired']) {
    assert.equal(getEntitlements({ ...legacy, membershipStatus: status }).tier, 'free');
  }
});

test('new paid purchase catalog has exactly one six dollar monthly membership', () => {
  assert.deepEqual(PAID_MEMBERSHIP_PLANS.filter(plan => plan.monthlyPlan).map(plan => [plan.tier, plan.monthlyPrice, plan.monthlyPlan]), [['barrel', '$6', 'barrel_monthly']]);
  assert.deepEqual(PAID_MEMBERSHIP_PLANS.filter(plan => plan.plan).map(plan => [plan.tier, plan.oneTimePrice, plan.plan]), [['bottled-in-bond', '$50', 'bib_lifetime']]);
  for (const plan of ['standard_monthly', 'standard_annual', 'barrel_annual'] as const) assert.equal(isPublicCheckoutPlanId(plan), false);
  assert.equal(isPublicCheckoutPlanId('bib_lifetime'), true);
  assert.equal(isPublicCheckoutPlanId('barrel_monthly'), true);
});

test('historical billing prices remain recognizable without becoming new checkout options', () => {
  const prices = {
    price_1TkwxnLQlLvo1rCD2hDbL62C: 'standard_monthly',
    price_1TkwykLQlLvo1rCD2wG0be1z: 'standard_annual',
    price_1Tkx2JLQlLvo1rCDMthvD4nR: 'barrel_monthly',
    price_1Tkx37LQlLvo1rCDTHdDBNlJ: 'barrel_annual',
    price_1TkEDlLQlLvo1rCDMBsIeOPR: 'bib_lifetime',
  };
  for (const [price, plan] of Object.entries(prices)) {
    assert.equal(getPlanByPriceId(price)?.id, plan);
    assert.equal(getCheckoutPlanByPriceId(price), null);
  }
});

test('Free retains its existing limits and Founder keeps lifetime access', () => {
  const free = getEntitlements('free');
  assert.equal(free.feedPreviewLimit, 6); assert.equal(free.collectionBottleLimit, 10);
  assert.equal(free.bottleCheckLimit, 3); assert.equal(free.alertAreaLimit, 0);
  assert.equal(free.canReceiveSightingsAlerts, false); assert.equal(free.canUseBourbonDna, false);
  assert.equal(getEntitlements({ tier: 'bottled-in-bond', plan: 'bib_lifetime', membershipStatus: 'lifetime' }).canUseRecommendations, true);
});

test('legacy monthly profile displays the early member rate without changing billing identity', () => {
  const metadata = { tier: 'standard', plan: 'standard_monthly', membershipStatus: 'active', grandfatheredMonthlyRateCents: 300 };
  assert.equal(buildSignalMemberProfile(metadata, getEntitlements(metadata)).profile.membership.grandfatheredRate, '$3');
  for (const plan of ['standard_annual', 'gift_standard_annual', 'barrel_monthly']) {
    assert.equal(buildSignalMemberProfile({ tier: 'standard', plan }, getEntitlements(metadata)).profile.membership.grandfatheredRate, undefined);
  }
  assert.equal(buildSignalMemberProfile({ ...metadata, membershipStatus: 'canceled' }, getEntitlements('free')).profile.membership.grandfatheredRate, undefined);
});

test('billing portal permits payment recovery and period-end cancellation without replacing legacy prices', async () => {
  const created: Array<Record<string, any>> = [];
  const safe = { id: 'bpc_safe', metadata: { bourbon_signal_policy: 'single_paid_membership_v1' }, features: { subscription_update: { enabled: false }, subscription_cancel: { enabled: true, mode: 'at_period_end' } } };
  let configurations: any[] = [safe];
  const stripe = { billingPortal: { configurations: {
    list: async function* () { yield* configurations; },
    create: async (input: Record<string, any>) => { created.push(input); return { id: 'bpc_new' }; },
  } } } as unknown as Parameters<typeof membershipPortalConfiguration>[0];
  assert.equal(await membershipPortalConfiguration(stripe), 'bpc_safe');
  assert.equal(created.length, 0);
  configurations = [{ ...safe, features: { ...safe.features, subscription_update: { enabled: true } } }];
  assert.equal(await membershipPortalConfiguration(stripe), 'bpc_new');
  assert.equal(created[0].features.subscription_update.enabled, false);
  assert.equal(created[0].features.subscription_cancel.mode, 'at_period_end');
  assert.equal(created[0].features.payment_method_update.enabled, true);
});
