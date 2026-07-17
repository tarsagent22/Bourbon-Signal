#!/usr/bin/env node
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_OUTPUT = path.join(SCRIPT_DIR, "reports", "release-radar-scout-latest.json");

function argument(name) {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length) || "";
}

function safeToken(value, fallback = "") {
  if (typeof value !== "string") return fallback;
  const token = value.trim();
  return token.length <= 200 ? token : fallback;
}

function safeMarkets(value) {
  if (!Array.isArray(value)) return [];
  return Array.from(new Set(value
    .filter((market) => typeof market === "string")
    .map((market) => market.trim().toUpperCase())
    .filter((market) => /^(?:[A-Z]{2}|US|MD-MONTGOMERY)$/.test(market))));
}

function safeSourceUrl(value) {
  if (typeof value !== "string" || value.length > 1_000) return "";
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.toString() : "";
  } catch {
    return "";
  }
}

function safeSlug(value) {
  const slug = safeToken(value).toLowerCase();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 100 ? slug : "";
}

function safeBottleRelations(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const canonicalId = safeSlug(item.canonicalId);
    const canonicalName = safeToken(item.canonicalName);
    const relationship = ["featured", "included", "related"].includes(item.relationship) ? item.relationship : "related";
    return canonicalId && canonicalName ? [{ canonicalId, canonicalName, relationship }] : [];
  }).slice(0, 20);
}

function safeRelationships(value) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw) => {
    const item = raw && typeof raw === "object" ? raw : {};
    const targetSlug = safeSlug(item.targetSlug);
    const relationship = item.relationship === "same_series" ? "same_series" : "related";
    return targetSlug ? [{ targetSlug, relationship }] : [];
  }).slice(0, 20);
}

function normalizeCandidate(raw, index) {
  const item = raw && typeof raw === "object" ? raw : {};
  const title = safeToken(item.title);
  const sourceUrl = safeSourceUrl(item.sourceUrl);
  const sourceType = ["official", "state", "verified", "unverified"].includes(item.sourceType) ? item.sourceType : "verified";
  const datePrecision = item.datePrecision === "exact" ? "exact" : "window";
  const kind = ["release", "lottery", "event", "bottle"].includes(item.kind) ? item.kind : "release";
  const startDate = /^\d{4}-\d{2}-\d{2}$/.test(item.startDate || "") ? item.startDate : null;
  const canonicalBottleRelations = safeBottleRelations(item.canonicalBottleRelations);
  const relationships = safeRelationships(item.relationships);
  const issues = [];
  if (!title) issues.push("missing_title");
  if (!sourceUrl) issues.push("missing_https_source");
  if (sourceType === "unverified") issues.push("unverified_lead");
  if (datePrecision === "exact" && !startDate) issues.push("exact_date_missing");
  if (kind === "bottle" && canonicalBottleRelations.length === 0) issues.push("canonical_bottle_missing");
  return {
    candidateId: `candidate-${String(index + 1).padStart(3, "0")}`,
    title,
    kind,
    sourceUrl,
    verificationStatus: sourceType === "verified" ? "verified" : sourceType === "unverified" ? "unverified" : "official",
    sourceType,
    datePrecision,
    startDate,
    markets: safeMarkets(item.markets),
    canonicalBottleRelations,
    relationships,
    followEligibility: {
      release: kind !== "bottle",
      bottle: canonicalBottleRelations.length > 0,
    },
    availabilitySemantics: "announcement_only",
    alertGradeEligible: false,
    review: {
      required: true,
      readyForDraft: issues.length === 0,
      issues,
      checks: ["source", "date_precision", "canonical_bottle", "market", "copy", "non_inventory_semantics"],
    },
  };
}

function draftBody(payload) {
  const ready = payload.candidates.filter((candidate) => candidate.review.readyForDraft);
  const lines = [
    "# Draft Release Radar scout",
    "",
    "> Human review required. This draft does not change public data or create alert-grade availability.",
    "",
    `Candidates ready for review: ${ready.length}`,
    "",
  ];
  for (const candidate of ready) {
    lines.push(`- [ ] ${candidate.title} — ${candidate.verificationStatus}, ${candidate.datePrecision}, ${candidate.markets.join(", ") || "market pending"}`);
  }
  lines.push("", "## Review gates", "", "- [ ] Confirm the primary source", "- [ ] Confirm date precision", "- [ ] Resolve canonical bottle relations", "- [ ] Confirm market handoff", "- [ ] Keep announcement-only semantics", "- [ ] Run tests and build", "");
  return lines.join("\n");
}

async function main() {
  const inputPath = argument("input");
  const leadLedgerPath = argument("lead-ledger");
  if (!inputPath && !leadLedgerPath) throw new Error("Provide a local structured input with --input=<path> or --lead-ledger=<path>.");
  const outputPath = path.resolve(argument("output") || DEFAULT_OUTPUT);
  const draftPath = argument("draft-pr") ? path.resolve(argument("draft-pr")) : "";
  const input = inputPath
    ? JSON.parse(await readFile(path.resolve(inputPath), "utf8"))
    : {
      candidates: (JSON.parse(await readFile(path.resolve(leadLedgerPath), "utf8")).leads || [])
        .filter((lead) => lead?.status !== "dismissed")
        .map((lead) => ({
          title: lead.title,
          sourceUrl: lead.url,
          sourceType: "unverified",
          kind: "release",
          datePrecision: "window",
          markets: [],
        })),
    };
  const candidates = Array.isArray(input.candidates) ? input.candidates.map(normalizeCandidate) : [];
  const payload = {
    schemaVersion: 1,
    mode: "draft-only",
    liveCron: false,
    canPublish: false,
    canCreatePullRequest: false,
    leadLedgerInput: Boolean(leadLedgerPath),
    generatedAt: new Date().toISOString(),
    candidates,
    summary: {
      total: candidates.length,
      readyForDraft: candidates.filter((candidate) => candidate.review.readyForDraft).length,
      needsReview: candidates.filter((candidate) => !candidate.review.readyForDraft).length,
    },
  };

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(payload, null, 2)}\n`);
  if (draftPath) {
    await mkdir(path.dirname(draftPath), { recursive: true });
    await writeFile(draftPath, draftBody(payload));
  }
  if (process.argv.includes("--print")) process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : "Scout failed"}\n`);
  process.exitCode = 1;
});
