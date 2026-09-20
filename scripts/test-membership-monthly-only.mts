import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const read = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");

const publicCatalog = read("src/lib/membership-plan-catalog.ts");
const pricingPage = read("src/app/pricing/PricingPageClient.tsx");
const checkoutContinue = read("src/app/checkout/continue/page.tsx");
const pricingCards = read("src/components/sections/PricingCards.tsx");
const pricingSection = read("src/components/sections/PricingSection.tsx");

test("public web pricing exposes monthly subscriptions and Founder lifetime only", () => {
  assert.ok(publicCatalog.includes('monthlyPrice: "$3"'));
  assert.ok(publicCatalog.includes('monthlyPrice: "$6"'));
  assert.doesNotMatch(publicCatalog, /annualPrice|annualPlan|standard_annual|barrel_annual/);
  assert.doesNotMatch(`${pricingPage}\n${pricingCards}\n${pricingSection}`, /Annual|annual|\/year|2 months free/);
  assert.doesNotMatch(`${pricingPage}\n${pricingCards}\n${pricingSection}`, /handleCheckout\("annual"\)/);
});

test("website checkout rejects legacy annual route values instead of opening a new annual checkout", () => {
  assert.doesNotMatch(checkoutContinue, /standard_annual|barrel_annual|value === "annual"/);
  assert.match(checkoutContinue, /value === "monthly"/);
});
