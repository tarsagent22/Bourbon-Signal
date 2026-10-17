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
        "Choose the markets you care about, then decide whether you want anything notable nearby or only specific bottles from your watchlist. An alert area may be a state, control board, city, or individual store, depending on the precision available in that market. Barrel Proof includes unlimited alert areas and watched bottles for all paid members, including early members on legacy billing rates. Matching alerts appear in your inbox and through push notifications. Bourbon Signal only sends alerts from fresh, alert-grade signals—not every broad release lead or feed item.",
    },
    {
      question: "What are verified retailer signals?",
      answer:
        "Approved retailers can report bottle availability directly to Bourbon Signal and publish scheduled drops, barrel picks, tastings, and lotteries. These cards are visually distinct and labeled “Verified retailer” so they are not confused with Member Sightings or broader market intelligence. “Available now” reports automatically expire after 24 hours unless the retailer updates them, and retailers can mark inventory sold out sooner. Availability can still change before you arrive, so verify before making a long trip.",
    },
    {
      question: "What are Member Sightings?",
      answer:
        "Signed-in members can report bottles seen in stores, available inventory, sold-out conditions, and other useful local observations. Photos are optional, and community voting helps identify useful reports. Member Sightings remain clearly labeled as community reports rather than official or verified-retailer inventory. Paid members can also receive alerts when sightings match their selected bottles and markets.",
    },
    {
      question: "How do I add bottles to My Shelf?",
      answer:
        "Search by bottle name when adding to My Shelf. Save bottles you own or whiskies you have tasted, then add a rating, taste notes, and how many bottles you have. If the bottle is missing from the catalog, add it yourself.",
    },
    {
      question: "How do My Shelf and recommendations work?",
      answer:
        "Every membership includes My Shelf for bottles you own or have tasted, ratings, tasting cues, and private notes. Paid members have unlimited My Shelf capacity. My Shelf can suggest up to three bottles to hunt next, but Radar changes only when you choose the explicit watch action. Paid membership includes Bourbon DNA, personalized recommendations, and clearly labeled local opportunity context shaped by your collection. Recommendations are suggestions, not guarantees that a bottle is locally available.",
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

function pricingFaqItems(_options: FaqOptions): FaqItem[] {
  return [
    { question: "What can I do as a free member?", answer: "Free includes 6 recent Intel signals, the Community feed, 3 bottle lookups, 10 bottles on My Shelf, and the ability to post sightings and earn Signal Points." },
    { question: "What does Barrel Proof include?", answer: "Barrel Proof is $6/month and includes every paid feature: the full Intel feed, unlimited alert areas and watched bottles, push and Community alerts, advanced filters and bottle search, unlimited My Shelf, Bourbon DNA, recommendations, and Signal Points redemption." },
    { question: "What happens to my Standard Proof membership?", answer: "Existing Standard Proof members receive every Barrel Proof feature automatically. Existing $3/month Stripe subscriptions keep that rate while the subscription continues. After it ends, a new subscription uses the current $6/month price." },
    { question: "What happens to existing Founder memberships?", answer: "Existing Founder memberships keep full lifetime access, Founder recognition, and their member number. No recurring subscription is required." },
    { question: "How do I cancel?", answer: "Manage your membership in your account through the provider that bills you. Cancellation stops future renewals. Full access continues through the period already paid for, then the account returns to Free. Existing collection entries remain available." },
  ];
}

export function getFaqItems(variant: FaqVariant, options: FaqOptions = {}): FaqItem[] {
  return variant === "pricing" ? pricingFaqItems(options) : productFaqItems();
}
