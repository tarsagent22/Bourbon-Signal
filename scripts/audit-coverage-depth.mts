import { readFile } from "node:fs/promises";
import path from "node:path";

import { STATE_LIFECYCLE_CONFIG } from "../src/config/stateLifecycle.ts";
import {
  buildCoverageContract,
  type CoverageDropInput,
  type CoverageLocationInput,
  type CoverageNcBoardIntelligenceInput,
  type CoverageStateRowInput,
  type CoverageStoreInput,
} from "../src/lib/coverage-model.ts";
import { mergeCoverageStores } from "../src/lib/coverage-known-stores.ts";
import { normalizePublicDropEvidenceInput } from "../src/lib/public-drop-evidence.ts";

function optionValue(name: string, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function markdownCell(value: unknown) {
  return String(value ?? "").replace(/\|/g, "\\|");
}

async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf8"));
}

async function readOptionalDropFixture(file: string) {
  if (!file) return [] as CoverageDropInput[];
  const payload = await readJson(path.resolve(file));
  const rows = Array.isArray(payload)
    ? payload
    : payload && typeof payload === "object" && Array.isArray((payload as { drops?: unknown }).drops)
      ? (payload as { drops: unknown[] }).drops
      : [];
  return rows.filter((row): row is CoverageDropInput => Boolean(row) && typeof row === "object");
}

const siteRoot = path.resolve(optionValue("site-root", path.join(process.cwd(), "engine", "out", "site")));
const retailerFixturePath = optionValue("retailer-fixture");
const check = process.argv.includes("--check");
const format = optionValue("format", "markdown");
const [stats, locations, stores, drops, mississippiKnownStores] = await Promise.all([
  readJson(path.join(siteRoot, "stats.json")),
  readJson(path.join(siteRoot, "locations.json")),
  readJson(path.join(siteRoot, "stores.json")),
  readJson(path.join(siteRoot, "drops.json")),
  readJson(path.join(process.cwd(), "src", "config", "mississippi-known-stores.json")),
]);
const retailerFixtureDrops = await readOptionalDropFixture(retailerFixturePath);

const asOf = optionValue("as-of", new Date().toISOString());
const contract = buildCoverageContract({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: Array.isArray(stats?.stateCoverage?.states) ? stats.stateCoverage.states as CoverageStateRowInput[] : [],
  locations: Array.isArray(locations?.locations) ? locations.locations as CoverageLocationInput[] : [],
  stores: mergeCoverageStores(
    Array.isArray(mississippiKnownStores?.stores) ? mississippiKnownStores.stores as CoverageStoreInput[] : [],
    Array.isArray(stores?.stores) ? stores.stores as CoverageStoreInput[] : [],
  ),
  // The live server performs full site normalization then this same pure
  // evidence projection. The audit accepts a retailer card fixture so it can
  // exercise the production-only supplemental evidence path without a DB.
  drops: [
    ...(Array.isArray(drops?.drops) ? drops.drops as CoverageDropInput[] : []),
    ...retailerFixtureDrops,
  ].map(normalizePublicDropEvidenceInput),
  degradedStates: Array.isArray(stats?.refreshHealth?.degradedStates) ? stats.refreshHealth.degradedStates : [],
  generatedAt: typeof stats?.generatedAt === "string" ? stats.generatedAt : null,
  asOf,
  ncBoardIntelligence: (stats?.ncBoardIntelligence || null) as CoverageNcBoardIntelligenceInput | null,
  healthLimited: false,
});

const failures: string[] = [];
if (contract.contractVersion !== "bourbon-signal/coverage@3") failures.push(`Unexpected contract version: ${contract.contractVersion}`);
if (contract.states.length !== 51) failures.push(`Expected 51 state/DC records, got ${contract.states.length}`);
if (new Set(contract.states.map((state) => state.code)).size !== 51) failures.push("State/DC codes are not unique");

