import { STATE_LIFECYCLE_CONFIG } from "../config/stateLifecycle.ts";
import { TIER_ENTITLEMENTS } from "./entitlements.ts";

export type FaqVariant = "product" | "pricing";

export type FaqItem = {
  question: string;
  answer: string;
};

type FaqOptions = {
  founderSpotsRemaining?: number | null;
};

function coverageMarketLabels() {
  return STATE_LIFECYCLE_CONFIG.activeStates
    .map((code) => {
      const entry = STATE_LIFECYCLE_CONFIG.states[code];
      if (code === "MD-MONTGOMERY") {
        const maryland = STATE_LIFECYCLE_CONFIG.states["MD-MONTGOMERY"];
        return `${maryland.customerLabel} (${maryland.customerAreaLabel})`;
      }
      return entry.customerLabel;
    })
    .sort((left, right) => left.localeCompare(right));
}

function productFaqItems(): FaqItem[] {
  const markets = coverageMarketLabels();

  return [
    {
      question: "What is Bourbon Signal?",
      answer:
        "Bourbon Signal helps bourbon hunters find actionable bottle availability without digging through dozens of retailer, control-board, warehouse, distillery, and community sources. It combines those signals into one feed, labels their freshness and precision, and alerts members when meaningful activity matches their markets or bottle watchlists.",
    },
    {
      question: "Where is Bourbon Signal coverage available?",
      answer:
        `Bourbon Signal currently tracks signals across ${markets.length} states: ${markets.join(", ")}. Coverage is not identical in every state. Some markets support exact-store inventory, while others provide control-board deliveries, warehouse observations, lotteries, distillery releases, verified retailer reports, or broader release-watch signals. Each feed card identifies its location precision and signal type so you can tell whether it points to a specific store or a wider market.`,
    },
    {
      question: "What do the different feed signals mean—and is availability guaranteed?",
      answer:
        "No signal can guarantee that a bottle will still be available when you arrive. Bourbon inventory can change within minutes. Exact-store inventory and Verified retailer reports are the most actionable. Shipment, warehouse, allocation, and release-watch signals show where activity is developing but may not confirm shelf inventory. Tastings and lotteries are scheduled opportunities rather than bottle availability. Member Sightings are clearly labeled separately from official and verified-retailer sources. Always check the card’s timestamp, location precision, source, and availability note before making a trip.",
    },
    {
      question: "How do Bourbon Signal alerts work?",
      answer:
        "Choose the markets you care about, then decide whether you want anything notable nearby or only specific bottles from your watchlist. An alert area may be a state, control board, city, or individual store, depending on the precision available in that market. Standard Proof includes up to five specific alert areas and 15 watched bottles. Barrel Proof and Bottled in Bond remove those preference limits. Matching alerts can appear on-site and by email, with SMS available under each paid plan’s daily delivery cap. Bourbon Signal only sends alerts from fresh, alert-grade signals—not every broad release lead or feed item.",
    },
    {
      question: "What are verified retailer signals?",
      answer:
        "Approved retailers can report bottle availability directly to Bourbon Signal and publish scheduled drops, barrel picks, tastings, and lotteries. These cards are visually distinct and labeled “Verified retailer” so they are not confused with Member Sightings or broader market intelligence. “Available now” reports automatically expire after 24 hours unless the retailer updates them, and retailers can mark inventory sold out sooner. Availability can still change before you arrive, so verify before making a long trip.",
    },
    {
      question: "What are Member Sightings?",
      answer:
        "Signed-in members can report bottles seen in stores, available inventory, sold-out conditions, and other useful local observations. Photos are optional, and community voting helps identify useful reports. Member Sightings remain clearly labeled as community reports rather than official or verified-retailer inventory. Barrel Proof and Bottled in Bond members can also receive alerts when sightings match their selected bottles and markets.",
    },
    {
      question: "How does Bottle Check work?",
      answer:
        "Search a bottle to see its rarity, MSRP, Hunt Score, practical buying guidance, and recent signal history. When local evidence is available, Bottle Check also shows recent locations and activity over the last 30 and 90 days. Bottles with enough member ratings may display a community taste score. Paid members can add uncommon bottles to their watchlist directly from Bottle Check. Free accounts include three checks; paid plans include unlimited checks.",
    },
    {
      question: "How do My Shelf and recommendations work?",
      answer:
        "Every membership includes My Shelf for bottles you own or have tasted, ratings, tasting cues, and private notes. Standard Proof includes unlimited My Shelf capacity. My Shelf can suggest up to three bottles to hunt next, but Radar changes only when you choose the explicit watch action. Barrel Proof and Bottled in Bond add Bourbon DNA, personalized recommendations, and clearly labeled local opportunity context shaped by your collection. Recommendations are suggestions, not guarantees that a bottle is locally available.",
    },
    {
      question: "What is Hunt Outcome?",
      answer:
        "Hunt Outcome is an optional, private one-tap question on an expired Signal detail. You can record Found it, Gone when I checked, or Didn’t go, then edit the response quietly. It never changes Community standing or Signal validity, and Bourbon Signal does not publish individual responses or member/store rankings.",
    },
    {
      question: "Why doesn’t every state have the same store-level detail?",
      answer:
        "Alcohol inventory systems vary widely by state. Some control boards publish store-level quantities, while others expose only deliveries, warehouse activity, lotteries, release calendars, or no public inventory at all. Bourbon Signal preserves the most precise trustworthy location available instead of presenting broad market activity as exact shelf inventory. Coverage becomes more specific as reliable sources and verified retailers are added.",
    },
  ];
}

