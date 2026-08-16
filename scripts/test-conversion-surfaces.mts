import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const [bottleCheck, welcome, welcomeStyles] = await Promise.all([
  readFile(new URL("../src/app/bottle-check/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/welcome/page.tsx", import.meta.url), "utf8"),
  readFile(new URL("../src/app/welcome/welcome.module.css", import.meta.url), "utf8"),
]);
assert.match(bottleCheck, /See rarity, market and shipment signals, proof, age, producer, and release context in one clear read\./);
assert.match(welcome, /Rarity, proof, producer, and release details\./);
assert.match(bottleCheck, /One search\. The bottle intelligence that matters\./);

const memberSightings = welcome.indexOf("<strong>Member Sightings</strong>");
const dashboard = welcome.indexOf("<strong>Dashboard</strong>");
const bottle = welcome.indexOf("<strong>Bottle Check</strong>");
const dropFeed = welcome.indexOf("<strong>Drop Feed</strong>");
const coverage = welcome.indexOf("<strong>Coverage Map</strong>");
assert.ok(memberSightings > -1 && memberSightings < dashboard && dashboard < bottle && bottle < dropFeed && dropFeed < coverage, "Welcome destinations use the approved order");
assert.match(welcome, /Try Barrel Proof free for 7 days/);
assert.doesNotMatch(welcome, /Unlock the full signal/);
assert.match(welcome, /<span className=\{styles\.landmark\} aria-hidden="true">04<\/span>/);
const trialCardRule = welcomeStyles.match(/\.trialCard\s*\{([^}]*)\}/)?.[1] || "";
assert.doesNotMatch(trialCardRule, /border:/, "the welcome trial card must not have an outer border");
assert.ok(welcome.indexOf("Try Barrel Proof free for 7 days") < welcome.indexOf("Choose where to go next"), "trial offer appears before explore links");
console.log("Conversion surface contracts passed.");
