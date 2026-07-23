import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  formatScheduledReleaseOccurrence,
  getScheduledReleaseSignalCopy,
  isScheduledReleaseSignal,
} from "../src/lib/scheduled-release-signals.ts";

const releaseDrop = {
  timestamp: "2026-07-23T04:36:39.598Z",
  event_type: "alabc_limited_release_store_drop",
  brand_name: "Weller Full Proof Bourbon",
  canonical_name: "Weller Full Proof",
  rarity_tier: "allocated",
  state: "AL",
  state_code: "AL",
  store_name: "ABC Store #123",
  store_address: "123 Main St",
  store_city: "Birmingham",
  location_precision: "store_level",
  releaseDate: "2026-07-25",
  eventDate: "2026-07-25",
  retail_price: 65,
  signal_label: "Scheduled ABC release",
  signal_category: "release_watch",
  can_alert_as_inventory: false,
  inventoryCaveat: "Scheduled release intelligence only; not live shelf inventory.",
};

assert.equal(isScheduledReleaseSignal(releaseDrop), true, "Alabama limited-release rows must be recognized as scheduled release signals");
assert.equal(isScheduledReleaseSignal({ ...releaseDrop, event_type: "cityhive_store_inventory_result", signal_category: "inventory" }), false, "live retailer inventory must not be labeled as scheduled release");
assert.equal(formatScheduledReleaseOccurrence(releaseDrop), "Release occurs Jul 25, 2026", "scheduled releases must show when the release actually happens");

const copy = getScheduledReleaseSignalCopy(releaseDrop);
assert.equal(copy.badge, "Scheduled release");
assert.equal(copy.statusLine, "Release occurs Jul 25, 2026");
assert.match(copy.explanation, /not live shelf inventory/i);
assert.match(copy.detail, /planned ABC release/i);
assert.match(copy.detail, /confirm release rules/i);

const dropsSource = readFileSync(new URL("../src/lib/drops.ts", import.meta.url), "utf8");
assert.match(dropsSource, /scheduledRelease\??:/, "grouped drops must retain the scheduled-release distinction");
assert.match(dropsSource, /scheduledReleaseLabel\??:/, "grouped drops must retain the scheduled-release occurrence label");

const dropFeedSource = readFileSync(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8");
assert.match(dropFeedSource, /getScheduledReleaseSignalCopy/, "DropFeed must render scheduled-release timing from the shared copy helper");
assert.match(dropFeedSource, /Not live inventory/, "scheduled release cards must explicitly say they are not live inventory");

const siteContractSource = readFileSync(new URL("../src/lib/site-engine-contract.ts", import.meta.url), "utf8");
assert.match(siteContractSource, /scheduled_release:\s*Boolean\(scheduledReleaseCopy\)/, "API-normalized drops must expose a scheduled-release boolean");
assert.match(siteContractSource, /scheduledReleaseLabel:\s*scheduledReleaseCopy\?\.statusLine/, "API-normalized drops must expose the occurrence label");

console.log("Scheduled release copy tests passed.");
