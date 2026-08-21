import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dedupeSightingBottles, mergeSightingBottleSuggestions, searchSightingBottles } from "../src/lib/sighting-bottle-search.ts";

const feed = readFileSync(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/components/signals/InlineSignalComposer.tsx", import.meta.url), "utf8");
const hero = readFileSync(new URL("../src/components/sections/HeroSection.tsx", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
assert.match(packageSource, /"test:main-feed-composer"/);
assert.match(packageSource, /"verify:ci"[^\n]+test:main-feed-composer/);

assert.match(feed, /InlineSignalComposer/);
assert.match(feed, /<InlineSignalComposer/);
assert.match(feed, /addSighting=\{addSighting\}/);
assert.match(feed, />\s*Signals\s*</);
assert.doesNotMatch(feed, />\s*Signal Feed\s*</);
assert.match(feed, /Live bourbon activity from members, retailers, and trusted sources\./);
assert.match(feed, /All signals/);
assert.doesNotMatch(feed, /All drops/);
assert.doesNotMatch(feed, /dropfeed-mobile-filter-toggle/);
assert.doesNotMatch(feed, /dropfeed-active-filter-chips/);
assert.match(feed, /const stateDropdownValue = urlStateFilter \|\|/);
assert.doesNotMatch(feed, /mobileFiltersOpen/);
assert.match(feed, /SignalTicker/);
assert.doesNotMatch(feed, /SignalSummary/);
assert.match(feed, /signal-ticker-track/);
assert.doesNotMatch(feed, /setTickerPaused/);
assert.doesNotMatch(feed, /aria-pressed=\{tickerPaused\}/);
assert.doesNotMatch(feed, /signal-ticker-toggle/);
assert.doesNotMatch(feed, /border-block:/);
assert.doesNotMatch(feed, /<SignalTicker[^]*borderBottom[^]*<InlineSignalComposer/);
assert.match(feed, /\.signal-ticker-track\.reduced[^}]*flex-wrap:\s*wrap/s);
assert.match(feed, /value < 0/);
assert.match(feed, /Observations processed/);
assert.match(feed, /Current observations/);
assert.doesNotMatch(feed, /Total signals detected/);
assert.doesNotMatch(feed, /Live signals/);
assert.match(feed, /Stores monitored/);
assert.match(feed, /Member Count/);
assert.match(feed, /Last refreshed/);
assert.match(feed, /currentObservations=\{data\?\.total\}/);
assert.match(feed, /Showing \$\{displayedGrouped\.length\} \$\{hasActiveFeedFilters \? "filtered " : ""\}signal cards/);
assert.match(feed, /tabIndex=\{0\}/);
assert.match(feed, /\.signal-ticker:focus \.signal-ticker-track/);
assert.match(feed, /canUseStateFilter \|\| canUseBottleSearch \|\| canUseDropFeedFilters/);
assert.doesNotMatch(feed, /matching signals\$\{data\.lastUpdated/);
assert.match(composer, /Post a Signal/);
assert.match(composer, /addSighting\(sighting\)/);
assert.match(composer, /makeSightingId/);
assert.match(composer, /needsBottleReview/);
assert.match(composer, /needsStoreReview/);
assert.match(composer, /seen_in_store/);
assert.match(composer, /online_social/);
assert.match(composer, /buildSightingStoreSearchIndex/);
assert.match(composer, /searchSightingStoreIndex/);
assert.match(composer, /useBottles/);
assert.match(composer, /searchSightingBottles/);
assert.match(composer, /const authoritative = catalogBottles\.slice\(0, 4\)/);
assert.match(composer, /\/api\/bottle-check\?q=/);
assert.match(composer, /aria-label="Bottle matches"/);
assert.match(composer, /needsBottleReview: !selectedBottle/);
assert.match(composer, /inline-signal-search-panel/);
assert.match(composer, /scrollIntoView/);
assert.match(composer, /matchMedia\("\(max-width: 767px\)"\)/);
assert.match(composer, /setCatalogBottles\(\[\]\);\s*setCatalogLoading\(true\)/);
assert.match(composer, /document\.activeElement !== element/);
assert.match(composer, /window\.clearTimeout/);
assert.match(composer, /onBlur=\{dismissSearchOnBlur\}/);
const storeMatchesPosition = composer.indexOf('aria-label="Exact store matches"');
const requiredPosition = composer.indexOf("Required to post");
assert.ok(storeMatchesPosition >= 0);
assert.ok(requiredPosition >= 0);
assert.ok(storeMatchesPosition < requiredPosition);
assert.match(composer, /!selectedBottle && open && activeSearch === "bottle"/);
assert.match(composer, /!selectedStore && open && activeSearch === "store"/);
assert.match(composer, /manualStateEdited/);
assert.match(composer, /useEffect\([^]*defaultState/);
assert.match(composer, /BottleSignalIcon/);
assert.match(composer, /What bottle did you find\?/);
assert.match(composer, /Search store, city, ZIP, or street/);
assert.match(composer, /inline-signal-starter/);
assert.match(composer, /Required to post/);
assert.match(composer, /Optional details/);
assert.doesNotMatch(composer, /\bPlus\b/);
assert.doesNotMatch(composer, /ArrowRight/);
assert.doesNotMatch(composer, /<span>Open<\/span>/);
assert.match(composer, /aria-label="Close composer"/);
assert.match(composer, /onFocus=\{\(event\) => focusSearch/);
assert.doesNotMatch(composer, /onFocus=\{beginPost\}/);
assert.match(composer, /@media\(max-width:767px\)[^]*font-size:16px/s);
assert.match(composer, /catalogRequestId\.current/);
assert.match(composer, /ArrowDown/);
assert.match(composer, /ArrowUp/);
assert.match(composer, /event\.key === "Enter"/);
assert.match(composer, /aria-activedescendant/);
assert.match(composer, /flex-wrap:wrap/);
assert.doesNotMatch(composer, /ChevronDown/);
assert.match(composer, /signIn/);
assert.doesNotMatch(composer, /scout/i);
assert.match(hero, /home-hero/);
assert.match(hero, /@media\(max-width:767px\)/);
assert.match(hero, /isSignedIn \? "signed-in"/);
assert.match(hero, /home-hero\.signed-in\{height:60svh/);
assert.match(feed, /#drops \{ padding-top: 32px/);
assert.match(feed, /\.signal-ticker \{ margin-top: 18px/);
assert.match(feed, /\.dropfeed-refine-field input[^}]*font-size: 16px/s);
assert.match(hero, /home-hero-features/);
assert.match(hero, /home-hero-features\{display:none/);
assert.match(hero, /white-space:normal/);

const bottleMatches = searchSightingBottles([
  { id: "eh-taylor-small-batch", name: "E.H. Taylor Small Batch", aliases: ["EH Taylor"] },
  { id: "eh-taylor-single-barrel", name: "E.H. Taylor Single Barrel" },
  { id: "weller-special-reserve", name: "Weller Special Reserve" },
], "Eh taylor sm", { limit: 4 });
assert.deepEqual(bottleMatches.map((bottle) => bottle.id), ["eh-taylor-small-batch"]);
assert.deepEqual(searchSightingBottles([{ id: "blantons", name: "Blanton's Single Barrel" }], "blan").map((bottle) => bottle.id), ["blantons"]);
assert.deepEqual(searchSightingBottles([{ id: "blantons", name: "Blanton's Single Barrel" }], "blantons").map((bottle) => bottle.id), ["blantons"]);
assert.deepEqual(searchSightingBottles([
  { id: "blantons", name: "Blanton's Single Barrel", distillery: "Buffalo Trace" },
  { id: "buffalo-trace", name: "Buffalo Trace Bourbon", distillery: "Buffalo Trace" },
], "Buffalo Trace").map((bottle) => bottle.id), ["buffalo-trace", "blantons"]);
assert.deepEqual(dedupeSightingBottles([
  { id: "four-roses-limited-edition-small-batch", name: "Four Roses Limited Edition Small Batch" },
  { id: "bb_3bccb93448bf8456", name: "Four Roses Limited Edition Small Batch" },
  { id: "weller-full-proof", name: "W.L. Weller Full Proof", aliases: ["Weller Full Proof"] },
  { id: "bb_a3c16eb6f814785b", name: "Weller Full Proof" },
]).map((bottle) => bottle.id), ["four-roses-limited-edition-small-batch", "weller-full-proof"]);
assert.deepEqual(dedupeSightingBottles([
  { id: "eh-taylor-small-batch", name: "E.H. Taylor Small Batch", aliases: ["EHT"] },
  { id: "eh-taylor-single-barrel", name: "E.H. Taylor Single Barrel", aliases: ["EHT"] },
]).map((bottle) => bottle.id), ["eh-taylor-small-batch", "eh-taylor-single-barrel"]);
assert.deepEqual(mergeSightingBottleSuggestions(
  [{ id: "michters-10", name: "Michter's 10 Year Bourbon" }],
  [
    { id: "michter", name: "Michter" },
    { id: "ten-thousand-drops", name: "10,000 Drops Single Barrel Bourbon" },
    { id: "basil-hayden-10", name: "Basil Hayden 10 Year" },
    { id: "eagle-rare-10", name: "Eagle Rare 10 Year" },
  ],
  4,
).map((bottle) => bottle.id), ["michters-10", "michter", "ten-thousand-drops", "basil-hayden-10"]);

console.log("Main Signal Feed composer contract passed.");
