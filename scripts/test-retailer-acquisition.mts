import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  RETAILER_PROSPECT_STATES,
  aggregateProspectOutcomes,
  assertProspectTransition,
  buildApprovalPacket,
  buildProspectDedupeKeys,
  canRecordOutreach,
  draftProspectOutreach,
  isOfficialContactEvidence,
  normalizeRetailerProspect,
  scoreRetailerProspect,
  type RetailerProspectScore,
} from "../src/lib/retailer-acquisition.ts";

assert.deepEqual(RETAILER_PROSPECT_STATES, [
  "discovered",
  "qualified",
  "contact_verified",
  "draft_ready",
  "awaiting_approval",
  "approved",
  "contacted",
  "follow_up_due",
  "interested",
  "onboarding",
  "verified",
  "first_signal_live",
  "paused",
  "declined",
  "invalid",
]);

const normalized = normalizeRetailerProspect({
  name: "  O’Darby’s Liquor Barn — Taylors ",
  address: "  123 Main Street, Suite 4 ",
  city: "TAYLORS",
  state: "south carolina",
  postalCode: "29687-1234",
  website: "https://WWW.Example.com/locations/taylors/?utm_source=test",
  listedPhone: "+1 (864) 555-0123",
});
assert.equal(normalized.ok, true);
assert.equal(normalized.value?.name, "O’Darby’s Liquor Barn — Taylors");
assert.equal(normalized.value?.city, "Taylors");
assert.equal(normalized.value?.state, "SC");
assert.equal(normalized.value?.postalCode, "29687-1234");
assert.equal(normalized.value?.website, "https://example.com/locations/taylors");
assert.equal(normalized.value?.listedPhone, "+18645550123");

const invalid = normalizeRetailerProspect({ name: "Shop", state: "not-a-state" });
assert.equal(invalid.ok, false);
assert.match(invalid.error || "", /state/i);

const keys = buildProspectDedupeKeys(normalized.value!);
assert.match(keys.identityKey, /^o-darby-s-liquor-barn-taylors\|/);
assert.equal(keys.domainKey, "example.com");
assert.ok(keys.locationKey.includes("123-main-st-ste-4"));
const addresslessA = normalizeRetailerProspect({ name: "First Spirits", city: "Taylors", state: "SC" }).value!;
const addresslessB = normalizeRetailerProspect({ name: "Second Spirits", city: "Taylors", state: "SC" }).value!;
assert.equal(buildProspectDedupeKeys(addresslessA).locationKey, "");
assert.notEqual(buildProspectDedupeKeys(addresslessA).identityKey, buildProspectDedupeKeys(addresslessB).identityKey);

const officialEvidence = {
  kind: "official_website_email" as const,
  sourceUrl: "https://example.com/contact",
  contactValue: "manager@example.com",
  capturedAt: "2026-07-16T02:00:00.000Z",
};
assert.equal(isOfficialContactEvidence(officialEvidence, "example.com"), true);
assert.equal(isOfficialContactEvidence({ ...officialEvidence, contactValue: "manager@gmail.com" }, "example.com"), false);
assert.equal(isOfficialContactEvidence({ ...officialEvidence, sourceUrl: "https://directory.invalid/example" }, "example.com"), false);

const score = scoreRetailerProspect({
  demand: { searches30d: 24, savedAlerts: 8, watchlistMatches: 5 },
  coverage: { marketStores: 30, coveredStores: 9, citySignals30d: 2 },
  fit: { independent: true, bourbonSpecialist: true, liveInventoryGap: true },
  evidence: { officialContact: true, officialWebsite: true, physicalLocation: true },
});
assert.equal(score.scoreOutOf, 100);
assert.ok(score.total >= 80 && score.total <= 100);
assert.ok(score.components.demand > 0);
assert.ok(score.components.coverageGap > 0);
assert.deepEqual(score.inputs.demand, { searches30d: 24, savedAlerts: 8, watchlistMatches: 5 });
assert.equal("estimatedReach" in score, false);
assert.equal("audience" in score, false);
const missingCoverageScore = scoreRetailerProspect({
  demand: { searches30d: 0, savedAlerts: 0, watchlistMatches: 0 },
  coverage: { marketStores: 0, coveredStores: 0, citySignals30d: 0 },
  fit: { independent: false, bourbonSpecialist: false, liveInventoryGap: false },
  evidence: { officialContact: false, officialWebsite: false, physicalLocation: false },
});
assert.equal(missingCoverageScore.total, 0);

