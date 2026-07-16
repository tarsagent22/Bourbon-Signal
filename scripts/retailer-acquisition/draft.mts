import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { draftProspectOutreach, type ProspectContactChannel } from "../../src/lib/retailer-acquisition.ts";

function option(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] || "" : "";
}

function record(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

const inputPath = option("--input");
const outputPath = option("--output");
if (!inputPath || !outputPath) throw new Error("Usage: npm run acquisition:draft -- --input <contact-verified.json> --output <drafts.json>");

const input = JSON.parse(await readFile(inputPath, "utf8")) as Record<string, unknown>;
const candidates = Array.isArray(input.ranked) ? input.ranked : Array.isArray(input.prospects) ? input.prospects : [];
const skipped: Array<{ index: number; reason: string }> = [];
const drafts: Array<Record<string, unknown>> = [];

for (const [index, value] of candidates.entries()) {
  const prospect = record(value);
  const contact = record(prospect.officialContact);
  const channel = String(contact.channel || "") as ProspectContactChannel;
  const verified = prospect.prospectState === "contact_verified" && contact.verified === true;
  if (!verified || !["email", "phone", "contact_form"].includes(channel)) {
    skipped.push({ index, reason: "Verified official contact and contact_verified state are required." });
    continue;
  }
  const prospectId = String(prospect.id || record(prospect.dedupe).identityKey || "");
  if (!prospectId) {
    skipped.push({ index, reason: "Prospect identifier is required." });
    continue;
  }
  drafts.push({
    ...draftProspectOutreach({
      prospectId,
      version: Number(prospect.nextMessageVersion || 1),
      retailerName: String(prospect.name || ""),
      city: String(prospect.city || ""),
      state: String(prospect.state || ""),
      contactChannel: channel,
    }),
    approvalRequired: true,
    officialContactEvidenceId: String(contact.evidenceId || ""),
  });
}

const result = {
  generatedAt: new Date().toISOString(),
  guardrail: "Draft artifacts only. Every exact version requires owner approval; this command cannot send or record outreach.",
  drafts,
  skipped,
};
await mkdir(path.dirname(path.resolve(outputPath)), { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ drafts: drafts.length, skipped: skipped.length })}\n`);
