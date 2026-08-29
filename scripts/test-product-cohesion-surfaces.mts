import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

assert.equal(existsSync(new URL("../src/app/signals/[id]/page.tsx", import.meta.url)), true, "web has a canonical Signal detail route");
const webDetail = read("src/app/signals/[id]/SignalDetailClient.tsx");
const webOutcome = read("src/components/signals/HuntOutcomePrompt.tsx");
const feed = read("src/components/sections/DropFeed.tsx");
for (const label of ["Found it", "Gone when I checked", "Didn.t go"]) assert.match(webOutcome, new RegExp(label));
assert.match(webOutcome, /getHuntOutcome/);
assert.match(webOutcome, /setHuntOutcome/);
assert.match(webOutcome, /Edit/);
assert.doesNotMatch(webOutcome, /<Modal|role=["']dialog|position:\s*["']fixed/, "web outcome is an inline detail row, never a modal");
assert.match(webDetail, /<HuntOutcomePrompt/);
assert.match(feed, /\/signals\//, "feed details link to the standalone Signal detail");
assert.doesNotMatch(feed, /Found it|Gone when I checked|Didn.t go/, "crowding order keeps Hunt Outcome off feed cards");

const mobileTypes = read("apps/mobile/src/api/types.ts");
const mobileClient = read("apps/mobile/src/api/client.ts");
const mobileSignal = read("apps/mobile/app/(app)/signal/[id].tsx");
const mobileOutcomePolicy = read("apps/mobile/src/signals/hunt-outcome-prompt.ts");
assert.match(mobileTypes, /HuntOutcome/);
assert.match(mobileClient, /getHuntOutcome/);
assert.match(mobileClient, /setHuntOutcome/);
assert.match(mobileClient, /\/outcome/);
for (const label of ["Found it", "Gone when I checked", "Didn.t go", "Edit"]) assert.match(mobileSignal, new RegExp(label));
assert.match(mobileSignal, /shouldOfferHuntOutcomePrompt/);
assert.match(mobileOutcomePolicy, /HUNT_OUTCOME_PROMPT_REPEAT_MS/);
assert.doesNotMatch(mobileSignal, /<Modal/, "native outcome stays inline in Signal detail");

const dashboard = read("src/app/dashboard/page.tsx");
const nativeCellar = read("apps/mobile/app/(app)/(tabs)/cellar.tsx");
const mobileSuggestionPolicy = read("apps/mobile/src/cellar/cellar-hunt-suggestions.ts");
for (const surface of [dashboard, nativeCellar]) {
  assert.match(surface, /Hunt next/);
  assert.match(surface, /Watch for another/);
  assert.match(surface, /buildCellarHuntSuggestions/);
}
assert.match(dashboard, /slice\(0,\s*3\)/);
assert.match(nativeCellar, /slice\(0,\s*3\)/);
assert.match(mobileSuggestionPolicy, /Math\.min\(3/);
assert.match(dashboard, /Your Bourbon DNA/);
assert.match(nativeCellar, /Your Bourbon DNA/);
assert.match(nativeCellar, /canUseRecommendations/);
assert.match(nativeCellar, /accessibilityState=\{\{ expanded:/, "native DNA details start as one disclosure");
assert.doesNotMatch(dashboard, /Recommended bottles demo|Free accounts can view this demo/i);
assert.doesNotMatch(nativeCellar, /Recommended bottles demo|Free accounts can view this demo/i);

const controlRoom = read("src/app/admin/control-room/page.tsx");
assert.match(controlRoom, /getHuntOutcomeRepository/);
assert.match(controlRoom, /aggregatePrivate/);
assert.match(controlRoom, /Hunt outcomes/);
assert.match(controlRoom, /Found-it rate/);
assert.match(controlRoom, /bySourceType/);
assert.match(controlRoom, /byState/);
assert.doesNotMatch(controlRoom, /outcome\.user|outcome\.store/i, "owner surface remains aggregate-only");

console.log("Web, native, and owner product-cohesion surface contracts passed.");