assert.doesNotThrow(() => assertProspectTransition("discovered", "qualified"));
assert.doesNotThrow(() => assertProspectTransition("awaiting_approval", "approved", { hasOfficialContact: true, hasApprovedVersion: true }));
assert.throws(() => assertProspectTransition("discovered", "contacted"), /transition/i);
assert.throws(() => assertProspectTransition("contact_verified", "draft_ready", { hasOfficialContact: false }), /official contact/i);
assert.throws(() => assertProspectTransition("awaiting_approval", "approved", { hasOfficialContact: true, hasApprovedVersion: false }), /approved version/i);
assert.throws(
  () => assertProspectTransition("paused", "awaiting_approval", { hasOfficialContact: true, hasDraftVersion: false }),
  /exact draft/i,
);
assert.throws(
  () => assertProspectTransition("paused", "contacted", { hasOfficialContact: true, hasApprovedVersion: false, initialContactCount: 1 }),
  /approved version/i,
);
assert.throws(
  () => assertProspectTransition("paused", "contacted", { hasOfficialContact: false, hasApprovedVersion: true, initialContactCount: 1 }),
  /official contact/i,
);
assert.throws(
  () => assertProspectTransition("paused", "verified", { hasOfficialContact: true, hasApprovedVersion: true, initialContactCount: 0 }),
  /recorded initial contact/i,
);
assert.throws(
  () => assertProspectTransition("paused", "verified", { hasOfficialContact: true, hasApprovedVersion: false, initialContactCount: 1 }),
  /approved version/i,
);
assert.doesNotThrow(() => assertProspectTransition("paused", "verified", {
  hasOfficialContact: true,
  hasApprovedVersion: true,
  initialContactCount: 1,
}));
assert.doesNotThrow(() => assertProspectTransition("follow_up_due", "draft_ready", {
  hasOfficialContact: true,
  hasDraftVersion: true,
  initialContactCount: 1,
  followUpCount: 0,
}));
assert.throws(
  () => assertProspectTransition("follow_up_due", "draft_ready", {
    hasOfficialContact: true,
    hasDraftVersion: true,
    initialContactCount: 0,
    followUpCount: 0,
  }),
  /recorded initial contact/i,
);

const draft = draftProspectOutreach({
  prospectId: "prospect-1",
  version: 2,
  retailerName: "Example Spirits",
  city: "Taylors",
  state: "SC",
  contactChannel: "email",
  outreachKind: "initial",
});
assert.equal(draft.status, "draft");
assert.equal(draft.version, 2);
assert.equal(draft.outreachKind, "initial");
assert.match(draft.body, /Example Spirits/);
assert.doesNotMatch(draft.body, /\b\d+[,.]?\d*\s*(members|hunters|users|reach|impressions)\b/i);
assert.doesNotMatch(draft.body, /guarantee|guaranteed/i);

const followUpDraft = draftProspectOutreach({
  prospectId: "prospect-1",
  version: 3,
  retailerName: "Example Spirits",
  city: "Taylors",
  state: "SC",
  contactChannel: "email",
  outreachKind: "follow_up",
});
assert.equal(followUpDraft.outreachKind, "follow_up");
assert.match(followUpDraft.subject, /following up/i);
assert.match(followUpDraft.body, /follow up/i);
assert.notEqual(followUpDraft.body, draft.body);

const packet = buildApprovalPacket({
  prospect: { id: "prospect-1", ...normalized.value! },
  score,
  contactEvidence: [{ id: "evidence-1", ...officialEvidence, verifiedAt: "2026-07-16T02:05:00.000Z" }],
  draft,
});
assert.equal(packet.prospectId, "prospect-1");
assert.equal(packet.messageVersion, 2);
assert.equal(packet.officialContactEvidence.length, 1);
assert.match(packet.guardrails.join(" "), /approval/i);
assert.throws(() => buildApprovalPacket({ ...packet, prospect: { id: "prospect-1", ...normalized.value! }, score, contactEvidence: [], draft }), /official contact/i);

