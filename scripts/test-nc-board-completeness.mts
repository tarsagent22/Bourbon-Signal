import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getCoveredAreaOptionsForState, buildDropFeedAreaRequest, dropFeedStoreQueryMatches, formatNcAbcAreaMenuLabel } from "../src/lib/feed-area-options.ts";
import { normalizeNcBoardPreferences } from "../src/lib/demand-metro-areas.ts";
import { searchCoverageTargets } from "../src/lib/coverage-model.ts";
import { ncAbcBoardPreferencesMatch } from "../src/lib/nc-abc-boards.ts";

const readJson = (relative: string) => JSON.parse(readFileSync(new URL(`../${relative}`, import.meta.url), "utf8"));
const readText = (relative: string) => readFileSync(new URL(`../${relative}`, import.meta.url), "utf8");
const normalize = (value: unknown) => String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");

const registry = readJson("src/config/nc-abc-boards.json") as {
  sourceUrl: string;
  boards: Array<{ id: string; label: string; filterLabel: string }>;
};
assert.equal(registry.sourceUrl, "https://abc2.nc.gov/Search/ABCStoreLocator");
assert.equal(registry.boards.length, 173, "the canonical registry must contain every current official NC ABC board option");
assert.equal(new Set(registry.boards.map((board) => board.id)).size, registry.boards.length, "canonical board IDs must be unique");
assert.equal(new Set(registry.boards.map((board) => normalize(board.label))).size, registry.boards.length, "canonical board labels must be unique");
assert.equal(new Set(registry.boards.map((board) => normalize(board.filterLabel))).size, registry.boards.length, "customer board options must be unique");
for (const board of registry.boards) {
  assert.match(board.id, /^nc-abc-board-\d+$/);
  assert.match(board.label, / ABC (?:Board|Commission)$/);
  assert.equal(board.filterLabel, board.label.replace(/ Board$/, ""));
}
for (const sentinel of ["Alamance Municipal ABC Board", "Mecklenburg County ABC Board", "Catawba Tribal ABC Commission", "Cherokee Tribal ABC Commission", "Wilkesboro ABC Board", "Yadkin Valley ABC Board"]) {
  assert.ok(registry.boards.some((board) => board.label === sentinel), `${sentinel} must remain in the canonical registry`);
}

const feedOptions = getCoveredAreaOptionsForState("NC");
for (const board of registry.boards) {
  assert.ok(feedOptions.includes(board.filterLabel), `${board.filterLabel} must be a stable NC Drop Feed option`);
  assert.deepEqual(buildDropFeedAreaRequest("NC", `NC::${board.filterLabel}`), { key: "store", value: board.filterLabel });
  assert.deepEqual(normalizeNcBoardPreferences([board.label]), [board.filterLabel]);
  assert.deepEqual(normalizeNcBoardPreferences([board.filterLabel]), [board.filterLabel]);
}
assert.ok(feedOptions.includes("Charlotte Metro ABC Boards"), "the reviewed Charlotte board group must remain available");

for (const board of registry.boards) {
  assert.ok(
    ncAbcBoardPreferencesMatch([board.label], [board.filterLabel]),
    `${board.filterLabel} must remain matchable by feed/alert/email delivery`,
  );
  assert.ok(
    ncAbcBoardPreferencesMatch([`${board.filterLabel} - Store 1`], [board.filterLabel]),
    `${board.filterLabel} store-level labels must remain matchable`,
  );
  for (const other of registry.boards) {
    if (other.id === board.id) continue;
    assert.equal(
      ncAbcBoardPreferencesMatch([other.label], [board.filterLabel]),
      false,
      `${board.filterLabel} must not cross-match ${other.filterLabel}`,
    );
    assert.equal(
      dropFeedStoreQueryMatches({ state: "NC", query: board.filterLabel, fields: [other.label], isBoardLevel: true }),
      false,
      `Drop Feed query ${board.filterLabel} must not cross-match ${other.filterLabel}`,
    );
  }
}
assert.deepEqual(normalizeNcBoardPreferences(["Fake County ABC", "NC statewide warehouse"]), [], "unsupported saved labels must be rejected");
assert.equal(formatNcAbcAreaMenuLabel("Catawba Tribal ABC Commission"), "Catawba Tribal ABC Commission");
assert.equal(formatNcAbcAreaMenuLabel("Cherokee Tribal ABC Commission"), "Cherokee Tribal ABC Commission");

