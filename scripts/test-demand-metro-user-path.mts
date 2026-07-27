import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import {
  CHARLOTTE_METRO_BOARD_GROUP,
  demandMetroAreaMatchesFields,
  demandMetroBoardGroupMatchesFields,
  normalizeDemandMetroAreas,
  parseDemandMetroAreaQuery,
} from "../src/lib/demand-metro-areas.ts";

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

const requiredSurfaces: Array<[string, string[]]> = [
  ["src/config/state-lifecycle.json", ["Charlotte Metro ABC Boards", "Atlanta Metro", "Nashville Metro"]],
  ["src/hooks/useAreaPreferences.ts", ["gaAreas: []", "tnAreas: []"]],
  ["src/lib/preview-qa.ts", ["gaAreas: []", "tnAreas: []"]],
  ["src/app/api/user/preferences/route.ts", ["gaAreas: string[]", "tnAreas: string[]", "normalizeDemandMetroAreas", "trimAreaPreferencesToLimit"]],
  ["src/app/dashboard/page.tsx", ["gaAreas", "tnAreas", "CHARLOTTE_METRO_BOARD_GROUP", "demandMetroAreaMatchesFields"]],
  ["src/components/sections/DropFeed.tsx", ["gaAreas", "tnAreas", "demandMetroAreaMatchesFields", "demandMetroBoardGroupMatchesFields"]],
  ["src/app/api/drops/route.ts", ["parseDemandMetroAreaQuery", "demandMetroAreaMatchesFields"]],
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
