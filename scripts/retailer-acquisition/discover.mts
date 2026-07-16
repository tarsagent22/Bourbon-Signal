import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { buildProspectDedupeKeys, normalizeRetailerProspect } from "../../src/lib/retailer-acquisition.ts";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

const inputPath = option("--input");
const outputPath = option("--output");
const sourceName = option("--source") || "local_discovery_artifact";
if (!inputPath || !outputPath) throw new Error("Usage: npm run acquisition:discover -- --input <candidates.json> --output <prospects.json> [--source <label>]");

const document = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, unknown> | unknown[];
const documentRecord = Array.isArray(document) ? {} : document;
const candidates = Array.isArray(document)
  ? document
  : Array.isArray(document.retailers)
    ? document.retailers
    : Array.isArray(document.stores)
      ? document.stores
      : [];
const defaultState = typeof documentRecord.state === "string" ? documentRecord.state : "";
const seenIdentity = new Set<string>();
const seenLocation = new Set<string>();
const prospects: Array<Record<string, unknown>> = [];
const rejected: Array<{ index: number; reason: string }> = [];

for (const [index, candidate] of candidates.entries()) {
  if (!candidate || typeof candidate !== "object") {
    rejected.push({ index, reason: "Candidate is not an object." });
    continue;
  }
  const row = candidate as Record<string, unknown>;
  const normalized = normalizeRetailerProspect({
    name: row.name || row.storeName,
    address: row.address || row.storeAddress,
    city: row.city,
    state: row.state || defaultState,
    postalCode: row.postalCode || row.zip,
    website: row.website || row.url,
    listedPhone: row.listedPhone || row.phone,
  });
  if (!normalized.ok || !normalized.value) {
    rejected.push({ index, reason: normalized.error || "Candidate could not be normalized." });
    continue;
  }
  const dedupe = buildProspectDedupeKeys(normalized.value);
  if (seenIdentity.has(dedupe.identityKey) || Boolean(dedupe.locationKey && seenLocation.has(dedupe.locationKey))) continue;
  seenIdentity.add(dedupe.identityKey);
  if (dedupe.locationKey) seenLocation.add(dedupe.locationKey);
  prospects.push({
    prospectState: "discovered",
    ...normalized.value,
    dedupe,
    discovery: {
      source: sourceName,
      sourceUrl: typeof row.sourceUrl === "string" ? row.sourceUrl : "",
      platform: typeof row.platform === "string" ? row.platform : "",
      observedStatus: typeof row.status === "string" ? row.status : "",
    },
  });
}

const result = {
  generatedAt: new Date().toISOString(),
  source: sourceName,
  summary: { candidates: candidates.length, normalized: prospects.length, rejected: rejected.length, duplicates: candidates.length - prospects.length - rejected.length },
  prospects,
  rejected,
};
await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify(result.summary)}\n`);
