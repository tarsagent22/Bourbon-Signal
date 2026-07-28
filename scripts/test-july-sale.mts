import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  JULY_SALE_CHECKOUT_CUTOFF_AT,
  JULY_SALE_END_AT,
  JULY_SALE_PERCENT_OFF,
  buildJulySaleSessionFields,
  discountedCents,
  julySaleCheckoutConfig,
  isJulySaleActive,
  isJulySaleEligiblePlan,
  resolveJulySaleCouponId,
  sessionHasCouponId,
  validateJulySaleCoupon,
} from "../src/lib/july-sale.ts";

assert.equal(JULY_SALE_PERCENT_OFF, 15);
assert.equal(JULY_SALE_END_AT, "2026-08-01T04:00:00.000Z");
assert.equal(JULY_SALE_CHECKOUT_CUTOFF_AT, "2026-08-01T03:00:00.000Z");

for (const plan of ["standard_annual", "barrel_annual", "bib_lifetime"] as const) {
  assert.equal(isJulySaleEligiblePlan(plan), true, `${plan} should receive the July sale`);
}
for (const plan of ["standard_monthly", "barrel_monthly"] as const) {
  assert.equal(isJulySaleEligiblePlan(plan), false, `${plan} must remain full price`);
}

assert.equal(isJulySaleActive(new Date("2026-07-31T22:59:59-04:00")), true);
assert.equal(isJulySaleActive(new Date("2026-07-31T23:00:00-04:00")), false);
assert.equal(resolveJulySaleCouponId(" AdDCc6jD ", new Date("2026-07-21T12:00:00-04:00")), "AdDCc6jD");
assert.equal(resolveJulySaleCouponId("", new Date("2026-07-21T12:00:00-04:00")), null);
assert.equal(resolveJulySaleCouponId("AdDCc6jD", new Date("2026-07-31T23:30:00-04:00")), null);
assert.equal(discountedCents(2499), 2124);
assert.equal(discountedCents(4999), 4249);

const saleNow = new Date("2026-07-21T12:00:00-04:00");
assert.deepEqual(julySaleCheckoutConfig("standard_annual", " AdDCc6jD ", saleNow), {
  state: "active",
  configuredCouponId: "AdDCc6jD",
  couponId: "AdDCc6jD",
  allowPromotionCodes: false,
  expiresAt: null,
});
assert.deepEqual(julySaleCheckoutConfig("standard_annual", "", saleNow), {
  state: "misconfigured",
  configuredCouponId: null,
  couponId: null,
  allowPromotionCodes: false,
  expiresAt: null,
});
assert.deepEqual(julySaleCheckoutConfig("barrel_monthly", "AdDCc6jD", saleNow), {
  state: "inactive",
  configuredCouponId: "AdDCc6jD",
  couponId: null,
  allowPromotionCodes: true,
  expiresAt: null,
});
assert.deepEqual(julySaleCheckoutConfig("bib_lifetime", "AdDCc6jD", new Date("2026-07-31T23:30:00-04:00")), {
  state: "inactive",
  configuredCouponId: "AdDCc6jD",
  couponId: null,
  allowPromotionCodes: true,
  expiresAt: null,
});
assert.deepEqual(buildJulySaleSessionFields(julySaleCheckoutConfig("standard_annual", "AdDCc6jD", saleNow)), {
  discounts: [{ coupon: "AdDCc6jD" }],
});
assert.equal(
  Object.hasOwn(buildJulySaleSessionFields(julySaleCheckoutConfig("standard_annual", "AdDCc6jD", saleNow)), "allow_promotion_codes"),
  false,
  "Stripe rejects Checkout Sessions that include both discounts and allow_promotion_codes, even when allow_promotion_codes is false",
);
const finalDayConfig = julySaleCheckoutConfig("standard_annual", "AdDCc6jD", new Date("2026-07-31T12:00:00-04:00"));
assert.equal(finalDayConfig.expiresAt, 1785556800);
assert.deepEqual(buildJulySaleSessionFields(finalDayConfig), {
  discounts: [{ coupon: "AdDCc6jD" }],
  expires_at: 1785556800,
});
assert.deepEqual(buildJulySaleSessionFields(julySaleCheckoutConfig("barrel_monthly", "AdDCc6jD", saleNow)), {
  allow_promotion_codes: true,
});
assert.equal(sessionHasCouponId([{ coupon: "AdDCc6jD", promotion_code: null }], "AdDCc6jD"), true);
assert.equal(sessionHasCouponId([{ coupon: { id: "AdDCc6jD" }, promotion_code: null }], "AdDCc6jD"), true);
assert.equal(sessionHasCouponId([{ coupon: "other", promotion_code: null }], "AdDCc6jD"), false);

