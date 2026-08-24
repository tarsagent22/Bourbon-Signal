import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");

const activeStates = read("src/lib/activeStates.ts");
const preferences = read("src/lib/statePreferences.ts");
const preferenceApi = read("src/app/api/user/preferences/route.ts");
const dropsApi = read("src/app/api/drops/route.ts");
const locationsApi = read("src/app/api/locations/route.ts");
const dropFeed = read("src/components/sections/DropFeed.tsx");
const dashboard = read("src/app/dashboard/page.tsx");
const alerts = read("src/lib/alert-delivery.ts");
const feedAreas = read("src/lib/feed-area-options.ts");
const geography = read("src/lib/geography-directory.ts");

assert.ok(activeStates.includes('STATE_LIFECYCLE_CONFIG'), "site active-state helpers must consume generated lifecycle configuration");
assert.ok(preferences.includes("ACTIVE_ENGINE_STATE_CODES"), "state preference controls must derive available states from lifecycle");
assert.ok(preferenceApi.includes("geographyState(state)"), "Radar preference normalization must accept canonical nationwide state values");
assert.ok(geography.includes("listMonitoringStates") && feedAreas.includes("listMonitoringStates()"), "Radar monitoring states must come from the nationwide geography directory");
assert.ok(feedAreas.includes("engineCoverage") && feedAreas.includes("active.has(code)"), "engine coverage must remain separate from monitoring availability");
assert.ok(dropsApi.includes("normalizeStateCodeParam") && dropsApi.includes("drops = drops.filter"), "Drop Feed API must normalize and apply state filters");
assert.ok(locationsApi.includes('searchParams.get("state")'), "Finder/map API must support state filtering");
assert.ok(dropFeed.includes("feedStateOptions") && dropFeed.includes("areaMenuOptions"), "Drop Feed must expose lifecycle-backed state and area controls");
assert.ok(dashboard.includes("areaPrefs.states"), "dashboard must preserve member state-area selections");
assert.ok(alerts.includes("candidateMatchesArea") && alerts.includes("normalizeStateCodeParam"), "alerts must match normalized state preferences before delivery");

console.log("State user-path source contract passed.");