assert.deepEqual(canRecordOutreach({ prospectState: "approved", messageStatus: "approved", approvedMessageKind: "initial", approvedMessageChannel: "email", outreachChannel: "email", kind: "initial", initialContactCount: 0, followUpCount: 0 }), { allowed: true });
assert.deepEqual(canRecordOutreach({ prospectState: "approved", messageStatus: "approved", approvedMessageKind: "follow_up", approvedMessageChannel: "email", outreachChannel: "email", kind: "follow_up", initialContactCount: 1, followUpCount: 0 }), { allowed: true });
assert.match(canRecordOutreach({ prospectState: "approved", messageStatus: "draft", approvedMessageKind: "initial", approvedMessageChannel: "email", outreachChannel: "email", kind: "initial", initialContactCount: 0, followUpCount: 0 }).reason || "", /approved message version/i);
assert.match(canRecordOutreach({ prospectState: "approved", messageStatus: "approved", approvedMessageKind: "initial", approvedMessageChannel: "email", outreachChannel: "email", kind: "follow_up", initialContactCount: 1, followUpCount: 0 }).reason || "", /fresh.*follow-up.*version/i);
assert.match(canRecordOutreach({ prospectState: "approved", messageStatus: "approved", approvedMessageKind: "follow_up", approvedMessageChannel: "email", outreachChannel: "email", kind: "follow_up", initialContactCount: 1, followUpCount: 1 }).reason || "", /one follow-up/i);
assert.match(canRecordOutreach({ prospectState: "follow_up_due", messageStatus: "approved", approvedMessageKind: "follow_up", approvedMessageChannel: "email", outreachChannel: "email", kind: "follow_up", initialContactCount: 1, followUpCount: 0 }).reason || "", /approved follow-up/i);

const outcomes = aggregateProspectOutcomes([
  { state: "contacted", outcome: "no_response" },
  { state: "interested", outcome: "interested" },
  { state: "verified", outcome: "converted" },
]);
assert.deepEqual(outcomes.outcomes, { no_response: 1, interested: 1, converted: 1 });
assert.equal(outcomes.total, 3);
assert.equal(JSON.stringify(outcomes).includes("identity"), false);
assert.equal(JSON.stringify(outcomes).includes("reach"), false);

const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");
for (const file of [
  "src/lib/retailer-acquisition.ts",
  "src/lib/retailer-prospect-repository.ts",
  "src/lib/retailer-prospect-schema.sql",
  "src/app/admin/retailer-acquisition/page.tsx",
  "scripts/retailer-acquisition/discover.mts",
  "scripts/retailer-acquisition/rank.mts",
  "scripts/retailer-acquisition/draft.mts",
  "scripts/retailer-acquisition/import.mts",
  "scripts/migrate-retailer-acquisition.mjs",
  "docs/retailer-acquisition.md",
]) {
  assert.equal(existsSync(path.join(root, file)), true, `Missing ${file}`);
}

const schema = read("src/lib/retailer-prospect-schema.sql");
for (const state of RETAILER_PROSPECT_STATES) assert.match(schema, new RegExp(`'${state}'`));
assert.match(schema, /retailer_prospects/);
assert.match(schema, /retailer_prospect_contact_evidence/);
assert.match(schema, /retailer_prospect_message_versions/);
assert.match(schema, /retailer_prospect_outreach/);
assert.match(schema, /status\s+IN\s*\('draft',\s*'approved',\s*'superseded'\)/i);
assert.match(schema, /kind\s+IN\s*\('initial',\s*'follow_up'\)/i);
assert.match(schema, /UNIQUE\s*\(prospect_id,\s*kind\)/i);

const repository = read("src/lib/retailer-prospect-repository.ts");
assert.match(repository, /message_versions[\s\S]*status = 'approved'/);
assert.match(schema, /outreach_kind = 'follow_up'[\s\S]*follow_up_count <> 0/);
assert.match(repository, /record_retailer_prospect_outreach/);
assert.doesNotMatch(repository, /\bCREATE\s+(?:TABLE|INDEX|OR\s+REPLACE\s+FUNCTION)/i);
assert.match(schema, /BEGIN/);
assert.match(schema, /FOR UPDATE/);
assert.doesNotMatch(repository, /resend|sendgrid|postmark|nodemailer/i);

const admin = read("src/app/admin/retailer-acquisition/page.tsx");
assert.match(admin, /isRetailerAdminEmail/);
assert.match(admin, /Approval packet/);
assert.match(admin, /Approve exact draft/);
assert.match(admin, /Save as new version/);
assert.match(admin, /Record manual outreach/);
assert.match(admin, /Aggregate outcomes/);
assert.doesNotMatch(admin, /notify|sendEmail|resend/i);

