import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { historicalDropFeedEnabled, selectDropFeedHistory } from "../src/lib/drop-feed-history.ts";
import { controlRoomNavVisibleForUser } from "../src/lib/control-room-nav-access.ts";

assert.equal(historicalDropFeedEnabled({ requested: true, isSignedIn: true, canUseAdvancedFilters: true, tierCount: 1 }), true, "a paid filtered feed may page through historical rows");
assert.equal(historicalDropFeedEnabled({ requested: false, isSignedIn: true, canUseAdvancedFilters: true, tierCount: 1 }), false, "the ordinary feed must remain freshness-gated");
assert.equal(historicalDropFeedEnabled({ requested: true, isSignedIn: false, canUseAdvancedFilters: true, tierCount: 1 }), false, "signed-out previews must not expose history");
assert.equal(historicalDropFeedEnabled({ requested: true, isSignedIn: true, canUseAdvancedFilters: false, tierCount: 1 }), false, "Free members must retain their bounded preview contract");
assert.equal(historicalDropFeedEnabled({ requested: true, isSignedIn: true, canUseAdvancedFilters: true, tierCount: 0 }), false, "history should activate only for an explicit rarity filter");

const datedRows = [{ id: "fresh", fresh: true }, { id: "old", fresh: false }, { id: "invalid", fresh: false }];
assert.deepEqual(selectDropFeedHistory(datedRows, false, (row) => row.fresh), [{ id: "fresh", fresh: true }], "ordinary feeds keep the freshness gate");
assert.deepEqual(selectDropFeedHistory(datedRows, true, (row) => row.fresh, (row) => row.id !== "invalid"), [
  { id: "fresh", fresh: true, historical: false },
  { id: "old", fresh: false, historical: true },
], "historical filtered feeds retain old rows and label them explicitly");

const owner = {
  primaryEmailAddressId: "primary",
  emailAddresses: [
    { id: "secondary", emailAddress: "other@example.com" },
    { id: "primary", emailAddress: " CHANDLERTODD22@GMAIL.COM " },
  ],
};
assert.equal(controlRoomNavVisibleForUser(owner), true, "the exact owner primary email should see the private navigation link");
assert.equal(controlRoomNavVisibleForUser({ ...owner, primaryEmailAddressId: "secondary" }), false, "a secondary owner email must not override a different primary account email");
assert.equal(controlRoomNavVisibleForUser({ primaryEmailAddressId: "primary", emailAddresses: [{ id: "primary", emailAddress: "member@example.com" }] }), false);
assert.equal(controlRoomNavVisibleForUser(null), false);

const apiSource = readFileSync("src/app/api/drops/route.ts", "utf8");
assert.match(apiSource, /historicalDropFeedEnabled/);
assert.match(apiSource, /selectDropFeedHistory\(\s*filtered,\s*historicalMode/);
assert.match(apiSource, /include !== "all" \|\| historicalMode/, "history mode must not bypass public filtering through include=all");

const feedSource = readFileSync("src/components/sections/DropFeed.tsx", "utf8");
assert.match(feedSource, /query\.set\("history", "1"\)/, "rarity-filtered feed requests should explicitly request history");
assert.doesNotMatch(feedSource, /Historical ·/, "timestamps should communicate signal age without extra stale messaging");

const navSource = readFileSync("src/components/Navigation.tsx", "utf8");
assert.doesNotMatch(navSource.match(/const navLinks = \[[\s\S]*?\];/)?.[0] || "", /Control Room/, "Control Room must not enter shared navigation");
assert.match(navSource, /controlRoomNavVisibleForUser\(user\)/);
const desktopNav = navSource.slice(navSource.indexOf("{/* Desktop nav links */}"), navSource.indexOf("{/* Right side */}"));
const mobileAuthMenu = navSource.slice(navSource.indexOf("{/* Mobile auth — clean bottom section */}"));
assert.match(desktopNav, /href="\/admin\/control-room"/, "the exact owner should see Control Room in the desktop navigation");
assert.doesNotMatch(mobileAuthMenu, /href="\/admin\/control-room"/, "Control Room must remain hidden on mobile");

console.log("Historical filtered feed and owner-only desktop navigation contracts passed.");
