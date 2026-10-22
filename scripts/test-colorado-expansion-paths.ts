import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { matchDropToPreferences } from "../src/lib/email-alerts.ts";
import { matchedColoradoArea, SUPPORTED_COLORADO_AREAS } from "../src/lib/colorado-area.ts";

const springs = { state: "CO", store_city: "Colorado Springs", store_address: "Colorado Springs, CO 80909" } as never;
const preferences = (coAreas: string[]) => ({ states: ["CO"], coAreas }) as never;
for (const selected of [[], ["Denver Metro", "Colorado Springs"], ["Colorado Springs"]]) {
  assert.deepEqual(matchDropToPreferences(springs, preferences(selected)), {
    matched: true, matchedState: "CO", matchedArea: "Colorado Springs",
  });
}
assert.deepEqual(matchDropToPreferences(springs, preferences(["Denver Metro"])), { matched: false });
assert.equal(matchedColoradoArea(["Nederland, CO 80466"], SUPPORTED_COLORADO_AREAS), "Boulder County");
assert.equal(matchedColoradoArea(["Boulder, MT 59632"], SUPPORTED_COLORADO_AREAS), null);

for (const file of ["src/components/sections/DropFeed.tsx", "src/app/api/drops/route.ts", "src/app/dashboard/page.tsx", "src/lib/email-alerts.ts"]) {
  const source = readFileSync(file, "utf8");
  assert.ok(source.includes("SUPPORTED_COLORADO_AREAS"), `${file} must support every configured Colorado area`);
  assert.ok(!source.includes('["Denver Metro"]'), `${file} must not silently constrain all Colorado inventory to Denver`);
}
const alerts = readFileSync("src/lib/alert-delivery.ts", "utf8");
assert.ok(alerts.includes("matchedColoradoArea(locationFields, areaPrefs.coAreas)"), "delivery labels must use the actual matching area");
console.log("Colorado feed, API, preferences, and matched alert area checks passed.");
