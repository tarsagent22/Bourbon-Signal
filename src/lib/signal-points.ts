import type { MembershipTier } from "./entitlements.ts";

export const SIGNAL_REDEMPTION_STATES = [
  "reserved", "details_required", "submitted", "approved", "packed",
  "digital_fulfillment", "shipped", "delivered", "canceled",
] as const;
export type SignalRedemptionState = typeof SIGNAL_REDEMPTION_STATES[number];
export type SignalRewardKey =
  | "sticker_pack" | "coaster_set" | "rocks_glass" | "glencairn"
  | "bourbon_shipping_gift_card_25" | "bourbon_shipping_gift_card_100" | "tshirt" | "rocks_glass_pair"
  | "glencairn_pair" | "hoodie";

export interface SignalRewardCatalogItem {
  key: SignalRewardKey;
  name: string;
  points: number;
  catalogVersion: 1;
  fulfillmentType: "physical" | "digital";
  usShippingIncluded: boolean;
  glassQuantity?: 1 | 2;
  engravingPointsPerGlass?: 125;
  apparel?: boolean;
  inventoryRemaining?: number | null;
}

export const SIGNAL_REWARD_CATALOG: SignalRewardCatalogItem[] = [
  { key: "sticker_pack", name: "Bourbon Signal sticker pack", points: 75, catalogVersion: 1, fulfillmentType: "physical", usShippingIncluded: true },
  { key: "rocks_glass", name: "Bourbon Signal rocks glass", points: 400, catalogVersion: 1, fulfillmentType: "physical", usShippingIncluded: true, glassQuantity: 1, engravingPointsPerGlass: 125 },
  { key: "glencairn", name: "Bourbon Signal Glencairn", points: 450, catalogVersion: 1, fulfillmentType: "physical", usShippingIncluded: true, glassQuantity: 1, engravingPointsPerGlass: 125 },
  { key: "bourbon_shipping_gift_card_100", name: "$100 bourbon-shipping partner gift card", points: 2600, catalogVersion: 1, fulfillmentType: "digital", usShippingIncluded: false },
];

// Hidden, inactive rewards stay recognizable so a lost-response retry can return
// the historical redemption instead of failing before the database idempotency check.
const SIGNAL_RETIRED_REWARD_CATALOG: SignalRewardCatalogItem[] = [
  { key: "bourbon_shipping_gift_card_25", name: "$25 bourbon-shipping partner gift card", points: 650, catalogVersion: 1, fulfillmentType: "digital", usShippingIncluded: false },
  { key: "coaster_set", name: "Bourbon Signal coaster set", points: 200, catalogVersion: 1, fulfillmentType: "physical", usShippingIncluded: true },
  { key: "tshirt", name: "Bourbon Signal T-shirt", points: 700, catalogVersion: 1, fulfillmentType: "physical", usShippingIncluded: true, apparel: true },
  { key: "rocks_glass_pair", name: "Pair of Bourbon Signal rocks glasses", points: 750, catalogVersion: 1, fulfillmentType: "physical", usShippingIncluded: true, glassQuantity: 2, engravingPointsPerGlass: 125 },
  { key: "glencairn_pair", name: "Pair of Bourbon Signal Glencairns", points: 850, catalogVersion: 1, fulfillmentType: "physical", usShippingIncluded: true, glassQuantity: 2, engravingPointsPerGlass: 125 },
  { key: "hoodie", name: "Bourbon Signal hoodie", points: 1200, catalogVersion: 1, fulfillmentType: "physical", usShippingIncluded: true, apparel: true },
];

export const SIGNAL_APPAREL_SIZES = ["S", "M", "L", "XL", "2XL", "3XL"] as const;
export const SIGNAL_APPAREL_COLORS = ["black", "charcoal", "cream"] as const;

type DetailResult = { ok: true; details: Record<string, unknown>; surchargePoints: number } | { ok: false; error: string; surchargePoints: 0 };
const text = (value: unknown) => typeof value === "string" ? value.replace(/\s+/gu, " ").trim() : "";

export function rewardCatalogItem(key: unknown) {
  return [...SIGNAL_REWARD_CATALOG, ...SIGNAL_RETIRED_REWARD_CATALOG].find((item) => item.key === key) || null;
}

export function canRedeemSignalPoints(tier: MembershipTier) {
  return tier !== "free";
}

export function normalizeRedemptionDetails(key: unknown, input: Record<string, unknown>): DetailResult {
  const item = rewardCatalogItem(key);
  if (!item) return { ok: false, error: "Choose an available reward.", surchargePoints: 0 };
  if (item.glassQuantity) {
    const glassStyle = input.glassStyle === "personal" ? "personal" : input.glassStyle === "standard" ? "standard" : null;
    if (!glassStyle) return { ok: false, error: "Choose the Bourbon Signal mark or personal engraving.", surchargePoints: 0 };
    if (glassStyle === "standard") return { ok: true, details: { glassStyle }, surchargePoints: 0 };
    const engravingText = text(input.engravingText);
    if (!/^[A-Za-z0-9][A-Za-z0-9 .,'&-]{0,17}$/u.test(engravingText)) {
      return { ok: false, error: "Engraving must be 1–18 letters, numbers, spaces, or simple punctuation.", surchargePoints: 0 };
    }
    return { ok: true, details: { glassStyle, engravingText }, surchargePoints: 125 * item.glassQuantity };
  }
  if (item.apparel) {
    const size = text(input.size).toUpperCase();
    const color = text(input.color).toLowerCase();
    if (!SIGNAL_APPAREL_SIZES.includes(size as typeof SIGNAL_APPAREL_SIZES[number])) return { ok: false, error: "Choose an apparel size.", surchargePoints: 0 };
    if (!SIGNAL_APPAREL_COLORS.includes(color as typeof SIGNAL_APPAREL_COLORS[number])) return { ok: false, error: "Choose an apparel color.", surchargePoints: 0 };
    return { ok: true, details: { size, color }, surchargePoints: 0 };
  }
  if (item.fulfillmentType === "digital") {
    const accountEmail = text(input.accountEmail).toLowerCase();
    if (input.age21Attested !== true) return { ok: false, error: "Confirm that you are 21 or older.", surchargePoints: 0 };
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(accountEmail)) return { ok: false, error: "A verified account email is required.", surchargePoints: 0 };
    return { ok: true, details: { age21Attested: true, accountEmail }, surchargePoints: 0 };
  }
  return { ok: true, details: {}, surchargePoints: 0 };
}

const LEGAL_TRANSITIONS: Record<SignalRedemptionState, ReadonlySet<SignalRedemptionState>> = {
  reserved: new Set(["details_required", "submitted", "canceled"]),
  details_required: new Set(["submitted", "canceled"]),
  submitted: new Set(["approved", "canceled"]),
  approved: new Set(["packed", "digital_fulfillment", "canceled"]),
  packed: new Set(["shipped"]),
  digital_fulfillment: new Set(["delivered"]),
  shipped: new Set(["delivered"]),
  delivered: new Set(),
  canceled: new Set(),
};

export function isLegalRedemptionTransition(from: SignalRedemptionState, to: SignalRedemptionState) {
  return LEGAL_TRANSITIONS[from]?.has(to) || false;
}
