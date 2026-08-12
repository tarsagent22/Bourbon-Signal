import type { MembershipTier } from "./entitlements";

export type GiftPlanId = "standard_annual_gift" | "barrel_annual_gift" | "founder_lifetime_gift";
export type GiftAccessKind = "annual" | "lifetime";

export type GiftPlan = {
  id: GiftPlanId;
  tier: Exclude<MembershipTier, "free">;
  label: string;
  amountCents: number;
  priceId: string;
  access: GiftAccessKind;
};

export const GIFT_PLANS: Record<GiftPlanId, GiftPlan> = {
  standard_annual_gift: {
    id: "standard_annual_gift",
    tier: "standard",
    label: "Standard Proof annual gift",
    amountCents: 3000,
    priceId: "price_1U3Sa9LQlLvo1rCDdwT70E4N",
    access: "annual",
  },
  barrel_annual_gift: {
    id: "barrel_annual_gift",
    tier: "barrel",
    label: "Barrel Proof annual gift",
    amountCents: 6000,
    priceId: "price_1U3SYmLQlLvo1rCDNC1f2MLS",
    access: "annual",
  },
  founder_lifetime_gift: {
    id: "founder_lifetime_gift",
    tier: "bottled-in-bond",
    label: "Founder lifetime gift",
    amountCents: 5000,
    priceId: "price_1U3SVrLQlLvo1rCDsnOcKOQM",
    access: "lifetime",
  },
};

export type GiftOrderInput = {
  plan?: unknown;
  purchaserName?: unknown;
  recipientName?: unknown;
  recipientEmail?: unknown;
  message?: unknown;
  deliveryMode?: unknown;
  scheduledLocalDateTime?: unknown;
  deliveryTimezone?: unknown;
};

export type NormalizedGiftOrderInput = {
  plan: GiftPlanId;
  purchaserName: string | null;
  recipientName: string;
  recipientEmail: string;
  message: string | null;
  deliveryMode: "now" | "scheduled";
  scheduledLocalDateTime: string | null;
  scheduledDeliveryAt: string | null;
  deliveryTimezone: string | null;
};

type NormalizeResult = { ok: true; value: NormalizedGiftOrderInput } | { ok: false; error: string };

function cleanText(value: unknown) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim()
    : "";
}

function validEmail(value: string) {
  return value.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function isIanaTimeZone(value: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: value }).format(new Date());
    return value.includes("/") || value === "UTC";
  } catch {
    return false;
  }
}

function zonedParts(date: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month"), day: value("day"), hour: value("hour"), minute: value("minute"), second: value("second") };
}

export function localDateTimeToUtc(localDateTime: string, timeZone: string) {
  const match = localDateTime.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);
  if (!match || !isIanaTimeZone(timeZone)) return null;
  const desired = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: 0,
  };
  const desiredEpoch = Date.UTC(desired.year, desired.month - 1, desired.day, desired.hour, desired.minute, 0);
  const canonical = new Date(desiredEpoch);
  if (canonical.getUTCFullYear() !== desired.year || canonical.getUTCMonth() + 1 !== desired.month || canonical.getUTCDate() !== desired.day || desired.hour > 23 || desired.minute > 59) return null;
  let candidate = desiredEpoch;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const actual = zonedParts(new Date(candidate), timeZone);
    const actualEpoch = Date.UTC(actual.year, actual.month - 1, actual.day, actual.hour, actual.minute, actual.second);
    candidate += desiredEpoch - actualEpoch;
  }
  const result = new Date(candidate);
  const actual = zonedParts(result, timeZone);
  return Object.entries(desired).every(([key, value]) => actual[key as keyof typeof actual] === value) ? result : null;
}

export function normalizeGiftOrderInput(input: GiftOrderInput, now = new Date()): NormalizeResult {
  const plan = cleanText(input.plan) as GiftPlanId;
  if (!Object.hasOwn(GIFT_PLANS, plan)) return { ok: false, error: "Choose a valid annual or Founder gift." };
  const purchaserName = cleanText(input.purchaserName);
  const recipientName = cleanText(input.recipientName);
  const recipientEmail = cleanText(input.recipientEmail).toLowerCase();
  const message = cleanText(input.message);
  if (!recipientName || recipientName.length > 100) return { ok: false, error: "Recipient name must be 1 to 100 characters." };
  if (purchaserName.length > 100) return { ok: false, error: "Purchaser name must be at most 100 characters." };
  if (!validEmail(recipientEmail)) return { ok: false, error: "Enter a valid recipient email." };
  if (message.length > 1000) return { ok: false, error: "Gift message must be at most 1,000 characters." };
  const deliveryMode = input.deliveryMode === "scheduled" ? "scheduled" : input.deliveryMode === "now" ? "now" : null;
  if (!deliveryMode) return { ok: false, error: "Choose send now or schedule delivery." };
  let scheduledLocalDateTime: string | null = null;
  let scheduledDeliveryAt: string | null = null;
  let deliveryTimezone: string | null = null;
  if (deliveryMode === "scheduled") {
    scheduledLocalDateTime = cleanText(input.scheduledLocalDateTime);
    deliveryTimezone = cleanText(input.deliveryTimezone);
    const utc = localDateTimeToUtc(scheduledLocalDateTime, deliveryTimezone);
    const maximum = new Date(now.getTime() + 366 * 24 * 60 * 60 * 1000);
    if (!utc || utc <= now || utc > maximum) return { ok: false, error: "Scheduled delivery must be a valid future time within one year." };
    scheduledDeliveryAt = utc.toISOString();
  }
  return {
    ok: true,
    value: {
      plan, purchaserName: purchaserName || null, recipientName, recipientEmail,
      message: message || null, deliveryMode, scheduledLocalDateTime, scheduledDeliveryAt, deliveryTimezone,
    },
  };
}

type StripePriceLike = {
  id?: string;
  active?: boolean;
  livemode?: boolean;
  currency?: string;
  unit_amount?: number | null;
  recurring?: unknown;
  product?: string | { active?: boolean; deleted?: boolean | void };
};

export function validateGiftStripePrice(price: StripePriceLike, plan: GiftPlan, requireLive = true) {
  if (price.id !== plan.priceId) return "Gift Stripe Price does not match the configured exact price.";
  if (price.active !== true) return "Gift Stripe Price is not active.";
  if (requireLive && price.livemode !== true) return "Gift Stripe Price is not a live-mode price.";
  if (price.currency?.toLowerCase() !== "usd") return "Gift Stripe Price currency must be USD.";
  if (price.unit_amount !== plan.amountCents) return "Gift Stripe Price amount does not match the advertised amount.";
  if (price.recurring) return "Gift Stripe Price must be one-time, not recurring.";
  if (typeof price.product === "string" || !price.product || price.product.deleted || price.product.active !== true) return "Gift Stripe product must be active and expanded.";
  return null;
}

export function addOneCalendarYear(start: Date) {
  const result = new Date(start.getTime());
  const month = result.getUTCMonth();
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCFullYear(result.getUTCFullYear() + 1);
  result.setUTCMonth(month);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), month + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

const TIER_RANK: Record<MembershipTier, number> = { free: 0, standard: 1, barrel: 2, "bottled-in-bond": 3 };

export function canRedeemGiftForMembership(giftTier: Exclude<MembershipTier, "free">, currentTier: MembershipTier, currentGiftOrderId: string | null) {
  if (currentGiftOrderId) return false;
  return TIER_RANK[currentTier] < TIER_RANK[giftTier];
}

export function isGiftPurchase(metadata: Record<string, unknown> | null | undefined) {
  return metadata?.purchase_type === "gift";
}
