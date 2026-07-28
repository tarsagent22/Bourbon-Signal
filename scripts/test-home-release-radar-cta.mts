import assert from "node:assert/strict";
import fs from "node:fs";

const read = (path: string) => fs.readFileSync(path, "utf8");
const page = read("src/app/page.tsx");
const footer = read("src/components/Footer.tsx");
const layout = read("src/app/layout.tsx");
const pricing = read("src/app/pricing/PricingPageClient.tsx");
const faq = read("src/lib/faq-content.ts");
const radarCta = read("src/components/sections/ReleaseRadarSection.tsx");
const radarCtaStyles = read("src/components/sections/ReleaseRadarSection.module.css");

assert.match(pricing, /useState<BillingCycle>\(\(\) => julySaleActive \? "annual" : "monthly"\)/, "pricing should feature eligible annual plans only while the July sale is active");

assert.match(page, /import ReleaseRadarSection from "@\/components\/sections\/ReleaseRadarSection"/);
assert.match(page, /<ReleaseRadarSection\s*\/>/);
assert.doesNotMatch(page, /BriefingSection|DailyBriefing/);

assert.match(radarCta, /href="\/release-radar"/);
assert.match(radarCta, /Explore Release Radar/);
assert.match(radarCta, /release dates/i);
assert.match(radarCta, /lottery windows/i);
assert.match(radarCta, /distillery events/i);
assert.match(radarCta, /state guides/i);
assert.match(radarCtaStyles, /\.release-radar-promo-button/);
assert.match(radarCtaStyles, /background: var\(--promo-brass-bright\)/);
assert.match(radarCtaStyles, /prefers-reduced-motion/);
assert.match(radarCtaStyles, /:focus-visible/);
assert.doesNotMatch(radarCta, /release-radar-promo-visual|release-radar-promo-instrument|release-radar-promo-sweep/);
assert.doesNotMatch(radarCtaStyles, /promoRadarSweep|promoRadarBlip|release-radar-promo-visual|release-radar-promo-instrument/);
assert.doesNotMatch(radarCta, /Daily Briefing|Yellowstone|Kentucky Bourbon Trail|1792 adds/);

assert.equal((footer.match(/label: "Release Radar"/g) || []).length, 1);
assert.doesNotMatch(footer, /Daily Briefing/);
assert.doesNotMatch(layout, /Daily Briefing/);
assert.match(layout, /Release Radar/);
assert.doesNotMatch(pricing, /Daily Briefing/);
assert.match(pricing, /<li>Release Radar and Member Sightings<\/li>/, "public Release Radar must remain in the free benefits strip");
assert.match(pricing, /comparison-table|comparisonRows/, "public Release Radar belongs in the restored membership comparison");
assert.doesNotMatch(pricing, /compact-differences/, "the summary substitute must not replace the comparison table");
assert.doesNotMatch(faq, /Daily Briefing/);
assert.match(faq, /What is Release Radar\?/);

assert.equal(fs.existsSync("src/components/sections/BriefingSection.tsx"), false);
assert.equal(fs.existsSync("src/components/sections/DailyBriefing.tsx"), false);

console.log("Homepage Release Radar CTA contract passed.");
