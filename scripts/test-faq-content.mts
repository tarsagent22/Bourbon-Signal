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
  "What are Member Sightings and Member Points?",
  "How does Bottle Check work?",
  "What is Release Radar?",
  "How do My Collection and recommendations work?",
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

const pricingFaqs = getFaqItems("pricing", { founderSpotsRemaining: 72 });
assert.equal(pricingFaqs.length, 6);
assert.deepEqual(pricingFaqs.map((item) => item.question), [
  "What can I do as a free member?",
  "What is the difference between Standard Proof and Barrel Proof?",
  "How do alerts and alert limits work?",
  "What is the Bottled in Bond Founder membership?",
  "Can I cancel or change my membership?",
  "Which features are available in each plan?",
]);

const free = pricingFaqs[0];
assert.match(free.answer, /submit sightings/);
assert.doesNotMatch(free.answer, /requires a paid membership/);

const alertLimits = pricingFaqs.find((item) => item.question === "How do alerts and alert limits work?");
assert.match(alertLimits?.answer || "", new RegExp(`up to ${TIER_ENTITLEMENTS.standard.smsDailyLimit} SMS alerts per day`));
assert.match(alertLimits?.answer || "", new RegExp(`up to ${TIER_ENTITLEMENTS.barrel.smsDailyLimit} SMS alerts per day`));
assert.match(alertLimits?.answer || "", new RegExp(`up to ${TIER_ENTITLEMENTS["bottled-in-bond"].smsDailyLimit} SMS alerts per day`));
assert.doesNotMatch(alertLimits?.answer || "", /25 SMS alerts per day/);

const releaseRadar = productFaqs.find((item) => item.question === "What is Release Radar?");
assert.match(releaseRadar?.answer || "", /exact confirmed dates/i);
assert.match(releaseRadar?.answer || "", /public and separate from live shelf-inventory signals/i);
assert.doesNotMatch(releaseRadar?.answer || "", /Daily Briefing|additional homepage stories/);

const founder = pricingFaqs.find((item) => item.question.includes("Founder membership"));
assert.match(founder?.answer || "", /one-time \$50 purchase/);
assert.match(founder?.answer || "", /72 of 100 Founder spots remain/);

const founderWithoutCount = getFaqItems("pricing", { founderSpotsRemaining: null })
  .find((item) => item.question.includes("Founder membership"));
assert.match(founderWithoutCount?.answer || "", /limited to 100 people/);
assert.doesNotMatch(founderWithoutCount?.answer || "", /shows the current number/);
assert.doesNotMatch(founderWithoutCount?.answer || "", /null/);

assert.match(faqComponent, /aria-controls=\{panelId\}/);
assert.match(faqComponent, /id=\{panelId\}/);
assert.match(faqComponent, /aria-labelledby=\{triggerId\}/);

assert.match(homePage, /<FAQ variant="product"/);
assert.match(pricingPage, /<FAQ variant="pricing" founderSpotsRemaining=\{founderSpots\?\.remaining \?\? null\}/);

console.log("FAQ content contracts passed.");
