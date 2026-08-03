import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const siteModule = await import("../src/lib/site-engine-contract.ts");
const historyModule = await import("../src/lib/drop-feed-history.ts");
const evidenceModule = await import("../src/lib/public-drop-evidence.ts");
const feedAreaModule = await import("../src/lib/feed-area-options.ts");
const boardModule = await import("../src/lib/nc-abc-boards.ts");
const site = siteModule.default || siteModule;
const history = historyModule.default || historyModule;
const evidence = evidenceModule.default || evidenceModule;
const feedArea = feedAreaModule.default || feedAreaModule;
const boards = boardModule.default || boardModule;

function shipment(locationName: string, county: string) {
  return site.normalizeDropForSite({
    id: `shipment-${locationName}`,
    state: "NC",
    type: "nc_board_shipment_snapshot",
    bottleName: "Buffalo Trace Bourbon",
    tier: "allocated",
    locationName,
    locationPrecision: "board_county",
    county,
    quantity: 12,
    displayAt: "2026-01-10T12:00:00.000Z",
    observedAt: "2026-01-10T12:00:00.000Z",
    isUserFacing: true,
  });
}

const dunn = shipment("Dunn ABC Board", "Dunn");
assert.equal(dunn.board_name, "Dunn ABC", "Dunn shipment display must use the canonical board identity, not Dunn County");
assert.equal(dunn.display_location, "Dunn ABC");
assert.equal(evidence.isPublicDropFeedEligible(dunn), true, "board shipments remain eligible public signals");
assert.equal(
  feedArea.dropFeedStoreQueryMatches({
    state: "NC",
    query: "Dunn ABC",
    isBoardLevel: true,
    fields: [dunn.locationName, dunn.board_name, dunn.display_location, dunn.store_county, dunn.county],
  }),
  true,
  "Dunn shipment must survive the area filter",
);
const historicalDunn = history.selectDropFeedHistory([dunn], true, () => false, () => true);
assert.equal(historicalDunn.length, 1, "an area-scoped request must retain an eligible old board shipment");
assert.equal(historicalDunn[0].id, dunn.id);
assert.equal(historicalDunn[0].historical, true);

const legacyDunn = shipment("Dunn County", "Dunn");
assert.equal(legacyDunn.board_name, "Dunn ABC", "legacy county-style shipment identities must canonicalize across snapshots");

const hertfordCity = shipment("Hertford ABC Board", "Hertford");
assert.equal(hertfordCity.board_name, "Hertford ABC", "municipal Hertford shipments must not become Hertford County shipments");
assert.equal(
  feedArea.dropFeedStoreQueryMatches({
    state: "NC",
    query: "Hertford County ABC",
    isBoardLevel: true,
    fields: [hertfordCity.locationName, "Hertford County", hertfordCity.board_name],
  }),
  false,
  "a later derived county label must not override the authoritative municipal board identity",
);

const genericTribal = shipment("Tribal ABC Commission", "Tribal ABC Commission");
assert.equal(genericTribal.board_name, "Tribal ABC Commission", "ambiguous tribal shipment evidence must remain unassigned rather than being guessed");
assert.equal(
  feedArea.dropFeedStoreQueryMatches({
    state: "NC",
    query: "Catawba Tribal ABC Commission",
    isBoardLevel: true,
    fields: [genericTribal.locationName, genericTribal.board_name],
  }),
  false,
);

const checkedInDrops = JSON.parse(readFileSync(new URL("../engine/out/site/drops.json", import.meta.url), "utf8"));
const checkedInShipments = (checkedInDrops.drops || [])
  .filter((drop: Record<string, unknown>) => String(drop.state || drop.state_code || "").toUpperCase() === "NC")
  .filter((drop: Record<string, unknown>) => String(drop.type || drop.event_type || "") === "nc_board_shipment_snapshot")
  .filter((drop: Record<string, unknown>) => drop.locationName !== "Tribal ABC Commission");
assert.ok(checkedInShipments.length > 500, "the audit fixture must exercise broad NC shipment coverage");
for (const raw of checkedInShipments) {
  const normalized = site.normalizeDropForSite(raw);
  const fields = [normalized.locationName, normalized.board_name, normalized.display_location, normalized.store_county, normalized.county];
  const matchedBoard = boards.matchedNcAbcBoardPreference(fields, boards.NC_ABC_BOARD_OPTIONS);
  assert.ok(matchedBoard, `shipment ${String(normalized.id || normalized.locationName)} must resolve to a canonical board`);
  assert.equal(normalized.board_name, matchedBoard, `shipment ${String(normalized.id || normalized.locationName)} must expose its canonical board label`);
  assert.equal(feedArea.dropFeedStoreQueryMatches({ state: "NC", query: matchedBoard, isBoardLevel: true, fields }), true);
}

console.log(`NC historical board shipment normalization and area matching verified across ${checkedInShipments.length} resolvable shipment rows.`);
