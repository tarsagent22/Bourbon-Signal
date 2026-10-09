import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { buildSignalFeedAreaDirectory, canonicalSignalFeedAreaSelection } from "../src/lib/feed-area-options.ts";
import { NC_ABC_BOARDS, canonicalNcAbcBoardPreference, ncAbcBoardPreferencesMatch } from "../src/lib/nc-abc-boards.ts";
import { ncBoardLocality, ncBoardLocalityMatches } from "../src/lib/nc-board-localities.ts";
import { legacyAreaPreferencesFromScopes, normalizeMonitoringScopes } from "../src/lib/monitoring-scopes.ts";

const directory = buildSignalFeedAreaDirectory().states.find(state => state.code === "NC")!;
const localityData = JSON.parse(readFileSync(new URL("../src/config/nc-board-localities.json", import.meta.url), "utf8"));
assert.equal(localityData.boards.length, NC_ABC_BOARDS.length);
assert.equal(new Set(localityData.boards.map((board: { value: string }) => board.value)).size, NC_ABC_BOARDS.length);
for (const board of NC_ABC_BOARDS) {
  const option = directory.options.find(option => option.value === board.filterLabel)!;
  assert.ok(option, `Keep ${board.filterLabel} selectable`);
  assert.match(option.displayName!, / County$/);
  assert.ok(option.label.includes(board.filterLabel), "Older apps must still distinguish boards without rendering subtitles");
  assert.ok(option.subtitle?.startsWith(board.filterLabel));
  assert.equal(canonicalSignalFeedAreaSelection("NC", option.value), board.filterLabel);
  assert.equal(ncAbcBoardPreferencesMatch([board.label], [option.value]), true);
  const source = localityData.boards.find((row: { value: string }) => row.value === board.filterLabel);
  assert.equal(source.sourceUrl, `https://abc2.nc.gov/Districts/Board/${board.sourceId}`);
}
const triad = ncBoardLocality("Triad Municipal ABC");
assert.equal(triad.displayName, "Forsyth County");
assert.match(triad.subtitle!, /Winston-Salem/);
for (const query of ["Forsyth", "Winston-Salem", "Winston Salem", "Clemmons", "Triad"]) assert.equal(ncBoardLocalityMatches("Triad Municipal ABC", query), true);
assert.equal(ncBoardLocalityMatches("Greensboro ABC", "Forsyth"), false);
// Discovery labels must not redirect inventory evidence or silently widen alerts.
assert.equal(canonicalNcAbcBoardPreference("Forsyth County"), null);
assert.equal(ncAbcBoardPreferencesMatch(["Forsyth County"], ["Triad Municipal ABC"]), false);
const scopes = normalizeMonitoringScopes([{ type: "board", state: "NC", id: "board:NC:triad-municipal-abc", label: "Triad Municipal ABC" }]);
assert.equal(scopes[0].label, "Triad Municipal ABC");
assert.deepEqual(legacyAreaPreferencesFromScopes(scopes).ncBoards, ["Triad Municipal ABC"]);
assert.ok(directory.options.filter(option => option.displayName === "Guilford County").length > 1, "Multiple boards in a county stay separate");
assert.equal(new Set(directory.options.map(option => option.value)).size, directory.options.length);
assert.equal(directory.options.find(option => option.value === "Charlotte Metro ABC Boards")?.label, "Charlotte Metro ABC Boards");
console.log("Official locality labels preserve all board identities and alert scope.");
