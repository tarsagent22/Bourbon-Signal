import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const feedSource = readFileSync(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8");
const dropsSource = readFileSync(new URL("../src/lib/drops.ts", import.meta.url), "utf8");
const homeSource = readFileSync(new URL("../src/app/page.tsx", import.meta.url), "utf8");

const mobileCard = feedSource.match(/className="md:hidden dropfeed-signal-card"[\s\S]*?\n\s*>/)?.[0] || "";
const desktopCard = feedSource.match(/className="hidden md:flex[^\"]*dropfeed-signal-card[^\"]*"[\s\S]*?\n\s*>/)?.[0] || "";

assert.ok(mobileCard, "the premium mobile Signal Card must remain identifiable");
assert.ok(desktopCard, "the premium desktop Signal Card must remain identifiable");
assert.doesNotMatch(mobileCard, /borderLeft|inset\s+\d+px\s+0/, "mobile cards must not create a continuous left rail");
assert.doesNotMatch(desktopCard, /borderLeft|inset\s+\d+px\s+0/, "desktop cards must not create a continuous left rail");
assert.match(mobileCard, /padding:\s*"20px 18px 18px"/, "mobile cards need deliberate horizontal breathing room");
assert.match(mobileCard, /borderRadius:\s*"18px"/, "mobile signals must read as separate cards rather than list rows");
assert.match(desktopCard, /borderRadius:\s*"16px"/, "desktop signals must read as separate cards rather than list rows");
assert.match(feedSource, /\.dropfeed-card-stack\s*\{[\s\S]*?display:\s*grid;[\s\S]*?gap:\s*12px;/, "Signal Cards need visible separation so tier accents cannot visually connect");
assert.match(feedSource, /grid-template-columns:\s*minmax\(0,\s*1fr\)/, "the card stack must not expand past narrow mobile viewports");
assert.match(feedSource, /minWidth:\s*0,[\s\S]*?width:\s*"100%",[\s\S]*?filter:\s*isBlurred/, "each Signal Card wrapper must be allowed to shrink inside the grid");
assert.match(feedSource, /radial-gradient\(circle at 12% 0%/, "tier color should be a localized corner glow, not a full-card wash");
assert.match(feedSource, /className="dropfeed-card-summary"/, "location and signal information need a dedicated summary region");
assert.match(feedSource, /minWidth:\s*0,\s*flex:\s*1,\s*overflow:\s*"hidden",\s*textOverflow:\s*"ellipsis"/, "long mobile metadata must truncate instead of colliding with timestamps");
assert.match(feedSource, /minWidth:\s*0,\s*flex:\s*1,\s*flexWrap:\s*"wrap"/, "mobile badge rows must wrap safely on narrow phones");
assert.match(feedSource, /className="dropfeed-card-footer/, "actions and Details need a distinct footer region");
assert.match(feedSource, /Details\s*<ChevronDown/, "the Details control should have a visible directional affordance");
assert.match(homeSource, /hidden md:flex items-center justify-center rounded-full/, "the floating page control must stay off mobile Signal Cards");
assert.doesNotMatch(feedSource, /regular:\s*\{/, "the Drop Feed presentation must not define a Regular tier treatment");
assert.doesNotMatch(dropsSource, /regular:\s*\{[\s\S]*?label:\s*"REGULAR"/, "shared Signal Card config must not expose a Regular badge");

console.log("Premium Drop Feed card design contract passed.");
