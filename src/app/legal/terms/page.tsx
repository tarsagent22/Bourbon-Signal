import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Terms of Service — Bourbon Signal",
  description: "Terms governing use of Bourbon Signal alerts, drop feed, Bottle Check, and subscription features.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      updated="June 9, 2026"
      intro="These Terms govern your access to Bourbon Signal, including our website, drop feed, Bottle Check, alert tools, subscriptions, and related services. Bourbon Signal is operated by Todd Digital Ventures LLC."
      sections={[
        {
          heading: "1. What Bourbon Signal does",
          body: [
            "Bourbon Signal provides informational tools that help users monitor public, retailer-published, and government-published bourbon availability signals. These signals may include store-level inventory reports, shipment records, release windows, product listings, and other source-derived availability indicators.",
            "Bourbon Signal does not sell, ship, broker, reserve, purchase, or deliver alcoholic beverages. We are not a retailer, wholesaler, marketplace, delivery service, or alcohol licensee.",
          ],
        },
        {
          heading: "2. Eligibility and responsible use",
          body: [
            "You must be at least 21 years old to use Bourbon Signal. By using the service, you confirm that you are of legal drinking age in your jurisdiction.",
            "You are responsible for complying with all federal, state, and local laws related to alcohol purchases, possession, transportation, and consumption. Store policies, purchase limits, eligibility rules, and local alcohol laws may vary.",
          ],
        },
        {
          heading: "3. Data accuracy and availability",
          body: [
            "Bourbon Signal is a best-effort intelligence service. Source data can be delayed, incomplete, inaccurate, stale, duplicated, changed, removed, or interpreted differently by the original source. Inventory may sell out quickly. Shipment data may not mean a bottle is available on a specific store shelf.",
            "You should always verify availability, price, purchase limits, location, and eligibility directly with the retailer or official source before driving, making a purchase decision, or relying on a signal.",
            "We may label signals by type, such as in-stock inventory, shipment intelligence, release watch, or informational-only data. These labels are intended to reduce confusion but do not guarantee availability or accuracy.",
          ],
        },
        {
          heading: "4. Accounts and subscriptions",
          body: [
            "Certain features require an account. You are responsible for keeping your account information accurate and secure and for all activity that occurs through your account.",
            "Paid subscriptions renew automatically unless canceled before the next billing period. Pricing, plans, trial periods, and features may change over time, but we will make reasonable efforts to communicate material changes before they affect active subscribers.",
            "Payment processing is handled by third-party providers such as Stripe. We do not store your full payment card details on our servers.",
          ],
        },
        {
          heading: "5. Alerts and notifications",
          body: [
            "Alerts are not guaranteed to be delivered instantly or at all. Delivery can be affected by source availability, data refresh timing, email providers, spam filters, user preferences, service outages, and other factors outside our control.",
            "An alert is not a guarantee that a bottle is currently available, reserved, fairly priced, or purchasable by you. Always verify before acting on an alert.",
          ],
        },
        {
          heading: "6. Acceptable use",
          body: [
            "You may not abuse, disrupt, reverse engineer, scrape at unreasonable volume, resell, republish, or commercially exploit Bourbon Signal data without written permission. You may not use the service to violate laws, harass retailers or staff, or interfere with source systems.",
            "We may suspend or terminate access if we believe your use creates legal, security, operational, or reputational risk for Bourbon Signal, our users, or source providers.",
          ],
        },
        {
          heading: "7. Intellectual property",
          body: [
            "Bourbon Signal, including its design, software, data transformations, signal labels, analysis, and original content, is owned by Todd Digital Ventures LLC or its licensors. Source names, retailer names, product names, and trademarks belong to their respective owners.",
            "Reference to a retailer, government agency, product, brand, or source does not imply partnership, sponsorship, endorsement, or affiliation unless expressly stated.",
          ],
        },
        {
          heading: "8. Disclaimers and limitation of liability",
          body: [
            "The service is provided as-is and as-available. To the fullest extent permitted by law, we disclaim warranties of accuracy, availability, merchantability, fitness for a particular purpose, and non-infringement.",
            "To the fullest extent permitted by law, Todd Digital Ventures LLC and Bourbon Signal will not be liable for indirect, incidental, special, consequential, punitive, or lost-profit damages, or for decisions made based on signals, alerts, prices, availability, or source data displayed through the service.",
          ],
        },
        {
          heading: "9. Changes to these Terms",
          body: [
            "We may update these Terms as Bourbon Signal evolves. The updated date above indicates the latest revision. Continued use of the service after changes means you accept the updated Terms.",
          ],
        },
      ]}
    />
  );
}
