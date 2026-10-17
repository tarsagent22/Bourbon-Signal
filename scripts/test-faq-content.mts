import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { getFaqItems } from "../src/lib/faq-content.ts";
import { STATE_LIFECYCLE_CONFIG } from "../src/config/stateLifecycle.ts";
import { TIER_ENTITLEMENTS } from "../src/lib/entitlements.ts";

const faqComponent = await readFile(new URL("../src/components/sections/FAQ.tsx", import.meta.url), "utf8");
const homePage = await readFile(new URL("../src/app/page.tsx", import.meta.url), "utf8");
const pricingPage = await readFile(new URL("../src/app/pricing/PricingPageClient.tsx", import.meta.url), "utf8");

const productFaqs = getFaqItems("product");
assert.equal(productFaqs.length, 10);
assert.deepEqual(productFaqs.map((item) => item.question), [
  "What is Bourbon Signal?",
  "Where is Bourbon Signal coverage available?",
  "What do the different feed signals mean—and is availability guaranteed?",
  "How do Bourbon Signal alerts work?",
  "What are verified retailer signals?",
  "What are Member Sightings?",
  "How do I add bottles to My Shelf?",
  "How do My Shelf and recommendations work?",
  "What is Hunt Outcome?",
  "Why doesn’t every state have the same store-level detail?",
]);

const coverage = productFaqs.find((item) => item.question.startsWith("Where is"));
assert.match(coverage?.answer || "", new RegExp(`${STATE_LIFECYCLE_CONFIG.activeStates.length} states`));
assert.match(coverage?.answer || "", /Maryland \(Montgomery County\)/);
assert.match(coverage?.answer || "", /location precision and signal type/);

const signals = productFaqs.find((item) => item.question.startsWith("What do the different"));
assert.match(signals?.answer || "", /Verified retailer/);
assert.match(signals?.answer || "", /Member Sightings/);
assert.match(signals?.answer || "", /Always check/);

const retailerSignals = productFaqs.find((item) => item.question === "What are verified retailer signals?");
assert.match(retailerSignals?.answer || "", /scheduled drops, barrel picks, tastings, and lotteries/);
assert.match(retailerSignals?.answer || "", /24 hours/);

const pricingFaqs = getFaqItems("pricing");
assert.equal(pricingFaqs.length, 5);
assert.match(pricingFaqs.find(item => item.question.includes("Barrel Proof include"))?.answer || "", /\$6\/month/);
assert.match(pricingFaqs.find(item => item.question.includes("Standard Proof"))?.answer || "", /\$3\/month Stripe/);
assert.match(pricingFaqs.find(item => item.question.includes("Founder"))?.answer || "", /full lifetime access/);
assert.match(pricingFaqs.find(item => item.question.includes("cancel"))?.answer || "", /period already paid for/);
assert.doesNotMatch(JSON.stringify(pricingFaqs), /five alert areas|15 tracked bottles|spots remain/);
assert.match(faqComponent, /aria-controls=\{panelId\}/);
assert.match(faqComponent, /id=\{panelId\}/);
assert.match(faqComponent, /aria-labelledby=\{triggerId\}/);

assert.match(homePage, /<FAQ variant="product"/);
assert.match(pricingPage, /<FAQ variant="pricing"/);

console.log("FAQ content contracts passed.");