const validCoupon = {
  id: "AdDCc6jD",
  valid: true,
  percent_off: 15,
  duration: "once",
  redeem_by: 1785556799,
  applies_to: { products: ["prod_standard"] },
};
assert.equal(validateJulySaleCoupon(validCoupon, "prod_standard", saleNow), null);
assert.equal(validateJulySaleCoupon({
  ...validCoupon,
  applies_to: { products: [] },
  metadata: { campaign: "july_sale_2026", provisioned_by: "bourbon_signal" },
}, "prod_standard", saleNow), null);
assert.match(validateJulySaleCoupon({ ...validCoupon, applies_to: { products: [] } }, "prod_standard", saleNow) || "", /product/);
assert.match(validateJulySaleCoupon({ ...validCoupon, percent_off: 10 }, "prod_standard", saleNow) || "", /15%/);
assert.match(validateJulySaleCoupon({ ...validCoupon, duration: "forever" }, "prod_standard", saleNow) || "", /once/);
assert.match(validateJulySaleCoupon(validCoupon, "prod_other", saleNow) || "", /product/);
assert.match(validateJulySaleCoupon({ ...validCoupon, valid: false }, "prod_standard", saleNow) || "", /valid/);

const checkoutRoute = readFileSync("src/app/api/checkout/route.ts", "utf8");
assert.match(checkoutRoute, /buildJulySaleSessionFields\(julySaleConfig\)/, "checkout should attach the validated coupon fields");
assert.match(checkoutRoute, /validateConfiguredJulySale/, "checkout should verify the live Stripe coupon and product");
assert.match(checkoutRoute, /state === "misconfigured"/, "missing sale configuration must fail closed");
assert.match(checkoutRoute, /sessionHasCouponId/, "reusable sessions must be checked for the sale coupon");
assert.match(checkoutRoute, /expire\(reusableSession\.id\)/, "stale full-price or sale sessions should be expired");
assert.match(checkoutRoute, /expectedPromotion === "july_sale_2026" && julySaleConfig\.state !== "active"/, "a stale sale page must never fall through to full-price checkout");

const pricingServerPage = readFileSync("src/app/pricing/page.tsx", "utf8");
assert.match(pricingServerPage, /isJulySaleReadyForCustomers/, "pricing promotion must use a server-authoritative Stripe readiness check");
const pricingPage = readFileSync("src/app/pricing/PricingPageClient.tsx", "utf8");
assert.match(pricingPage, /const expectedPromotion = julySaleActive/, "eligible pricing checkout should declare that the customer expects the sale");
assert.match(pricingPage, /checkoutContinueUrl\(plan, source, expectedPromotion\)/, "sale intent must survive sign-up redirect");
const continuePage = readFileSync("src/app/checkout/continue/page.tsx", "utf8");
assert.match(continuePage, /JSON\.stringify\(\{ plan, source, expectedPromotion \}\)/, "continued checkout must send sale intent to the API");
for (const phrase of [
  "July sale — 15% off",
  "15% off annual memberships and Founder lifetime through July 31 at 11 PM ET; applied automatically.",
  "first annual payment",
  "renew at the regular price",
  "Founder remains a one-time payment",
  "$21.24",
  "$42.49",
]) {
  assert.ok(pricingPage.includes(phrase), `pricing page missing sale language: ${phrase}`);
}

console.log("July sale checkout and customer-copy contract passed.");
