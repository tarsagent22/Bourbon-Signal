import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dropFreshnessTime, resolveDropLimit } from "../src/lib/drop-feed-policy.ts";
import { resolveDropQuantitySemantics } from "../src/lib/drop-quantity-semantics.ts";
import { coveredAreaLabelsMatch, getCoveredAreaOptionsForState } from "../src/lib/feed-area-options.ts";

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

const singleStoreShipment = resolveDropQuantitySemantics({
  type: "nc_board_shipment_snapshot",
  quantity: null,
  boardShipmentQuantity: 6,
});
assert.equal(singleStoreShipment.inventoryQuantity, 0, "store-equivalent shipment rows must never expose shelf quantity");
assert.equal(singleStoreShipment.shipmentQuantity, 6, "store-equivalent shipment rows must preserve official shipped units");
assert.equal(singleStoreShipment.visibilityQuantity, 6, "store-equivalent shipment units must keep the informational row visible");
const siteContractSource = readFileSync(new URL("../src/lib/site-engine-contract.ts", import.meta.url), "utf8");
assert.match(siteContractSource, /resolveDropQuantitySemantics\(drop\)/, "site normalization must apply shipment quantity semantics");
assert.match(siteContractSource, /quantity_shipped:\s*shipmentQuantity\s*\|\|\s*undefined/, "site normalization must export shipped units separately");
assert.match(siteContractSource, /store_equivalent_shipment"\)\s*\?\s*"board"/, "store-equivalent shipment availability must remain board-scoped");
const dropDomainSource = readFileSync(new URL("../src/lib/drops.ts", import.meta.url), "utf8");
assert.match(dropDomainSource, /event\.quantity_in_stock\s*\?\?\s*event\.quantity_shipped\s*\?\?\s*event\.quantity/, "drop-domain filtering must retain normalized shipment rows");

assert.deepEqual(getCoveredAreaOptionsForState(null), [], "all-state feed should not preload every configured area");
assert.ok(getCoveredAreaOptionsForState("SC").includes("Myrtle Beach"), "South Carolina feed must keep Myrtle Beach selectable even between signal refreshes");
assert.equal(coveredAreaLabelsMatch("Myrtle Beach", "Myrtle Beach"), true);
assert.equal(coveredAreaLabelsMatch("North Myrtle Beach", "Myrtle Beach"), false, "Myrtle Beach must not absorb North Myrtle Beach");
assert.equal(coveredAreaLabelsMatch("North Charleston", "Charleston"), false, "Charleston must not absorb North Charleston");
assert.equal(coveredAreaLabelsMatch("Mecklenburg ABC Board", "Mecklenburg"), true, "board suffix normalization must remain supported");
const dropFeedSource = readFileSync(new URL("../src/components/sections/DropFeed.tsx", import.meta.url), "utf8");
assert.match(dropFeedSource, /getCoveredAreaOptionsForState\(selectedState\)/, "DropFeed must merge configured covered areas for the selected state");
const dropsRouteSource = readFileSync(new URL("../src/app/api/drops/route.ts", import.meta.url), "utf8");
assert.match(dropsRouteSource, /\}\)\s*\|\|\s*Boolean\(state\)/, "Selecting a state must auto-include that state's freshest historical rows instead of requiring See more");

console.log("Drop feed policy tests passed.");