for (const state of contract.states) {
  const { freshness, layers, scope, capabilities } = state;
  if (layers.live !== freshness.currentInventoryStores) failures.push(`${state.code}: live layer differs from current evidence`);
  if (layers.alertGrade !== freshness.alertEligibleStores) failures.push(`${state.code}: alert layer differs from alert-eligible evidence`);
  if (scope.inventoryMonitoredStores !== freshness.currentInventoryStores) failures.push(`${state.code}: public inventory scope differs from current evidence`);
  if (freshness.currentInventoryStores > freshness.observedInventoryStores) failures.push(`${state.code}: current inventory exceeds observed inventory`);
  if (freshness.staleInventoryStores > freshness.observedInventoryStores) failures.push(`${state.code}: stale inventory exceeds observed inventory`);
  if (freshness.alertEligibleStores > freshness.currentInventoryStores) failures.push(`${state.code}: alert inventory exceeds current inventory`);
  if (capabilities.currentBottleAvailability !== (freshness.currentInventoryStores > 0)) failures.push(`${state.code}: current availability contradicts evidence`);
  if (capabilities.restockAlerts !== (freshness.alertEligibleStores > 0)) failures.push(`${state.code}: alert capability contradicts evidence`);
  if (capabilities.publicUpdates !== (freshness.freshPublicUpdates > 0)) failures.push(`${state.code}: public updates contradict fresh customer output`);
  // Coverage availability reflects a verified source lane. Current depth is a
  // stricter, freshness-gated property, so an available state may legitimately
  // have no current depth while its source is temporarily quiet.
  if (state.coverageDepth !== "not-available" && state.coverageStatus !== "available") {
    failures.push(`${state.code}: current coverage depth lacks an available source lane`);
  }
  if (state.coverageDepth !== "not-available" && freshness.freshPublicSignals === 0) failures.push(`${state.code}: depth has no fresh customer-feed evidence`);

  // Strength is intentionally independent of freshness, but must still be
  // backed by verified source targets/areas or canonical tracked-board data.
  const broadVerifiedCoverage = scope.trackedShipmentBoards >= 25
    || (scope.verifiedSourceTargets >= 25 && scope.verifiedSourceAreas >= 5);
  const meaningfulVerifiedCoverage = scope.trackedShipmentBoards >= 5
    || (scope.verifiedSourceTargets >= 5 && scope.verifiedSourceAreas >= 2);
  if (state.coverageStatus === "not-available" && state.coverageStrength !== "none") {
    failures.push(`${state.code}: unavailable source lane cannot carry a strength tier`);
  }
  if (state.coverageStatus === "available" && state.coverageStrength === "none") {
    failures.push(`${state.code}: available source lane cannot have no coverage strength`);
  }
  if (state.coverageStrength === "strong" && !broadVerifiedCoverage) {
    failures.push(`${state.code}: strong coverage lacks broad verified source breadth`);
  }
  if (state.coverageStrength === "moderate" && !meaningfulVerifiedCoverage) {
    failures.push(`${state.code}: moderate coverage lacks multi-target verified breadth`);
  }

  const directActive = freshness.currentInventoryStores >= 5
    && freshness.currentInventoryCities >= 2;
  const updateActive = freshness.freshPublicUpdateBoards >= 20
    || (freshness.freshPublicUpdateStores >= 25 && freshness.freshPublicUpdateCities >= 5);
  if (state.coverageDepth === "active" && !directActive && !updateActive) failures.push(`${state.code}: active depth lacks fresh direct or broad update evidence`);

  const directModerate = freshness.currentInventoryStores >= 2
    && freshness.currentInventoryCities >= 2;
  const updateModerate = freshness.freshPublicUpdateBoards >= 5
    || (freshness.freshPublicUpdateStores >= 5 && freshness.freshPublicUpdateCities >= 2)
    || freshness.freshPublicUpdateAreas >= 2;
  if (state.coverageDepth === "moderate" && !directModerate && !updateModerate) failures.push(`${state.code}: moderate depth lacks fresh geographic evidence`);
}

const rows = [...contract.states].sort((left, right) => left.name.localeCompare(right.name));
const groups = new Map(["active", "moderate", "sparse", "not-available"].map((depth) => [depth, rows.filter((state) => state.coverageDepth === depth)]));
const strengthGroups = new Map(["strong", "moderate", "sparse", "none"].map((strength) => [strength, rows.filter((state) => state.coverageStrength === strength)]));

if (format === "json") {
  process.stdout.write(`${JSON.stringify({
    contractVersion: contract.contractVersion,
    generatedAt: contract.generatedAt,
    evaluatedAt: contract.evaluatedAt,
    retailerFixturePath: retailerFixturePath || null,
    failures,
    groups: Object.fromEntries(Array.from(groups, ([depth, states]) => [depth, states.map((state) => state.code)])),
    strengthGroups: Object.fromEntries(Array.from(strengthGroups, ([strength, states]) => [strength, states.map((state) => state.code)])),
    states: rows,
  }, null, 2)}\n`);
} else {
  console.log(`## Coverage depth audit — evaluated ${contract.evaluatedAt}`);
  console.log("");
  for (const [depth, states] of groups) {
    console.log(`**${depth} (${states.length})** — ${states.map((state) => state.name).join(", ") || "None"}`);
  }
  console.log("");
  console.log("## Coverage strength (verified historical breadth)");
  console.log("");
  for (const [strength, states] of strengthGroups) {
    console.log(`**${strength} (${states.length})** — ${states.map((state) => state.name).join(", ") || "None"}`);
  }
  console.log("");
  console.log("| State | Strength | Verified evidence targets | Areas | Tracked shipment boards | Depth | Fresh signals | Fresh updates | Update scope (boards/stores/cities) | Current stores | Alert-eligible stores |");
  console.log("| --- | --- | ---: | ---: | ---: | --- | ---: | ---: | ---: | ---: | ---: |");
  for (const state of rows) {
    const { freshness } = state;
    console.log(`| ${markdownCell(state.name)} | ${state.coverageStrength} | ${state.scope.verifiedSourceTargets} | ${state.scope.verifiedSourceAreas} | ${state.scope.trackedShipmentBoards} | ${state.coverageDepth} | ${freshness.freshPublicSignals} | ${freshness.freshPublicUpdates} | ${freshness.freshPublicUpdateBoards}/${freshness.freshPublicUpdateStores}/${freshness.freshPublicUpdateCities} | ${freshness.currentInventoryStores} | ${freshness.alertEligibleStores} |`);
  }
  if (failures.length) {
    console.log("");
    console.log("### Contradictions");
    for (const failure of failures) console.log(`- ${failure}`);
  }
}

if (check && failures.length) throw new Error(`Coverage depth audit failed with ${failures.length} contradiction(s).`);
if (check && format !== "json") console.log("Coverage depth audit invariants passed.");
