import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CHARLOTTE_METRO_BOARD_GROUP,
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  normalizeNcBoardPreferences,
  normalizeDemandMetroAreas,
  parseDemandMetroAreaQuery,
} from "../src/lib/demand-metro-areas.ts";
import {
  buildDropFeedAreaRequest,
  dropFeedStoreQueryMatches,
  getCoveredAreaOptionsForState,
} from "../src/lib/feed-area-options.ts";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

assert.deepEqual(normalizeDemandMetroAreas("GA", ["Atlanta", "greater atlanta"]), ["Atlanta Metro"]);
assert.deepEqual(normalizeDemandMetroAreas("TN", ["Nashville", "Middle Tennessee"]), ["Nashville Metro"]);
assert.deepEqual(parseDemandMetroAreaQuery("GA", "Atlanta Metro"), { requested: true, valid: true, areas: ["Atlanta Metro"] });
assert.deepEqual(parseDemandMetroAreaQuery("TN", "Memphis Metro"), { requested: true, valid: false, areas: [] });
assert.equal(demandMetroAreaMatchesFields("NC", ["Charlotte, NC 28202"], [CHARLOTTE_METRO_BOARD_GROUP]), true);
assert.equal(demandMetroAreaMatchesFields("NC", ["Charlottesville, VA"], [CHARLOTTE_METRO_BOARD_GROUP]), false);
assert.equal(demandMetroAreaMatchesFields("GA", ["Norcross, GA 30071"], ["Atlanta Metro"]), true);
assert.equal(demandMetroAreaMatchesFields("GA", ["Norcross, MN"], ["Atlanta Metro"]), false);
assert.equal(demandMetroAreaMatchesFields("TN", ["Mount Juliet, TN 37122"], ["Nashville Metro"]), true);
assert.equal(demandMetroAreaMatchesFields("TN", ["Nashville, IN 47448"], ["Nashville Metro"]), false);
assert.equal(demandMetroBoardGroupMatchesFields(["Mecklenburg County ABC Board"], [CHARLOTTE_METRO_BOARD_GROUP]), true);
assert.equal(demandMetroBoardGroupMatchesFields(["Davidson County ABC Board"], [CHARLOTTE_METRO_BOARD_GROUP]), false);
assert.deepEqual(
  normalizeNcBoardPreferences(["Charlotte", "Greater Charlotte", "Wake County ABC"]),
  [CHARLOTTE_METRO_BOARD_GROUP, "Wake County ABC"],
  "equivalent NC metro aliases must consume one canonical area slot",
);

assert.ok(getCoveredAreaOptionsForState("NC").includes(CHARLOTTE_METRO_BOARD_GROUP));
assert.ok(getCoveredAreaOptionsForState("GA").includes("Atlanta Metro"));
assert.ok(getCoveredAreaOptionsForState("TN").includes("Nashville Metro"));

const canonicalMetroRequest = buildDropFeedAreaRequest("GA", "GA::atlanta metro");
assert.deepEqual(canonicalMetroRequest, { key: "area", value: "atlanta metro" });
const canonicalMetroQuery = parseDemandMetroAreaQuery("GA", canonicalMetroRequest?.value);
assert.deepEqual(canonicalMetroQuery, { requested: true, valid: true, areas: ["Atlanta Metro"] });
assert.equal(demandMetroAreaMatchesFields("GA", ["Doraville, GA 30340"], canonicalMetroQuery.areas), true);

const ncBoardRequest = buildDropFeedAreaRequest("NC", "NC::wake county abc");
assert.deepEqual(ncBoardRequest, { key: "store", value: "wake county abc" });
assert.equal(dropFeedStoreQueryMatches({
  state: "NC",
  query: ncBoardRequest?.value || "",
  isBoardLevel: true,
  fields: ["Wake County ABC Board"],
}), true);

const gaCityRequest = buildDropFeedAreaRequest("GA", "GA::doraville");
assert.deepEqual(gaCityRequest, { key: "store", value: "doraville" });
assert.equal(dropFeedStoreQueryMatches({
  state: "GA",
  query: gaCityRequest?.value || "",
  fields: ["Doraville, GA 30340"],
}), true);

const tnCityRequest = buildDropFeedAreaRequest("TN", "TN::franklin");
assert.deepEqual(tnCityRequest, { key: "store", value: "franklin" });
assert.equal(dropFeedStoreQueryMatches({
  state: "TN",
  query: tnCityRequest?.value || "",
  fields: ["Franklin, TN 37064"],
}), true);

assert.deepEqual(
  parseDemandMetroAreaQuery("TN", "Memphis Metro"),
  { requested: true, valid: false, areas: [] },
  "unsupported area values must remain a 400-level API validation failure",
);

const requiredSurfaces: Array<[string, string[]]> = [
  ["src/config/state-lifecycle.json", ["Charlotte Metro ABC Boards", "Atlanta Metro", "Nashville Metro"]],
  ["src/hooks/useAreaPreferences.ts", ["gaAreas: []", "tnAreas: []"]],
  ["src/lib/preview-qa.ts", ["gaAreas: []", "tnAreas: []"]],
  ["src/app/api/user/preferences/route.ts", ["gaAreas: string[]", "tnAreas: string[]", "normalizeDemandMetroAreas", "trimAreaPreferencesToLimit"]],
  ["src/app/dashboard/page.tsx", ["gaAreas", "tnAreas", "CHARLOTTE_METRO_BOARD_GROUP", "demandMetroAreaMatchesFields"]],
  ["src/components/sections/DropFeed.tsx", ["gaAreas", "tnAreas", "demandMetroAreaMatchesFields", "demandMetroBoardGroupMatchesFields", "buildDropFeedAreaRequest"]],
  ["src/app/api/drops/route.ts", ["parseDemandMetroAreaQuery", "demandMetroAreaMatchesFields", "dropFeedStoreQueryMatches"]],
  ["src/app/api/stores/route.ts", ["parseDemandMetroAreaQuery", "demandMetroAreaMatchesFields"]],
  ["src/app/api/locations/route.ts", ["parseDemandMetroAreaQuery", "demandMetroAreaMatchesFields"]],
  ["src/lib/alert-delivery.ts", ["gaAreas", "tnAreas", "demandMetroAreaMatchesFields", "demandMetroBoardGroupMatchesFields", "Atlanta Metro", "Nashville Metro"]],
  ["src/lib/email-alerts.ts", ["gaAreas", "tnAreas", "demandMetroAreaMatchesFields", "demandMetroBoardGroupMatchesFields"]],
  ["src/lib/member-weekly-server.ts", ["GA: strings(areas.gaAreas)", "TN: strings(areas.tnAreas)"]],
  ["src/lib/coverage-model.ts", ["areaOptions"]],
  ["engine/src/export-site-contract.mjs", ["area: signal.area", "sourceAvailabilityVerified"]],
  ["engine/src/location-bible.mjs", ["registeredDemandMetroLocations"]],
  ["engine/src/verify-demand-metros.mjs", ["Charlotte Metro ABC Boards", "Atlanta Metro", "Nashville Metro"]],
];

for (const [path, needles] of requiredSurfaces) {
  const source = read(path);
  for (const needle of needles) {
    assert.ok(source.includes(needle), `${path} must contain ${needle}`);
  }
}

console.log("Charlotte, Atlanta, and Nashville customer-path contracts verified.");
