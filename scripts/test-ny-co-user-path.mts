import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const read = (relative: string) => readFileSync(path.join(root, relative), "utf8");
const lifecycle = JSON.parse(read("src/config/state-lifecycle.json"));
const lifecycleSource = read("src/config/stateLifecycle.ts");
const preferencesApi = read("src/app/api/user/preferences/route.ts");
const preferencesHook = read("src/hooks/useAreaPreferences.ts");
const preferencesCache = read("src/lib/area-preferences-cache.ts");
const dashboard = read("src/app/dashboard/page.tsx");
const dropFeed = read("src/components/sections/DropFeed.tsx");
const dropsApi = read("src/app/api/drops/route.ts");
const alerts = read("src/lib/alert-delivery.ts");
const engineSources = read("engine/src/state-sources.mjs");
const metroRetailerSources = read("engine/src/collectors/metro-retailer-surfaces.mjs");
const precision = read("engine/src/collectors/precision-probes.mjs");
const confidence = read("engine/src/confidence-policy.mjs");
const exporter = read("engine/src/export-site-contract.mjs");

for (const [state, label, areas] of [["NY", "New York", ["New York City", "Nassau County"]], ["CO", "Colorado", ["Denver Metro"]]]) {
  const entry = lifecycle.states[state];
  assert.ok(["shadow", "active"].includes(entry.publicStatus), `${state} must be staged or customer-active`);
  if (entry.publicStatus === "active") assert.ok(lifecycle.activeStates.includes(state), `${state} active lifecycle must be listed customer-active`);
  assert.equal(entry.customerLabel, label);
  assert.equal(entry.lifecycle, "retailer_store_inventory");
  assert.equal(entry.coverageTier, "live_store_inventory");
  assert.equal(entry.refinementLevel, "city");
  assert.deepEqual(entry.areaOptions, areas);
  assert.ok(areas.every((area) => entry.customerSummary.includes(area)));
  assert.ok(engineSources.includes(`id: '${state}'`), `${state} must have a source registry entry`);
  assert.ok(precision.includes(`config.id === '${state}'`), `${state} must be routed through the precision collector`);
  assert.ok(confidence.includes(`${state}: { maxAlertMode: 'policy_only'`), `${state} must fail closed through a retailer identity policy`);
  assert.ok(existsSync(path.join(root, `engine/data/state-integration/${state}.json`)), `${state} integration manifest must exist`);
  assert.ok(existsSync(path.join(root, `engine/data/state-fixtures/${state}.json`)), `${state} fixture manifest must exist`);
}

assert.deepEqual(lifecycle.states.NY.areaOptions, ["New York City", "Nassau County"]);
assert.ok(lifecycle.states.NY.customerSummary.includes("Nassau County"));
assert.ok(engineSources.includes("New York City + Nassau County first-party retailer inventory"), "NY operational source metadata must name both supported areas");
assert.ok(engineSources.includes("Exact-premises New York City and Nassau County retailer inventory"), "NY operational source value must not retain the old Manhattan-only scope");
assert.ok(confidence.includes("New York City, Nassau County, and Denver Metro retailer rows"), "central metro confidence metadata must name Nassau County");
assert.ok(exporter.includes("New York City, Nassau County, or Denver Metro retailer availability"), "exported on-site candidate metadata must name Nassau County");
assert.ok(metroRetailerSources.includes("wine-gallery") && metroRetailerSources.includes("cherrywood-wine") && metroRetailerSources.includes("westbury-liquors"));
assert.ok(dropFeed.includes("SUPPORTED_NEW_YORK_AREAS"), "Drop Feed defaults must use the complete New York area contract");

assert.ok(lifecycleSource.includes('New York City') && lifecycleSource.includes('Nassau County') && lifecycleSource.includes('Denver Metro'), "generated lifecycle source must expose every metro scope");
assert.ok(existsSync(path.join(root, "src/lib/new-york-area.ts")));
assert.ok(existsSync(path.join(root, "src/lib/colorado-area.ts")));

for (const [field, area] of [["nyAreas", "New York City"], ["coAreas", "Denver Metro"]]) {
  assert.ok(preferencesApi.includes(field), `${field} must be part of member preference types and normalized by the preference API`);
  assert.ok(preferencesHook.includes(field), `${field} must be initialized and editable through the area preference hook`);
  assert.ok(preferencesCache.includes('UserAlertPreferences'), `area preferences must remain account-owned in the shared cache`);
  assert.ok(dashboard.includes(field), `${field} must be editable on Dashboard`);
  assert.ok(dropFeed.includes(field), `${field} must filter Drop Feed rows client-side`);
  assert.ok(dropsApi.includes(field), `${field} must filter Drop Feed rows server-side`);
  assert.ok(alerts.includes(field), `${field} must participate in alert matching`);
  if (field === "nyAreas") assert.ok(alerts.includes("matchedNewYorkArea"), "New York alerts must preserve the exact matched area label");
  else assert.ok(alerts.includes(area), `${area} must appear in matched-area alert labels`);
}

assert.ok(dropsApi.includes('parseNewYorkAreaQuery') && dropsApi.includes('newYorkAreaMatchesFields'));
assert.ok(dropsApi.includes('parseColoradoAreaQuery') && dropsApi.includes('coloradoAreaMatchesFields'));
assert.ok(alerts.includes('newYorkAreaMatchesFields') && alerts.includes('coloradoAreaMatchesFields'));
assert.ok(dropFeed.includes('newYorkAreaMatchesFields') && dropFeed.includes('coloradoAreaMatchesFields'));
assert.ok(dropFeed.includes('if (urlStateFilter || hasSelectedStates) return true;'), "an implicit saved-state default must not bypass saved New York area preferences");
assert.ok(preferencesApi.includes('normalizeNewYorkAreas') && preferencesApi.includes('normalizeColoradoAreas'));
assert.ok(dashboard.includes('SUPPORTED_NEW_YORK_AREAS') && dashboard.includes('SUPPORTED_COLORADO_AREAS'));

console.log("New York City, Nassau County, and Denver/Colorado website wiring contract passed.");
