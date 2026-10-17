import type Stripe from "stripe";

// A dedicated portal keeps legacy subscriptions editable for payment and cancellation
// without exposing retired prices or accidentally replacing an early member's rate.
export async function membershipPortalConfiguration(stripe: Stripe) {
  for await (const configuration of stripe.billingPortal.configurations.list({ active: true, limit: 100 })) {
    if (configuration.metadata?.bourbon_signal_policy === "single_paid_membership_v1"
      && !configuration.features.subscription_update.enabled
      && configuration.features.subscription_cancel.enabled
      && configuration.features.subscription_cancel.mode === "at_period_end") return configuration.id;
  }
  const configuration = await stripe.billingPortal.configurations.create({
    business_profile: { headline: "Manage your Bourbon Signal membership" },
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: { enabled: false },
    },
    metadata: { bourbon_signal_policy: "single_paid_membership_v1" },
  }, { idempotencyKey: "bourbon-signal-single-membership-portal-v1" });
  return configuration.id;
}
