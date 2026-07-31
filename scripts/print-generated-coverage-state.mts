import { readFile } from "node:fs/promises";
import path from "node:path";

import coverageModel from "../src/lib/coverage-model.ts";
import stateLifecycle from "../src/config/stateLifecycle.ts";

const { buildCoverageContract } = coverageModel;
const { STATE_LIFECYCLE_CONFIG } = stateLifecycle;

function optionValue(name: string, fallback = "") {
  const prefix = `--${name}=`;
  const match = process.argv.find((entry) => entry.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf8"));
}

const state = optionValue("state").trim().toUpperCase();
if (!/^[A-Z]{2}$/.test(state)) throw new Error("--state must be a two-letter state code.");
const siteRoot = path.resolve(optionValue("site-root", path.join(process.cwd(), "engine", "out", "site")));
const [stats, locations, stores] = await Promise.all([
  readJson(path.join(siteRoot, "stats.json")),
  readJson(path.join(siteRoot, "locations.json")),
  readJson(path.join(siteRoot, "stores.json")),
]);
const contract = buildCoverageContract({
  lifecycle: STATE_LIFECYCLE_CONFIG,
  stateRows: Array.isArray(stats?.stateCoverage?.states) ? stats.stateCoverage.states : [],
  locations: Array.isArray(locations?.locations) ? locations.locations : [],
  stores: Array.isArray(stores?.stores) ? stores.stores : [],
  degradedStates: Array.isArray(stats?.refreshHealth?.degradedStates) ? stats.refreshHealth.degradedStates : [],
  generatedAt: stats?.generatedAt,
  healthLimited: false,
  ncBoardIntelligence: stats?.ncBoardIntelligence || null,
});
const coverageState = contract.states.find((entry) => entry.code === state);
if (!coverageState) throw new Error(`Generated coverage contract has no ${state} state.`);
process.stdout.write(JSON.stringify({ ...coverageState, generatedAt: contract.generatedAt }));
