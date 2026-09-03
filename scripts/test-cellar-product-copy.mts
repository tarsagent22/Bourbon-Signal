import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { getFaqItems } from "../src/lib/faq-content.ts";
import { MEMBERSHIP_COMPARISON_ROWS, PAID_MEMBERSHIP_PLANS } from "../src/lib/membership-plan-catalog.ts";

const standard = PAID_MEMBERSHIP_PLANS.find((plan) => plan.tier === "standard");
const barrel = PAID_MEMBERSHIP_PLANS.find((plan) => plan.tier === "barrel");
assert.ok(standard?.features.includes("Unlimited My Shelf"), "Standard quietly includes unlimited basic My Shelf");
assert.ok(barrel?.features.includes("Bourbon DNA and personalized collection intelligence"), "Barrel leads with collection intelligence");
assert.ok(barrel?.features.includes("Personalized recommendations and local opportunities"), "Barrel connects taste recommendations to local hunting");

const collectionRow = MEMBERSHIP_COMPARISON_ROWS.find(([feature]) => feature === "My Shelf");
assert.deepEqual(collectionRow, ["My Shelf", "✓", "Unlimited", "Unlimited", "Unlimited"]);
const recommendationRow = MEMBERSHIP_COMPARISON_ROWS.find(([feature]) => feature === "Recommended Bottles");
assert.deepEqual(recommendationRow, ["Recommended Bottles", "—", "—", "✓", "✓"]);

const productFaq = getFaqItems("product").find((item) => item.question === "How do My Shelf and recommendations work?");
assert.match(productFaq?.answer || "", /Every membership includes My Shelf/);
assert.match(productFaq?.answer || "", /Barrel Proof and Bottled in Bond add Bourbon DNA/);
const pricingFaq = getFaqItems("pricing");
assert.match(pricingFaq.find((item) => item.question === "What can I do as a free member?")?.answer || "", /My Shelf/);
assert.match(pricingFaq.find((item) => item.question === "What is the difference between Standard Proof and Barrel Proof?")?.answer || "", /Standard Proof includes unlimited My Shelf/);
assert.match(pricingFaq.find((item) => item.question === "What is the difference between Standard Proof and Barrel Proof?")?.answer || "", /Bourbon DNA and personalized collection intelligence/);

const publicAcquisitionCopy = [
  readFileSync(new URL("../src/lib/membership-plan-catalog.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../src/lib/faq-content.ts", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/pricing/PricingPageClient.tsx", import.meta.url), "utf8"),
  readFileSync(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8"),
].join("\n");
assert.doesNotMatch(publicAcquisitionCopy, /only\s+(?:10|ten)|10[- ]bottle limit/i, "acquisition copy does not headline the Free capacity");
assert.doesNotMatch(publicAcquisitionCopy, /My Shelf (?:and personalized bottle recommendations )?begin|My Shelf begins|starts with Barrel Proof/i, "copy never claims basic My Shelf begins at Barrel");
assert.match(publicAcquisitionCopy, /Bourbon DNA and personalized collection intelligence/);
assert.match(publicAcquisitionCopy, /Unlimited My Shelf/);
assert.match(readFileSync(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8"), /Build your Bourbon DNA with personalized collection intelligence/);

console.log("Quiet My Shelf pricing, FAQ, and welcome copy contracts passed.");
