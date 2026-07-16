import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { scoreRetailerProspect, type RetailerProspectScoreInput } from "../../src/lib/retailer-acquisition.ts";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

async function readJson(file: string) {
  return JSON.parse(await readFile(file, "utf8")) as Record<string, unknown>;
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function count(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.floor(number)) : 0;
}

function marketKey(prospect: Record<string, unknown>) {
  return `${String(prospect.city || "").trim().toLowerCase()}|${String(prospect.state || "").trim().toUpperCase()}`;
}

const inputPath = option("--input");
const outputPath = option("--output");
const demandPath = option("--demand");
const coveragePath = option("--coverage");
if (!inputPath || !outputPath) throw new Error("Usage: npm run acquisition:rank -- --input <prospects.json> --output <ranked.json> [--demand <aggregate-demand.json>] [--coverage <coverage.json>]");

const input = await readJson(inputPath);
const demandDocument = demandPath ? await readJson(demandPath) : {};
const coverageDocument = coveragePath ? await readJson(coveragePath) : {};
const demandMarkets = record(demandDocument.markets);
const coverageMarkets = record(coverageDocument.markets);
const prospects = Array.isArray(input.prospects) ? input.prospects : [];

const ranked = prospects.map((value) => {
  const prospect = record(value);
  const demand = record(demandMarkets[marketKey(prospect)] || prospect.demand);
  const coverage = record(coverageMarkets[marketKey(prospect)] || prospect.coverage);
  const discovery = record(prospect.discovery);
  const observedStatus = String(discovery.observedStatus || "");
  const suppliedFit = record(prospect.fit);
  const suppliedEvidence = record(prospect.evidence);
  const scoreInput: RetailerProspectScoreInput = {
    demand: {
      searches30d: count(demand.searches30d),
      savedAlerts: count(demand.savedAlerts),
      watchlistMatches: count(demand.watchlistMatches),
    },
    coverage: {
      marketStores: count(coverage.marketStores),
      coveredStores: count(coverage.coveredStores),
      citySignals30d: count(coverage.citySignals30d),
    },
    fit: {
      independent: suppliedFit.independent === true,
      bourbonSpecialist: suppliedFit.bourbonSpecialist === true,
      liveInventoryGap: suppliedFit.liveInventoryGap === true || ["probeable-catalog", "release-watch", "directory-only"].includes(observedStatus),
    },
    evidence: {
      officialContact: suppliedEvidence.officialContact === true,
      officialWebsite: suppliedEvidence.officialWebsite === true || Boolean(prospect.website),
      physicalLocation: suppliedEvidence.physicalLocation === true || Boolean(prospect.address),
    },
  };
  return { ...prospect, score: scoreRetailerProspect(scoreInput) };
}).sort((left, right) => {
  const leftScore = record(left.score).total;
  const rightScore = record(right.score).total;
  return Number(rightScore || 0) - Number(leftScore || 0);
});

const result = {
  generatedAt: new Date().toISOString(),
  methodology: "Explicit aggregate demand (30-day searches, saved alerts, watchlist matches), measured coverage gaps, retailer fit, and evidence quality. Missing inputs score zero.",
  ranked,
};
await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ ranked: ranked.length })}\n`);
