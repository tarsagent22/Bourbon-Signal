import { unstable_cache } from "next/cache";
import Stripe from "stripe";
import { getStripePriceId } from "@/lib/stripe-plans";
import {
  isJulySaleActive,
  julySaleCheckoutConfig,
  validateJulySaleCoupon,
} from "@/lib/july-sale";

const ELIGIBLE_PLANS = ["standard_annual", "barrel_annual", "bib_lifetime"] as const;

const validateConfiguredSale = unstable_cache(async () => {
  const secretKey = String(process.env.STRIPE_SECRET_KEY || process.env.STRIPE_SECRET_KEY_LIVE || "").trim();
  const couponId = String(process.env.STRIPE_JULY_SALE_COUPON_ID || "").trim();
  if (!secretKey || !couponId) {
    console.warn("July sale readiness is disabled because required Stripe configuration is missing.");
    return false;
  }

  try {
    const stripe = new Stripe(secretKey);
    const coupon = await stripe.coupons.retrieve(couponId);
    const prices = await Promise.all(ELIGIBLE_PLANS.map(async (planId) => {
      const priceId = getStripePriceId(planId);
      if (!priceId) return null;
      return stripe.prices.retrieve(priceId);
    }));
    if (prices.some((price) => !price)) {
      console.warn("July sale readiness failed because an eligible production price is missing.");
      return false;
    }
    const validationErrors = prices.map((price, index) => {
      if (!price) return `${ELIGIBLE_PLANS[index]}: missing price`;
      const productId = typeof price.product === "string" ? price.product : price.product.id;
      const error = validateJulySaleCoupon(coupon, productId);
      return error ? `${ELIGIBLE_PLANS[index]}: ${error}` : null;
    }).filter(Boolean);
    if (validationErrors.length > 0) {
      console.warn("July sale readiness validation failed:", validationErrors.join("; "));
      return false;
    }
    return true;
  } catch (error) {
    console.error("Unable to validate public July sale availability:", error);
    return false;
  }
}, ["july-sale-public-readiness-v1"], { revalidate: 300 });

export async function isJulySaleReadyForCustomers(now = new Date()) {
  const config = julySaleCheckoutConfig("standard_annual", process.env.STRIPE_JULY_SALE_COUPON_ID, now);
  if (config.state !== "active" || !isJulySaleActive(now)) return false;
  return validateConfiguredSale();
}
