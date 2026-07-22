import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripePriceId } from "@/lib/stripe-plans";
import { validateJulySaleCoupon } from "@/lib/july-sale";

export const runtime = "nodejs";

const TARGET_COUPON_ID = "BSJuly2026Auto";
const ELIGIBLE_PLANS = ["standard_annual", "barrel_annual", "bib_lifetime"] as const;

function authorized(req: NextRequest) {
  const expected = String(process.env.JULY_SALE_SETUP_TOKEN || "");
  const supplied = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") || "";
  if (!expected || expected.length !== supplied.length) return false;
  return timingSafeEqual(Buffer.from(expected), Buffer.from(supplied));
}

export async function POST(req: NextRequest) {
  if (!authorized(req)) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const secretKey = String(process.env.STRIPE_SECRET_KEY || "").trim();
  const sourceCouponId = String(process.env.STRIPE_JULY_SALE_COUPON_ID || "").trim();
  if (!secretKey || !sourceCouponId) {
    return NextResponse.json({ error: "Stripe sale configuration is incomplete." }, { status: 503 });
  }

  try {
    const stripe = new Stripe(secretKey);
    const sourceCoupon = await stripe.coupons.retrieve(sourceCouponId);
    if (!sourceCoupon.valid || sourceCoupon.percent_off !== 15 || sourceCoupon.duration !== "once") {
      return NextResponse.json({ error: "The source coupon does not match the approved July sale." }, { status: 409 });
    }
    if (!sourceCoupon.redeem_by || sourceCoupon.redeem_by <= Math.floor(Date.now() / 1000)) {
      return NextResponse.json({ error: "The source coupon is expired or has no redemption deadline." }, { status: 409 });
    }

    const prices = await Promise.all(ELIGIBLE_PLANS.map(async (planId) => {
      const priceId = getStripePriceId(planId);
      if (!priceId) throw new Error(`Missing production price for ${planId}.`);
      return stripe.prices.retrieve(priceId);
    }));
    const productIds = [...new Set(prices.map((price) => (
      typeof price.product === "string" ? price.product : price.product.id
    )))];
    if (productIds.length !== ELIGIBLE_PLANS.length) {
      return NextResponse.json({ error: "Eligible plans do not map to three distinct Stripe products." }, { status: 409 });
    }

    let targetCoupon: Stripe.Coupon;
    try {
      targetCoupon = await stripe.coupons.retrieve(TARGET_COUPON_ID);
    } catch (error) {
      const missing = error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing";
      if (!missing) throw error;
      targetCoupon = await stripe.coupons.create({
        id: TARGET_COUPON_ID,
        name: "July Sale — Bourbon Signal checkout",
        percent_off: 15,
        duration: "once",
        redeem_by: sourceCoupon.redeem_by,
        applies_to: { products: productIds },
        metadata: { campaign: "july_sale_2026", provisioned_by: "bourbon_signal" },
      });
    }

    const validationErrors = productIds.map((productId) => validateJulySaleCoupon(targetCoupon, productId)).filter(Boolean);
    if (validationErrors.length > 0) {
      console.warn("Corrected July sale coupon validation failed:", validationErrors.join("; "));
      return NextResponse.json({ error: "The corrected coupon did not pass checkout validation." }, { status: 409 });
    }

    return NextResponse.json({ ok: true, configuredProducts: productIds.length });
  } catch (error) {
    console.error("July sale coupon provisioning failed:", error);
    return NextResponse.json({ error: "Coupon provisioning failed." }, { status: 500 });
  }
}
