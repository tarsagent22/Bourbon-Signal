const ELIGIBLE_JULY_SALE_PLANS = new Set([
  "standard_annual",
  "barrel_annual",
  "bib_lifetime",
]);

const JULY_SALE_BASE_PRICE_CENTS: Record<string, number> = {
  standard_annual: 2499,
  barrel_annual: 4999,
  bib_lifetime: 4999,
};

export const JULY_SALE_PERCENT_OFF = 15;
export const JULY_SALE_CHECKOUT_CUTOFF_AT = "2026-08-01T03:00:00.000Z";
export const JULY_SALE_END_AT = "2026-08-01T04:00:00.000Z";
export const JULY_SALE_END_EPOCH_SECONDS = Math.floor(Date.parse(JULY_SALE_END_AT) / 1000);

type JulySaleState = "active" | "inactive" | "misconfigured";

export type JulySaleCheckoutConfig = {
  state: JulySaleState;
  configuredCouponId: string | null;
  couponId: string | null;
  allowPromotionCodes: boolean;
  expiresAt: number | null;
};

type CouponLike = {
  id?: string;
  valid?: boolean;
  percent_off?: number | null;
  duration?: string;
  redeem_by?: number | null;
  applies_to?: { products?: string[] } | null;
  metadata?: Record<string, string> | null;
};

type DiscountLike = {
  coupon?: string | { id?: string } | null;
};

export function isJulySaleEligiblePlan(planId: string) {
  return ELIGIBLE_JULY_SALE_PLANS.has(planId);
}

export function isJulySaleActive(now = new Date()) {
  const timestamp = now.getTime();
  return Number.isFinite(timestamp) && timestamp < Date.parse(JULY_SALE_CHECKOUT_CUTOFF_AT);
}

export function resolveJulySaleCouponId(rawCouponId: string | null | undefined, now = new Date()) {
  const couponId = String(rawCouponId || "").trim();
  return couponId && isJulySaleActive(now) ? couponId : null;
}

export function julySaleCheckoutConfig(planId: string, rawCouponId: string | null | undefined, now = new Date()): JulySaleCheckoutConfig {
  const configuredCouponId = String(rawCouponId || "").trim() || null;
  const eligibleAndOpen = isJulySaleEligiblePlan(planId) && isJulySaleActive(now);
  if (!eligibleAndOpen) {
    return {
      state: "inactive",
      configuredCouponId,
      couponId: null,
      allowPromotionCodes: true,
      expiresAt: null,
    };
  }
  if (!configuredCouponId) {
    return {
      state: "misconfigured",
      configuredCouponId: null,
      couponId: null,
      allowPromotionCodes: false,
      expiresAt: null,
    };
  }
  const remainingMs = Date.parse(JULY_SALE_END_AT) - now.getTime();
  const expiresAt = remainingMs <= 24 * 60 * 60 * 1000
    ? JULY_SALE_END_EPOCH_SECONDS
    : null;
  return {
    state: "active",
    configuredCouponId,
    couponId: configuredCouponId,
    allowPromotionCodes: false,
    expiresAt,
  };
}

export function buildJulySaleSessionFields(config: JulySaleCheckoutConfig) {
  if (config.state !== "active" || !config.couponId) {
    return { allow_promotion_codes: config.allowPromotionCodes };
  }
  const fields = {
    discounts: [{ coupon: config.couponId }],
  };
  return config.expiresAt
    ? { ...fields, expires_at: config.expiresAt }
    : fields;
}

export function sessionHasCouponId(discounts: DiscountLike[] | null | undefined, couponId: string | null | undefined) {
  const expected = String(couponId || "").trim();
  if (!expected) return false;
  return Boolean(discounts?.some((discount) => {
    const coupon = discount?.coupon;
    return typeof coupon === "string" ? coupon === expected : coupon?.id === expected;
  }));
}

export function validateJulySaleCoupon(coupon: CouponLike, productId: string, now = new Date()) {
  if (!coupon.valid) return "July sale coupon is not valid.";
  if (coupon.percent_off !== JULY_SALE_PERCENT_OFF) return "July sale coupon must be 15% off.";
  if (coupon.duration !== "once") return "July sale coupon must apply once.";
  if (coupon.redeem_by && coupon.redeem_by <= Math.floor(now.getTime() / 1000)) return "July sale coupon has expired.";
  const products = coupon.applies_to?.products || [];
  const backendRestricted = products.length === 0
    && coupon.metadata?.campaign === "july_sale_2026"
    && coupon.metadata?.provisioned_by === "bourbon_signal";
  if (!backendRestricted && !products.includes(productId)) return "July sale coupon does not apply to this product.";
  return null;
}

export function discountedCents(priceCents: number) {
  return Math.round(priceCents * (100 - JULY_SALE_PERCENT_OFF) / 100);
}

export function julySalePriceLabel(planId: string) {
  const basePrice = JULY_SALE_BASE_PRICE_CENTS[planId];
  if (!basePrice) return null;
  return `$${(discountedCents(basePrice) / 100).toFixed(2)}`;
}
