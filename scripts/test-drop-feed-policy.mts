import assert from "node:assert/strict";
import { dropFreshnessTime, resolveDropLimit } from "../src/lib/drop-feed-policy.ts";

assert.equal(resolveDropLimit("40", false, 7), 40);
assert.equal(resolveDropLimit("200", false, 7), 200, "paid watchlist requests must remain compatible");
assert.equal(resolveDropLimit("500", false, 7), 500, "dashboard state analysis must remain compatible");
assert.equal(resolveDropLimit("5000", false, 7), 500, "paid requests still need a defensive ceiling");
assert.equal(resolveDropLimit("500", true, 7), 7, "free previews remain capped by entitlement");

const firstSeen = "2026-07-09T05:58:31.808Z";
const lastConfirmed = "2026-07-10T03:58:33.566Z";
assert.equal(dropFreshnessTime({
  event_type: "cityhive_store_inventory_result",
  timestamp: firstSeen,
  first_seen_at: firstSeen,
  last_confirmed_at: lastConfirmed,
}), Date.parse(lastConfirmed), "inventory freshness must use last confirmation without changing display time");
assert.equal(dropFreshnessTime({
  event_type: "release_watch",
  timestamp: firstSeen,
  last_confirmed_at: lastConfirmed,
}), Date.parse(firstSeen), "context events stay anchored to their public event timestamp");

console.log("Drop feed policy tests passed.");
