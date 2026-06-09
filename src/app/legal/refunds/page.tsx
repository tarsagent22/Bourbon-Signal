import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Refund and Cancellation Policy — Bourbon Signal",
  description: "Cancellation, renewal, refund, and billing policy for Bourbon Signal subscriptions.",
};

export default function RefundsPage() {
  return (
    <LegalPage
      title="Refund & Cancellation Policy"
      updated="June 9, 2026"
      intro="This policy explains how subscription renewals, cancellations, and refund requests work for Bourbon Signal, operated by Todd Digital Ventures LLC."
      sections={[
        {
          heading: "1. Subscription billing",
          body: [
            "Paid Bourbon Signal plans are billed in advance on a recurring basis according to the plan you select. By subscribing, you authorize our payment processor to charge your payment method for recurring subscription fees and applicable taxes or fees.",
            "Your billing period, renewal date, and plan price will be shown during checkout or in your account/subscription management flow where available.",
          ],
        },
        {
          heading: "2. Cancellation",
          body: [
            "You may cancel your subscription at any time through the account, billing portal, or by contacting support if the self-service portal is unavailable.",
            "Cancellation stops future renewals. Unless otherwise stated, your access continues through the end of the current paid billing period after cancellation.",
          ],
        },
        {
          heading: "3. Refunds",
          body: [
            "Bourbon Signal subscriptions are generally non-refundable once a billing period begins. We do not typically provide prorated refunds for partial months or unused time after cancellation.",
            "That said, we want early users to trust the product. If you believe you were charged in error, experienced a serious service problem, or have a good-faith issue with your subscription, contact support and we will review the request case by case.",
          ],
        },
        {
          heading: "4. Trials, beta pricing, and promotional plans",
          body: [
            "We may offer free trials, beta pricing, founding member pricing, coupons, or promotional periods. Promotional terms may be limited to specific users, dates, features, states, or plans and may change or expire.",
            "If a trial converts into a paid subscription, the checkout or trial flow will describe the timing and price before billing begins.",
          ],
        },
        {
          heading: "5. Service changes and outages",
          body: [
            "Bourbon Signal depends on public and third-party data sources that can change, fail, block access, degrade, or become unavailable. Temporary outages, delayed alerts, source failures, or reduced coverage do not automatically entitle you to a refund.",
            "If a major paid feature becomes unavailable for an extended period, we may choose to offer account credits, extensions, plan adjustments, or refunds at our discretion.",
          ],
        },
        {
          heading: "6. Chargebacks",
          body: [
            "If you have a billing issue, please contact support before filing a chargeback so we can try to resolve it quickly. We may suspend or close accounts associated with disputed payments, fraud, or payment abuse.",
          ],
        },
        {
          heading: "7. Taxes and payment processor fees",
          body: [
            "Subscription prices may not include taxes unless stated otherwise. Taxes, payment processor fees, and currency or bank charges may be handled by third-party payment providers and may vary by location.",
          ],
        },
      ]}
    />
  );
}
