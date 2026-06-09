import type { Metadata } from "next";
import LegalPage from "@/components/LegalPage";

export const metadata: Metadata = {
  title: "Data and Alcohol Disclaimer — Bourbon Signal",
  description: "Important Bourbon Signal disclaimers about alcohol sales, source data, alerts, shipment intelligence, and inventory accuracy.",
};

export default function DisclaimerPage() {
  return (
    <LegalPage
      title="Data & Alcohol Disclaimer"
      updated="June 9, 2026"
      intro="Bourbon Signal is built to make public bourbon availability signals easier to understand. This page explains the limits of those signals and how users should interpret them."
      sections={[
        {
          heading: "1. Bourbon Signal does not sell alcohol",
          body: [
            "Bourbon Signal is an informational software service. We do not sell, ship, deliver, broker, purchase, reserve, raffle, allocate, or transfer alcoholic beverages. We are not an alcohol retailer, wholesaler, marketplace, fulfillment service, or delivery service.",
            "Any purchase decision happens directly between you and a licensed retailer, government-controlled store, ABC board, or other authorized seller, subject to that seller’s rules and applicable law.",
          ],
        },
        {
          heading: "2. Must be 21+",
          body: [
            "Bourbon Signal is intended only for users who are at least 21 years old. Do not use Bourbon Signal if you are under the legal drinking age in your jurisdiction.",
            "Please drink responsibly and comply with all laws regarding purchase, possession, transportation, and consumption of alcoholic beverages.",
          ],
        },
        {
          heading: "3. Inventory signals are not guarantees",
          body: [
            "Inventory data can change quickly. A bottle shown as available may be sold out, held, limited, incorrectly listed, unavailable for online purchase, unavailable for pickup, subject to purchase limits, or unavailable to you for legal or store-policy reasons.",
            "Always verify directly with the store or official source before driving, making plans, or relying on a signal. Bourbon Signal cannot guarantee that any bottle will be available when you arrive.",
          ],
        },
        {
          heading: "4. Shipment and board-level data are different from shelf inventory",
          body: [
            "Some Bourbon Signal entries are shipment intelligence or board-level data. Shipment data may indicate that product moved to a board, warehouse, region, store system, or other destination, but it does not necessarily mean a bottle is on a specific shelf or available for purchase now.",
            "Where possible, Bourbon Signal labels source types and caveats so users can distinguish store-level inventory from broader planning intelligence.",
          ],
        },
        {
          heading: "5. Release windows, watch signals, and catalog listings",
          body: [
            "Release announcements, catalog pages, product listings, lottery windows, and watch signals may be useful planning information, but they are not the same as verified inventory. A product appearing in a catalog or release page does not guarantee availability.",
          ],
        },
        {
          heading: "6. Source relationships",
          body: [
            "Bourbon Signal may reference retailers, ABC boards, government agencies, brands, products, and public sources. Unless expressly stated, those references do not imply partnership, sponsorship, endorsement, authorization, or affiliation.",
            "Product names, retailer names, agency names, and trademarks belong to their respective owners.",
          ],
        },
        {
          heading: "7. Best-effort alerts",
          body: [
            "Alerts are best-effort. They may be delayed, missed, duplicated, filtered, blocked, or inaccurate due to source timing, technical issues, email delivery, user settings, or other factors. An alert is a prompt to verify, not a guarantee to buy.",
          ],
        },
        {
          heading: "8. User responsibility",
          body: [
            "You are responsible for your own decisions, travel, purchases, legal compliance, and interactions with retailers or store staff. Be respectful, follow store rules, and verify before driving.",
          ],
        },
      ]}
    />
  );
}