for (const script of ["discover.mts", "rank.mts", "draft.mts"]) {
  const source = read(`scripts/retailer-acquisition/${script}`);
  assert.match(source, /--output/);
  assert.doesNotMatch(source, /fetch\(|resend|sendgrid|nodemailer|cron/i);
}

const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
assert.match(packageJson.scripts["test:retailer-acquisition"], /test-retailer-acquisition/);
assert.match(packageJson.scripts["acquisition:discover"], /discover/);
assert.match(packageJson.scripts["acquisition:rank"], /rank/);
assert.match(packageJson.scripts["acquisition:draft"], /draft/);
assert.match(packageJson.scripts["acquisition:import"], /import/);
assert.match(packageJson.scripts["migrate:retailer-acquisition"], /migrate-retailer-acquisition/);
assert.doesNotMatch(packageJson.scripts["migrate:retailer-acquisition"], /--apply/);
assert.match(packageJson.scripts["migrate:retailer-acquisition:apply"], /migrate-retailer-acquisition.*--apply/);

const cliDirectory = mkdtempSync(path.join(tmpdir(), "bourbon-signal-acquisition-test-"));
try {
  const candidateFile = path.join(cliDirectory, "candidates.json");
  const discoveredFile = path.join(cliDirectory, "discovered.json");
  const rankedFile = path.join(cliDirectory, "ranked.json");
  const importAuditFile = path.join(cliDirectory, "import-audit.json");
  const verifiedFile = path.join(cliDirectory, "verified.json");
  const draftFile = path.join(cliDirectory, "drafts.json");
  writeFileSync(candidateFile, JSON.stringify({ state: "SC", retailers: [
    { name: "First Spirits", city: "Taylors" },
    { name: "Second Spirits", city: "Taylors" },
  ] }));
  const runCli = (script: string, args: string[]) => spawnSync(process.execPath, ["--no-warnings", "--experimental-strip-types", script, ...args], { cwd: root, encoding: "utf8" });
  const discoveryRun = runCli("scripts/retailer-acquisition/discover.mts", ["--input", candidateFile, "--output", discoveredFile]);
  assert.equal(discoveryRun.status, 0, discoveryRun.stderr);
  const discoveredArtifact = JSON.parse(readFileSync(discoveredFile, "utf8")) as { prospects: Array<Record<string, unknown>> };
  assert.equal(discoveredArtifact.prospects.length, 2);
  const rankRun = runCli("scripts/retailer-acquisition/rank.mts", ["--input", discoveredFile, "--output", rankedFile]);
  assert.equal(rankRun.status, 0, rankRun.stderr);
  const rankedArtifact = JSON.parse(readFileSync(rankedFile, "utf8")) as { ranked: Array<{ score: RetailerProspectScore }> };
  assert.equal(rankedArtifact.ranked[0]?.score.total, 0);
  const importRun = runCli("scripts/retailer-acquisition/import.mts", [
    "--input", rankedFile,
    "--audit", importAuditFile,
    "--owner", "chandlertodd22@gmail.com",
  ]);
  assert.equal(importRun.status, 0, importRun.stderr);
  const importAudit = JSON.parse(readFileSync(importAuditFile, "utf8")) as { ok: boolean; mode: string; summary: { validated: number; wouldUpsert: number } };
  assert.equal(importAudit.ok, true);
  assert.equal(importAudit.mode, "dry-run");
  assert.deepEqual(importAudit.summary, { validated: 2, wouldUpsert: 2, inserted: 0, deduplicated: 0 });
  writeFileSync(verifiedFile, JSON.stringify({ prospects: [{
    ...discoveredArtifact.prospects[0],
    id: "prospect-cli-1",
    prospectState: "contact_verified",
    fit: { independent: true },
    officialContact: { verified: true, channel: "email", evidenceId: "evidence-cli-1" },
  }, {
    ...discoveredArtifact.prospects[1],
    id: "prospect-cli-chain",
    prospectState: "contact_verified",
    fit: { independent: false },
    officialContact: { verified: true, channel: "email", evidenceId: "evidence-cli-chain" },
  }] }));
  const draftRun = runCli("scripts/retailer-acquisition/draft.mts", ["--input", verifiedFile, "--output", draftFile]);
  assert.equal(draftRun.status, 0, draftRun.stderr);
  const draftArtifact = JSON.parse(readFileSync(draftFile, "utf8")) as { drafts: Array<{ status: string; approvalRequired: boolean }>; skipped: Array<{ reason: string }> };
  assert.equal(draftArtifact.drafts.length, 1);
  assert.equal(draftArtifact.drafts[0]?.status, "draft");
  assert.equal(draftArtifact.drafts[0]?.approvalRequired, true);
  assert.match(draftArtifact.skipped[0]?.reason || "", /small independent/i, "large or unverified-chain prospects must stay out of outreach drafts");
} finally {
  rmSync(cliDirectory, { recursive: true, force: true });
}

// Existing retailer application and direct-publishing behavior stays independently intact.
const existingRepository = read("src/lib/retailer-repository.ts");
const existingSchema = read("src/lib/retailer-schema.sql");
assert.match(existingSchema, /status TEXT NOT NULL DEFAULT 'pending' CHECK \(status IN \('pending', 'verified', 'rejected'\)\)/);
assert.match(existingRepository, /'reviewed', NOW\(\), 'retailer_direct'/);

console.log("Retailer acquisition contracts passed.");
