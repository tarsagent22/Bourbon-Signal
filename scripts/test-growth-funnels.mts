import assert from "node:assert/strict";
import { aggregateCampaignFunnels, aggregateGrowthFunnels, aggregateLifecycleCohorts } from "../src/lib/company-control-room.ts";

const now = new Date("2026-07-15T12:00:00.000Z");
const funnel = aggregateGrowthFunnels([
  { createdAt: "2026-07-14T12:00:00.000Z", privateMetadata: { firstTouch: { surface: "drop_feed" }, activation: { signup_started: "2026-07-14T11:55:00.000Z", registration_completed: "2026-07-14T12:00:00.000Z", onboarding_state_selected: "2026-07-14T12:10:00.000Z", free_value_reached: "2026-07-14T13:00:00.000Z", pricing_viewed: "2026-07-14T14:00:00.000Z", checkout_started: "2026-07-14T15:00:00.000Z", membership_activated: "2026-07-14T16:00:00.000Z", paid_activation_completed: "2026-07-14T17:00:00.000Z", first_alert_created: "2026-07-14T18:00:00.000Z" } } },
  { createdAt: "2026-07-14T12:00:00.000Z", publicMetadata: { role: "retailer" } },
  { createdAt: "2026-07-14T12:00:00.000Z", primaryEmailAddressId: "owner", emailAddresses: [{ id: "owner", emailAddress: "chandler@bourbonsignal.com" }] },
], now);
assert.equal(funnel.days7.accounts, 1);
assert.equal(funnel.days7.signupStarted, 1);
assert.equal(funnel.days7.registrationCompleted, 1);
assert.equal(funnel.days7.onboardingStateSelected, 1);
assert.equal(funnel.days30.firstAlertCreated, 1);
assert.equal(funnel.days7.bySource.drop_feed, 1);
assert.equal(funnel.days7.unknownAttribution, 0);

const campaign = "meta:paid_social:state-preview";
const campaignFunnels = aggregateCampaignFunnels([
  {
    createdAt: "2026-07-14T12:00:00.000Z",
    privateMetadata: {
      firstTouch: { surface: "homepage", campaign },
      activation: {
        signup_started: "2026-07-14T12:01:00.000Z",
        registration_completed: "2026-07-14T12:03:00.000Z",
        free_value_reached: "2026-07-14T12:10:00.000Z",
        pricing_viewed: "2026-07-14T12:20:00.000Z",
      },
    },
  },
  { createdAt: "2026-07-14T12:00:00.000Z", privateMetadata: { firstTouch: { surface: "homepage", campaign: "unknown" } } },
  { createdAt: "2026-07-14T12:00:00.000Z", privateMetadata: { firstTouch: { surface: "homepage", campaign: "meta:paid_social:alice-example-com" } } },
  { createdAt: "2026-07-14T12:00:00.000Z", privateMetadata: { firstTouch: { surface: "homepage", campaign: "meta:paid_social:state_preview" } } },
], now);
assert.deepEqual(campaignFunnels, [{
  campaign,
  accounts: 2,
  signupStarted: 1,
  registrationCompleted: 1,
  onboardingStateSelected: 0,
  freeValueReached: 1,
  pricingViewed: 1,
  checkoutStarted: 0,
  membershipActivated: 0,
  paidActivationCompleted: 0,
  firstAlertCreated: 0,
}]);

const lifecycle = aggregateLifecycleCohorts([
  { publicMetadata: { tier: "free" }, privateMetadata: { activation: {} } },
  { publicMetadata: { tier: "free" }, privateMetadata: { activation: { free_value_reached: "2026-07-14T13:00:00.000Z" } } },
  { publicMetadata: { tier: "standard", membershipStatus: "active", billingPlan: "standard_monthly" }, privateMetadata: { activation: { membership_activated: "2026-07-14T16:00:00.000Z" } } },
  { publicMetadata: { tier: "barrel", membershipStatus: "active", billingPlan: "barrel_monthly" }, privateMetadata: { activation: { paid_activation_completed: "2026-07-14T17:00:00.000Z" } } },
]);
assert.deepEqual(lifecycle, { freeNoValue: 1, freeValueNoPricing: 1, checkoutNotActivated: 0, paidSetupIncomplete: 1, activatedNoFirstAlert: 1 });
console.log("Growth funnel aggregation contract passed.");