const alertPayload = readJson("engine/out/site/alerts.json") as { alerts?: Array<Record<string, unknown>> };
const ncStoreCandidates = (alertPayload.alerts || []).filter((candidate) => String(candidate.state || "").toUpperCase() === "NC" && candidate.locationPrecision === "store_level");
assert.ok(ncStoreCandidates.length > 0, "checked-in export must retain NC store-level alert fixtures");
for (const candidate of ncStoreCandidates) {
  const fields = [candidate.locationName, candidate.storeName, candidate.storeAddress, candidate.city];
  assert.ok(
    registry.boards.some((board) => ncAbcBoardPreferencesMatch(fields, [board.filterLabel])),
    `NC store alert ${String(candidate.id || candidate.locationName)} must resolve to one canonical board`,
  );
}

const officialLocations = readJson("engine/out/site/locations.json") as { locations: Array<Record<string, unknown>> };
const officialNcBoardLabels = new Set(
  officialLocations.locations
    .filter((location) => String(location.state || "").toUpperCase() === "NC" && String(location.type || location.locationType || "").toLowerCase() === "county_board")
    .map((location) => normalize(location.name)),
);
for (const board of registry.boards) {
  assert.ok(officialNcBoardLabels.has(normalize(board.label)), `${board.label} must survive the customer location export`);
}

const lifecycle = readJson("src/config/state-lifecycle.json") as Record<string, unknown>;
const storesPayload = readJson("engine/out/site/stores.json") as { stores?: Array<Record<string, unknown>> };
const locationsPayload = readJson("engine/out/site/locations.json") as { locations?: Array<Record<string, unknown>> };
for (const board of registry.boards) {
  const results = searchCoverageTargets({
    stateCode: "NC",
    query: board.label,
    lifecycle,
    stores: storesPayload.stores || [],
    locations: locationsPayload.locations || [],
    limit: 20,
  });
  assert.ok(results.some((result) => normalize(result.label) === normalize(board.label)), `${board.label} must be searchable in Coverage/Finder`);
}

const dashboard = readText("src/app/dashboard/page.tsx");
assert.match(dashboard, /NC_ABC_BOARD_OPTIONS/, "dashboard board preferences must start from the canonical registry, not transient stores or drops");
const ncVerifier = readText("engine/src/verify-nc-directory.mjs");
assert.match(ncVerifier, /nc-abc-boards\.json/);
assert.match(ncVerifier, /canonical board/i);
assert.match(ncVerifier, /observedAt/);
assert.match(ncVerifier, /36 \* 60 \* 60 \* 1000/);
const refreshWorkflow = readText(".github/workflows/refresh-feed.yml");
assert.equal((refreshWorkflow.match(/!inputs\.states \|\| contains\(inputs\.states, 'NC'\)/g) || []).length, 2, "scheduled/full refreshes must collect and verify the NC board directory");
const preferenceRoute = readText("src/app/api/user/preferences/route.ts");
assert.match(preferenceRoute, /normalizeNcBoardPreferences/);
const alertDelivery = readText("src/lib/alert-delivery.ts");
const emailAlerts = readText("src/lib/email-alerts.ts");
const weekly = readText("src/lib/member-weekly-server.ts");
for (const [surface, source] of [["alert delivery", alertDelivery], ["email alerts", emailAlerts], ["weekly intelligence", weekly]] as const) {
  assert.match(source, /ncBoards/, `${surface} must continue consuming saved NC board preferences`);
}

console.log(`NC board completeness verified across ${registry.boards.length} canonical boards, feed options, preferences, directory export, Coverage/Finder, and alert consumers.`);
