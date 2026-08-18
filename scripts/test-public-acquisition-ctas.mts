import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const hero = read("src/components/sections/HeroSection.tsx");
const navigation = read("src/components/Navigation.tsx");
const dropFeed = read("src/components/sections/LiveDropFeed.tsx");
const finalCta = read("src/components/sections/FinalCTA.tsx");

assert.match(hero, /href="\/pricing\?source=homepage-hero-try-free"[\s\S]*Try free/);
assert.doesNotMatch(hero, /signUp\(|Create Account/i);

assert.match(navigation, /href="\/pricing\?source=site-nav-desktop-try-free"[\s\S]*Try free/);
assert.match(navigation, /href="\/pricing\?source=site-nav-mobile-try-free"[\s\S]*Try free/);
assert.doesNotMatch(navigation, /signUp\(|Create Account/i);

assert.match(dropFeed, /href="\/pricing\?source=homepage-drop-feed-try-free"[\s\S]*Try free →/);
assert.doesNotMatch(dropFeed, /signUp\(|Create account/i);

assert.match(finalCta, /href="\/pricing\?source=homepage-final-try-free"[\s\S]*Try free/);
assert.match(finalCta, /Plans start at \$3\/month after the trial\./);
assert.doesNotMatch(finalCta, /Pricing is intentionally hidden|Create Account/i);

console.log("Public acquisition CTA contract passed.");
