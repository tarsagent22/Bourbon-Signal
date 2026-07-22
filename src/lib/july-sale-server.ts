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
  if (!secretKey || !couponId) return false;

  try {
    const stripe = new Stripe(secretKey);
    const coupon = await stripe.coupons.retrieve(couponId);
    const prices = await Promise.all(ELIGIBLE_PLANS.map(async (planId) => {
      const priceId = getStripePriceId(planId);
      if (!priceId) return null;
      return stripe.prices.retrieve(priceId);
    }));
    if (prices.some((price) => !price)) return false;
    return prices.every((price) => {
      if (!price) return false;
      const productId = typeof price.product === "string" ? price.product : price.product.id;
      return validateJulySaleCoupon(coupon, productId) === null;
    });
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