function pricingFaqItems(options: FaqOptions): FaqItem[] {
  const remaining = options.founderSpotsRemaining;
  const founderAvailability = typeof remaining === "number"
    ? `${remaining} of 100 Founder spots remain right now.`
    : "Membership is permanently limited to 100 people.";

  return [
    {
      question: "What can I do as a free member?",
      answer:
        "A free account includes a preview of the latest Drop Feed signals, up to three Bottle Checks, the Coverage Map, Member Sightings, and My Shelf. You can submit sightings and help other hunters. A paid membership unlocks the full feed, saved alert areas and bottle watchlists, live notification delivery, and additional dashboard tools.",
    },
    {
      question: "What is the difference between Standard Proof and Barrel Proof?",
      answer:
        "Standard Proof includes unlimited My Shelf capacity and is built for alerts and everyday hunting: the full feed, unlimited Bottle Checks, up to five alert areas, up to 15 tracked bottles, and on-site, email, and SMS delivery. Barrel Proof removes the alert-preference limits and adds Bourbon DNA and personalized collection intelligence, recommendations, local opportunities, Member Sighting alerts, and a higher SMS allowance.",
    },
    {
      question: "How do alerts and alert limits work?",
      answer:
        `Choose anything notable in your selected markets or narrow alerts to bottles on your watchlist. Standard Proof supports up to five specific alert areas, 15 tracked bottles, and up to ${TIER_ENTITLEMENTS.standard.smsDailyLimit} SMS alerts per day. Barrel Proof removes the area and bottle limits and supports up to ${TIER_ENTITLEMENTS.barrel.smsDailyLimit} SMS alerts per day. Bottled in Bond includes the same unlimited preferences with up to ${TIER_ENTITLEMENTS["bottled-in-bond"].smsDailyLimit} SMS alerts per day. On-site and email delivery are also available on paid plans.`,
    },
    {
      question: "What is the Bottled in Bond Founder membership?",
      answer:
        `Bottled in Bond is Bourbon Signal’s lifetime Founder membership: a one-time $50 purchase with no recurring subscription fee. It includes current and future paid product features, unlimited alert areas and bottle tracking, the highest SMS allowance, Founder recognition and member number, early access to new tools, and a numbered Founder’s glass. ${founderAvailability}`,
    },
    {
      question: "Can I cancel or change my membership?",
      answer:
        "Yes. Recurring memberships can be managed through the billing portal in your Bourbon Signal account. Cancellation stops future renewals, and paid access continues through the billing period you already purchased. Bottled in Bond is a one-time lifetime purchase and does not renew. Refund eligibility is governed by Bourbon Signal’s refund policy.",
    },
    {
      question: "Which features are available in each plan?",
      answer:
        "Free is designed for trying the feed, Bottle Check, the Coverage Map, community sightings, and My Shelf. Standard Proof unlocks the full feed, unlimited Bottle Checks, unlimited My Shelf capacity, saved alerts, bottle tracking, and notification delivery. Barrel Proof adds unlimited alert preferences, Bourbon DNA, personalized collection intelligence, recommendations, and Member Sighting alerts. Bottled in Bond includes the complete paid product as a lifetime Founder membership. The plan cards above show the current prices and exact alert limits.",
    },
  ];
}

export function getFaqItems(variant: FaqVariant, options: FaqOptions = {}): FaqItem[] {
  return variant === "pricing" ? pricingFaqItems(options) : productFaqItems();
}
