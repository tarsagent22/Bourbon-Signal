import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const feed = readFileSync(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8");
const composer = readFileSync(new URL("../src/components/signals/InlineSignalComposer.tsx", import.meta.url), "utf8");
const packageSource = readFileSync(new URL("../package.json", import.meta.url), "utf8");
assert.match(packageSource, /"test:main-feed-composer"/);
assert.match(packageSource, /"verify:ci"[^\n]+test:main-feed-composer/);

assert.match(feed, /InlineSignalComposer/);
assert.match(feed, /<InlineSignalComposer/);
assert.match(feed, /addSighting=\{addSighting\}/);
assert.match(feed, />\s*Signal Feed\s*</);
assert.doesNotMatch(feed, />\s*Live Drop Feed\s*</);
assert.match(composer, /Post a Signal/);
assert.match(composer, /addSighting\(sighting\)/);
assert.match(composer, /makeSightingId/);
assert.match(composer, /needsBottleReview/);
assert.match(composer, /needsStoreReview/);
assert.match(composer, /seen_in_store/);
assert.match(composer, /online_social/);
assert.match(composer, /Use an exact store|Select exact store/);
assert.match(composer, /buildSightingStoreSearchIndex/);
assert.match(composer, /searchSightingStoreIndex/);
assert.match(composer, /manualStateEdited/);
assert.match(composer, /useEffect\([^]*defaultState/);
assert.match(composer, /signIn/);
assert.doesNotMatch(composer, /scout/i);

console.log("Main Signal Feed composer contract passed.");
