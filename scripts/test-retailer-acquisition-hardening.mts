import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import {
  OFFICIAL_REGULATOR_AUTHORITIES,
  canRecordOutreach,
  isOfficialContactEvidence,
} from "../src/lib/retailer-acquisition.ts";
import { importRetailerProspectArtifact } from "../src/lib/retailer-prospect-import.ts";
import { RetailerProspectRepository, type RetailerProspectQuery } from "../src/lib/retailer-prospect-repository.ts";

const OWNER_EMAIL = "chandlertodd22@gmail.com";
const root = process.cwd();
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

const scAuthority = OFFICIAL_REGULATOR_AUTHORITIES.find((authority) => authority.id === "sc-dor-abl");
assert.ok(scAuthority);
const regulatorEvidence = {
  kind: "regulator_listing" as const,
  sourceUrl: "https://dor.sc.gov/tax/abl/licenses",
  contactValue: "+1 (864) 555-0123",
  capturedAt: "2026-07-16T12:00:00.000Z",
  regulatorAuthority: scAuthority,
};
assert.equal(isOfficialContactEvidence(regulatorEvidence, ""), true);
assert.equal(isOfficialContactEvidence({ ...regulatorEvidence, sourceUrl: "https://directory.example/retailers" }, ""), false);
assert.equal(isOfficialContactEvidence({ ...regulatorEvidence, regulatorAuthority: undefined }, ""), false);
assert.equal(isOfficialContactEvidence({
  ...regulatorEvidence,
  regulatorAuthority: { ...scAuthority, domain: "directory.example" },
}, ""), false);

const allowedOutreach = canRecordOutreach({
  prospectState: "approved",
  messageStatus: "approved",
  approvedMessageKind: "initial",
  approvedMessageChannel: "email",
  outreachChannel: "email",
  kind: "initial",
  initialContactCount: 0,
  followUpCount: 0,
});
assert.deepEqual(allowedOutreach, { allowed: true });
assert.match(canRecordOutreach({
  prospectState: "approved",
  messageStatus: "approved",
  approvedMessageKind: "initial",
  approvedMessageChannel: "email",
  outreachChannel: "phone",
  kind: "initial",
  initialContactCount: 0,
  followUpCount: 0,
}).reason || "", /channel.*approved message/i);

class MemoryProspectQuery implements RetailerProspectQuery {
  readonly rows = new Map<string, Record<string, unknown>>();
  readonly operatorOwned = {
    verifiedEvidence: [{ id: "evidence-1", verifiedAt: "2026-07-16T11:00:00.000Z" }],
    approvals: [{ id: "packet-1", messageVersionId: "message-1" }],
    messageVersions: [{ id: "message-1", version: 1, status: "approved" }],
    outreachLedger: [{ id: "outreach-1", messageVersionId: "message-1", kind: "initial" }],
  };
  calls = 0;

  async query(statement: string, parameters: unknown[] = []) {
    this.calls += 1;
    if (/to_regclass\('public\.retailer_prospects'\)/.test(statement)) {
      return [{
        prospects: "retailer_prospects",
        authorities: "retailer_regulator_authorities",
        evidence: "retailer_prospect_contact_evidence",
        messages: "retailer_prospect_message_versions",
        packets: "retailer_prospect_approval_packets",
        outreach: "retailer_prospect_outreach",
        migrations: "retailer_acquisition_migrations",
        approve_function: "approve_retailer_prospect_message",
        outreach_function: "record_retailer_prospect_outreach",
      }];
    }
    if (/WHERE identity_key = \$1/.test(statement)) {
      const identityKey = String(parameters[0] || "");
      const locationKey = String(parameters[1] || "");
      return [...this.rows.values()].filter((row) => row.identity_key === identityKey || Boolean(locationKey && row.location_key === locationKey)).slice(0, 1);
    }
    if (/retailer_prospect_discovery_refresh/.test(statement)) {
      const row = [...this.rows.values()].find((candidate) => candidate.id === parameters[0]);
      if (!row) return [];
      const locationKey = String(parameters[9] || "");
      row.name = String(parameters[1]);
      if (locationKey) {
        row.address = String(parameters[2]);
        row.city = String(parameters[3]);
        row.region = String(parameters[4]);
        row.postal_code = String(parameters[5]);
        row.location_key = locationKey;
      }
      if (parameters[6]) {
        row.website = String(parameters[6]);
        row.domain_key = String(parameters[10]);
      }
      if (parameters[7]) row.listed_phone = String(parameters[7]);
      row.discovery_source = String(parameters[11]);
      if (parameters[12]) row.source_url = String(parameters[12]);
      row.score = Number(parameters[13]);
      row.score_components = JSON.parse(String(parameters[14]));
      row.score_inputs = JSON.parse(String(parameters[15]));
      row.score_rationale = JSON.parse(String(parameters[16]));
      return [row];
    }
    if (/INSERT INTO retailer_prospects/.test(statement)) {
      const timestamp = "2026-07-16T12:00:00.000Z";
      const row = {
        id: String(parameters[0]),
        state: "discovered",
        name: String(parameters[1]),
        address: String(parameters[2]),
        city: String(parameters[3]),
        region: String(parameters[4]),
        postal_code: String(parameters[5]),
        website: String(parameters[6]),
        listed_phone: String(parameters[7]),
        identity_key: String(parameters[8]),
        location_key: String(parameters[9]),
        domain_key: String(parameters[10]),
        discovery_source: String(parameters[11]),
        source_url: String(parameters[12]),
        score: Number(parameters[13]),
        score_components: JSON.parse(String(parameters[14])),
        score_inputs: JSON.parse(String(parameters[15])),
        score_rationale: JSON.parse(String(parameters[16])),
        outcome: null,
        initial_contact_count: 0,
        follow_up_count: 0,
        created_at: timestamp,
        updated_at: timestamp,
      };
      this.rows.set(String(row.identity_key), row);
      return [row];
    }
    if (/SELECT \* FROM retailer_prospects ORDER BY/.test(statement)) return [...this.rows.values()];
    throw new Error(`Unexpected repository SQL in contract test: ${statement}`);
  }
}

const rankedArtifact = {
  generatedAt: "2026-07-16T12:00:00.000Z",
  ranked: [{
    prospectState: "discovered",
    name: "First Spirits",
    city: "Taylors",
    state: "SC",
    discovery: { source: "contract-test", sourceUrl: "https://example.com/first" },
    score: {
      total: 999,
      inputs: {
        demand: { searches30d: 0, savedAlerts: 0, watchlistMatches: 0 },
        coverage: { marketStores: 0, coveredStores: 0, citySignals30d: 0 },
        fit: { independent: false, bourbonSpecialist: false, liveInventoryGap: false },
        evidence: { officialContact: false, officialWebsite: false, physicalLocation: false },
      },
    },
  }],
};
const discoveryAudit = await importRetailerProspectArtifact({
  artifact: {
    source: "contract-test-discovery",
    prospects: [{
      prospectState: "discovered",
      name: "Discovery Spirits",
      city: "Greenville",
      state: "SC",
      discovery: { source: "contract-test-discovery" },
    }],
  },
  actorEmail: OWNER_EMAIL,
});
assert.equal(discoveryAudit.artifactKind, "discovery");
assert.equal(discoveryAudit.mode, "dry-run");
assert.equal(discoveryAudit.records[0]?.score, 0);

const memoryQuery = new MemoryProspectQuery();
const memoryRepository = new RetailerProspectRepository(memoryQuery);
const dryRunAudit = await importRetailerProspectArtifact({
  artifact: rankedArtifact,
  actorEmail: OWNER_EMAIL,
  repository: memoryRepository,
});
assert.equal(dryRunAudit.mode, "dry-run");
assert.equal(dryRunAudit.summary.validated, 1);
assert.equal(dryRunAudit.summary.wouldUpsert, 1);
assert.equal(memoryQuery.calls, 0);
assert.equal(dryRunAudit.records[0]?.score, 0, "ranking scores must be recomputed from validated inputs");

await assert.rejects(() => importRetailerProspectArtifact({
  artifact: rankedArtifact,
  actorEmail: "operator@example.com",
  repository: memoryRepository,
  apply: true,
}), /owner/i);

const firstImport = await importRetailerProspectArtifact({
  artifact: rankedArtifact,
  actorEmail: OWNER_EMAIL,
  repository: memoryRepository,
  apply: true,
});
assert.equal(firstImport.summary.inserted, 1);
assert.equal((await memoryRepository.listProspects()).length, 1, "imported prospects must satisfy the admin list contract");
const repeatedImport = await importRetailerProspectArtifact({
  artifact: rankedArtifact,
  actorEmail: OWNER_EMAIL,
  repository: memoryRepository,
  apply: true,
});
assert.equal(repeatedImport.summary.inserted, 0);
assert.equal(repeatedImport.summary.deduplicated, 1);
assert.equal((await memoryRepository.listProspects()).length, 1);

const refreshQuery = new MemoryProspectQuery();
const refreshRepository = new RetailerProspectRepository(refreshQuery);
const refreshableArtifact = {
  source: "first-discovery",
  ranked: [{
    prospectState: "discovered",
    name: "Refresh Spirits",
    address: "100 Main Street",
    city: "Greenville",
    state: "SC",
    postalCode: "29601",
    website: "https://old-refresh.example",
    listedPhone: "+1 (864) 555-0100",
    discovery: { source: "first-discovery", sourceUrl: "https://source.example/old" },
    score: {
      inputs: {
        demand: { searches30d: 1, savedAlerts: 0, watchlistMatches: 0 },
        coverage: { marketStores: 2, coveredStores: 1, citySignals30d: 1 },
        fit: { independent: false, bourbonSpecialist: false, liveInventoryGap: false },
        evidence: { officialContact: false, officialWebsite: true, physicalLocation: true },
      },
    },
  }],
};
await importRetailerProspectArtifact({
  artifact: refreshableArtifact,
  actorEmail: OWNER_EMAIL,
  repository: refreshRepository,
  apply: true,
});
const operatorTimestamp = "2026-07-16T14:30:00.000Z";
const refreshRow = [...refreshQuery.rows.values()][0];
assert.ok(refreshRow);
Object.assign(refreshRow, {
  state: "onboarding",
  outcome: "interested",
  initial_contact_count: 1,
  follow_up_count: 1,
  created_at: "2026-07-15T10:00:00.000Z",
  updated_at: operatorTimestamp,
});
const protectedLifecycle = {
  state: refreshRow.state,
  outcome: refreshRow.outcome,
  initialContactCount: refreshRow.initial_contact_count,
  followUpCount: refreshRow.follow_up_count,
  createdAt: refreshRow.created_at,
  updatedAt: refreshRow.updated_at,
};
const protectedOperatorArtifacts = structuredClone(refreshQuery.operatorOwned);

const refreshedImport = await importRetailerProspectArtifact({
  artifact: {
    source: "fresh-ranking",
    ranked: [{
      ...refreshableArtifact.ranked[0],
      address: "100 Main St",
      website: "https://new-refresh.example/contact",
      listedPhone: "+1 (864) 555-0199",
      discovery: { source: "fresh-ranking", sourceUrl: "https://source.example/new" },
      score: {
        inputs: {
          demand: { searches30d: 30, savedAlerts: 10, watchlistMatches: 10 },
          coverage: { marketStores: 10, coveredStores: 1, citySignals30d: 0 },
          fit: { independent: true, bourbonSpecialist: true, liveInventoryGap: true },
          evidence: { officialContact: true, officialWebsite: true, physicalLocation: true },
        },
      },
    }],
  },
  actorEmail: OWNER_EMAIL,
  repository: refreshRepository,
  apply: true,
});
assert.equal(refreshedImport.summary.inserted, 0);
assert.equal(refreshedImport.summary.deduplicated, 1);
assert.equal(refreshQuery.rows.size, 1);
const refreshed = (await refreshRepository.listProspects())[0];
assert.ok(refreshed);
assert.equal(refreshed.address, "100 Main St", "safe normalized location data should refresh");
assert.equal(refreshed.website, "https://new-refresh.example/contact");
assert.equal(refreshed.listedPhone, "+18645550199");
assert.equal(refreshed.discoverySource, "fresh-ranking");
assert.equal(refreshed.sourceUrl, "https://source.example/new");
assert.equal(refreshed.score.inputs.demand.searches30d, 30);
assert.ok(refreshed.score.total > 90);
assert.deepEqual({
  state: refreshed.prospectState,
  outcome: refreshed.outcome,
  initialContactCount: refreshed.initialContactCount,
  followUpCount: refreshed.followUpCount,
  createdAt: refreshed.createdAt,
  updatedAt: refreshed.updatedAt,
}, protectedLifecycle);
assert.deepEqual(refreshQuery.operatorOwned, protectedOperatorArtifacts);

class FollowUpLifecycleQuery implements RetailerProspectQuery {
  state = "follow_up_due";
  readonly initialMessageId = "initial-message";
  followUpMessageId = "";
  recordedMessageId = "";

  private prospectRow() {
    return {
      id: "follow-up-prospect",
      state: this.state,
      name: "Follow Up Spirits",
      address: "10 Main St",
      city: "Greenville",
      region: "SC",
      postal_code: "29601",
      website: "https://follow-up.example",
      listed_phone: "+18645550123",
      identity_key: "follow-up-spirits|10-main-st-greenville-sc-29601",
      location_key: "10-main-st-greenville-sc-29601",
      domain_key: "follow-up.example",
      discovery_source: "contract-test",
      source_url: "https://source.example/follow-up",
      score: 80,
      score_components: {},
      score_inputs: {},
      score_rationale: [],
      outcome: null,
      initial_contact_count: 1,
      follow_up_count: 0,
      created_at: "2026-07-15T12:00:00.000Z",
      updated_at: "2026-07-16T12:00:00.000Z",
    };
  }

  async query(statement: string, parameters: unknown[] = []) {
    if (/to_regclass\('public\.retailer_prospects'\)/.test(statement)) {
      return [{
        prospects: "retailer_prospects",
        authorities: "retailer_regulator_authorities",
        evidence: "retailer_prospect_contact_evidence",
        messages: "retailer_prospect_message_versions",
        packets: "retailer_prospect_approval_packets",
        outreach: "retailer_prospect_outreach",
        migrations: "retailer_acquisition_migrations",
        approve_function: "approve_retailer_prospect_message",
        outreach_function: "record_retailer_prospect_outreach",
      }];
    }
    if (/SELECT \* FROM retailer_prospects WHERE id = \$1/.test(statement)) return [this.prospectRow()];
    if (/^\s*SELECT 1 FROM retailer_prospect_contact_evidence/.test(statement)) return [{ "?column?": 1 }];
    if (/INSERT INTO retailer_prospect_message_versions/.test(statement)) {
      assert.equal(parameters[1], "follow-up-prospect");
      assert.equal(parameters[6], "follow_up", "repository must persist the follow-up purpose on the new version");
      this.followUpMessageId = String(parameters[0]);
      return [{
        id: this.followUpMessageId,
        prospect_id: "follow-up-prospect",
        version: 2,
        channel: String(parameters[2]),
        outreach_kind: String(parameters[6]),
        subject: String(parameters[3]),
        body: String(parameters[4]),
        status: "draft",
        created_by: String(parameters[5]),
        approved_by: null,
        approved_at: null,
        created_at: "2026-07-16T12:05:00.000Z",
      }];
    }
    if (/state = 'draft_ready'.*state = 'follow_up_due'/s.test(statement)) {
      this.state = "draft_ready";
      return [];
    }
    if (/state = 'awaiting_approval'/.test(statement)) {
      assert.equal(parameters[1], this.followUpMessageId);
      this.state = "awaiting_approval";
      return [this.prospectRow()];
    }
    if (/approve_retailer_prospect_message/.test(statement)) {
      assert.equal(parameters[2], this.followUpMessageId);
      this.state = "approved";
      return [{
        id: this.followUpMessageId,
        prospect_id: "follow-up-prospect",
        version: Number(parameters[1]),
        channel: "email",
        outreach_kind: "follow_up",
        subject: "Following up with Follow Up Spirits",
        body: "Fresh approved follow-up copy",
        status: "approved",
        created_by: "owner-1",
        approved_by: String(parameters[4]),
        approved_at: "2026-07-16T12:10:00.000Z",
        created_at: "2026-07-16T12:05:00.000Z",
      }];
    }
    if (/record_retailer_prospect_outreach/.test(statement)) {
      assert.equal(parameters[2], this.followUpMessageId);
      assert.equal(parameters[3], "follow_up");
      this.recordedMessageId = String(parameters[2]);
      this.state = "contacted";
      return [{ id: String(parameters[0]), message_version_id: this.recordedMessageId, kind: "follow_up" }];
    }
    throw new Error(`Unexpected follow-up lifecycle SQL in contract test: ${statement}`);
  }
}

const followUpQuery = new FollowUpLifecycleQuery();
const followUpRepository = new RetailerProspectRepository(followUpQuery);
const followUpVersion = await followUpRepository.createDraft({
  prospectId: "follow-up-prospect",
  channel: "email",
  subject: "Following up with Follow Up Spirits",
  body: "Fresh bespoke follow-up copy",
  createdBy: "owner-1",
});
assert.equal(followUpVersion.outreachKind, "follow_up");
assert.notEqual(followUpVersion.id, followUpQuery.initialMessageId);
await followUpRepository.submitDraftForApproval({ prospectId: "follow-up-prospect", messageId: followUpVersion.id });
const approvedFollowUp = await followUpRepository.approveExactDraft({
  prospectId: "follow-up-prospect",
  messageId: followUpVersion.id,
  version: followUpVersion.version,
  approvedBy: "owner-1",
});
assert.equal(approvedFollowUp.id, followUpVersion.id);
assert.equal(approvedFollowUp.outreachKind, "follow_up");
await followUpRepository.recordManualOutreach({
  prospectId: "follow-up-prospect",
  messageVersionId: approvedFollowUp.id,
  kind: "follow_up",
  recordedBy: "owner-1",
  contactedAt: "2026-07-16T12:15:00.000Z",
});
assert.equal(followUpQuery.recordedMessageId, followUpVersion.id);

const runtimeStatements: string[] = [];
const missingSchemaRepository = new RetailerProspectRepository({
  async query(statement: string) {
    runtimeStatements.push(statement);
    return [{ prospects: null, authorities: null, evidence: null, messages: null, packets: null, outreach: null, migrations: null, approve_function: null, outreach_function: null }];
  },
});
await assert.rejects(() => missingSchemaRepository.listProspects(), /migrate:retailer-acquisition/i);
assert.equal(runtimeStatements.every((statement) => /^\s*select\b/i.test(statement)), true);

class PausedTransitionQuery implements RetailerProspectQuery {
  updates = 0;
  private readonly gates: { officialContact: boolean; exactApproval: boolean; initialContactCount: number };

  constructor(gates: { officialContact: boolean; exactApproval: boolean; initialContactCount: number }) {
    this.gates = gates;
  }

  async query(statement: string, parameters: unknown[] = []) {
    if (/to_regclass\('public\.retailer_prospects'\)/.test(statement)) {
      return [{
        prospects: "retailer_prospects",
        authorities: "retailer_regulator_authorities",
        evidence: "retailer_prospect_contact_evidence",
        messages: "retailer_prospect_message_versions",
        packets: "retailer_prospect_approval_packets",
        outreach: "retailer_prospect_outreach",
        migrations: "retailer_acquisition_migrations",
        approve_function: "approve_retailer_prospect_message",
        outreach_function: "record_retailer_prospect_outreach",
      }];
    }
    if (/SELECT \* FROM retailer_prospects WHERE id = \$1/.test(statement)) {
      return [{
        id: "paused-prospect",
        state: "paused",
        name: "Paused Spirits",
        address: "",
        city: "Taylors",
        region: "SC",
        postal_code: "",
        website: "https://paused.example",
        listed_phone: "",
        identity_key: "paused-spirits|taylors-sc",
        location_key: "",
        domain_key: "paused.example",
        discovery_source: "contract-test",
        source_url: "",
        score: 0,
        score_components: {},
        score_inputs: {},
        score_rationale: [],
        outcome: null,
        initial_contact_count: this.gates.initialContactCount,
        follow_up_count: 0,
        created_at: "2026-07-16T12:00:00.000Z",
        updated_at: "2026-07-16T12:00:00.000Z",
      }];
    }
    if (/retailer_prospect_contact_evidence/.test(statement)) return this.gates.officialContact ? [{ "?column?": 1 }] : [];
    if (/status = 'draft'/.test(statement)) return [];
    if (/INNER JOIN retailer_prospect_approval_packets/.test(statement)) return this.gates.exactApproval ? [{ "?column?": 1 }] : [];
    if (/UPDATE retailer_prospects SET state = \$3/.test(statement)) {
      this.updates += 1;
      return [{
        id: "paused-prospect",
        state: String(parameters[2]),
        name: "Paused Spirits",
        address: "",
        city: "Taylors",
        region: "SC",
        postal_code: "",
        website: "https://paused.example",
        listed_phone: "",
        identity_key: "paused-spirits|taylors-sc",
        location_key: "",
        domain_key: "paused.example",
        discovery_source: "contract-test",
        source_url: "",
        score: 0,
        score_components: {},
        score_inputs: {},
        score_rationale: [],
        outcome: null,
        initial_contact_count: this.gates.initialContactCount,
        follow_up_count: 0,
        created_at: "2026-07-16T12:00:00.000Z",
        updated_at: "2026-07-16T12:01:00.000Z",
      }];
    }
    throw new Error(`Unexpected paused-transition SQL in contract test: ${statement}`);
  }
}

const unsafePausedQuery = new PausedTransitionQuery({ officialContact: false, exactApproval: false, initialContactCount: 0 });
const unsafePausedRepository = new RetailerProspectRepository(unsafePausedQuery);
await assert.rejects(() => unsafePausedRepository.transition({ prospectId: "paused-prospect", state: "verified" }), /official contact/i);
assert.equal(unsafePausedQuery.updates, 0);

const safePausedQuery = new PausedTransitionQuery({ officialContact: true, exactApproval: true, initialContactCount: 1 });
const safePausedRepository = new RetailerProspectRepository(safePausedQuery);
const safelyResumed = await safePausedRepository.transition({ prospectId: "paused-prospect", state: "verified" });
assert.equal(safelyResumed.prospectState, "verified");
assert.equal(safePausedQuery.updates, 1);
await assert.rejects(() => safePausedRepository.transition({ prospectId: "paused-prospect", state: "contacted" }), /record manual outreach/i);

const repositorySource = read("src/lib/retailer-prospect-repository.ts");
assert.doesNotMatch(repositorySource, /\bCREATE\s+(?:TABLE|INDEX|OR\s+REPLACE\s+FUNCTION)|\bALTER\s+TABLE/i);
assert.match(repositorySource, /INNER JOIN retailer_prospect_approval_packets packets[\s\S]*messages\.status = 'approved'/i);
const refreshStart = repositorySource.indexOf("const REFRESH_EXISTING_PROSPECT_QUERY");
const refreshEnd = repositorySource.indexOf("function connectionString", refreshStart);
assert.ok(refreshStart >= 0 && refreshEnd > refreshStart, "repository must isolate the discovery refresh allowlist");
const refreshStatement = repositorySource.slice(refreshStart, refreshEnd);
for (const mutableColumn of [
  "score_components", "score_inputs", "score_rationale", "discovery_source", "source_url",
  "website", "listed_phone", "address", "city", "region", "postal_code", "location_key", "domain_key",
]) assert.match(refreshStatement, new RegExp(`\\b${mutableColumn}\\b`, "i"));
assert.doesNotMatch(refreshStatement, /\b(state|outcome|initial_contact_count|follow_up_count|created_at|updated_at)\s*=/i);
const outreachMethod = repositorySource.slice(repositorySource.indexOf("async recordManualOutreach"), repositorySource.indexOf("async aggregateOutcomes"));
assert.doesNotMatch(outreachMethod, /input\.channel/);
assert.match(repositorySource, /record_retailer_prospect_outreach\(\$1,\s*\$2,\s*\$3,\s*\$4,\s*\$5,\s*\$6,\s*\$7\)/);
assert.match(repositorySource, /outreachKind:[^\n]*asString\(row\.outreach_kind\)/);
assert.match(repositorySource, /\["contact_verified",\s*"draft_ready",\s*"follow_up_due"\]/);

const schema = read("src/lib/retailer-prospect-schema.sql");
assert.match(schema, /approved_message\.channel/i);
assert.doesNotMatch(schema, /outreach_channel/i);
assert.match(schema, /INNER JOIN retailer_prospect_approval_packets packets[\s\S]*message_versions\.status = 'approved'/i);
assert.match(schema, /UPDATE retailer_prospect_outreach outreach[\s\S]*SET channel = messages\.channel/i);
assert.match(schema, /FOREIGN KEY \(message_version_id, channel\)[\s\S]*REFERENCES retailer_prospect_message_versions \(id, channel\)/i);
assert.match(schema, /regulator_authority_id/i);
assert.match(schema, /regulator_authority_domain/i);
assert.match(schema, /REFERENCES retailer_regulator_authorities \(id, name, domain\)/i);
assert.match(schema, /outreach_kind TEXT NOT NULL DEFAULT 'initial' CHECK \(outreach_kind IN \('initial', 'follow_up'\)\)/i);
assert.match(schema, /approved_message\.outreach_kind\s*<>\s*outreach_kind/i);
assert.match(schema, /outreach_kind = 'follow_up'[\s\S]*initial_contact_count <> 1[\s\S]*follow_up_count <> 0/i);
assert.match(schema, /initial_outreach\.message_version_id\s*=\s*approved_message\.id/i);

const admin = read("src/app/admin/retailer-acquisition/page.tsx");
assert.doesNotMatch(admin, /name="channel"\s+defaultValue=\{approvedMessage\.channel\}/);
assert.match(admin, /approvedMessage\.channel/);
assert.match(admin, /approvedMessage\.outreachKind/);
assert.match(admin, /\["contact_verified",\s*"follow_up_due"\]\.includes\(prospect\.prospectState\)/);
assert.doesNotMatch(admin, /\["approved",\s*"follow_up_due"\]\.includes\(prospect\.prospectState\)/);

const packageJson = JSON.parse(read("package.json")) as { scripts: Record<string, string> };
assert.match(packageJson.scripts["acquisition:import"], /import\.mts/);
assert.match(packageJson.scripts["migrate:retailer-acquisition"], /migrate-retailer-acquisition/);
assert.doesNotMatch(packageJson.scripts["migrate:retailer-acquisition"], /--apply/);
assert.match(packageJson.scripts["migrate:retailer-acquisition:apply"], /migrate-retailer-acquisition.*--apply/);

const migrationEnv = { ...process.env };
delete migrationEnv.BOURBON_QUEUE_DATABASE_URL_UNPOOLED;
delete migrationEnv.BOURBON_QUEUE_DATABASE_URL;
delete migrationEnv.DATABASE_URL;

const migrationPlan = spawnSync(process.execPath, ["scripts/migrate-retailer-acquisition.mjs"], {
  cwd: root,
  encoding: "utf8",
  env: migrationEnv,
});
assert.equal(migrationPlan.status, 0, migrationPlan.stderr);
const migrationPlanResult = JSON.parse(migrationPlan.stdout) as { ok: boolean; mode: string; checkOnly: boolean; schemaStatements: number; functionStatements: number };
assert.equal(migrationPlanResult.ok, true);
assert.equal(migrationPlanResult.mode, "plan");
assert.equal(migrationPlanResult.checkOnly, true);
assert.ok(migrationPlanResult.schemaStatements > 10);
assert.equal(migrationPlanResult.functionStatements, 2);

const migrationCheck = spawnSync(process.execPath, ["scripts/migrate-retailer-acquisition.mjs", "--check"], { cwd: root, encoding: "utf8", env: migrationEnv });
assert.equal(migrationCheck.status, 0, migrationCheck.stderr);
const migrationCheckResult = JSON.parse(migrationCheck.stdout) as { ok: boolean; checkOnly: boolean; schemaStatements: number; functionStatements: number };
assert.equal(migrationCheckResult.ok, true);
assert.equal(migrationCheckResult.checkOnly, true);
assert.ok(migrationCheckResult.schemaStatements > 10);
assert.equal(migrationCheckResult.functionStatements, 2);

const applyWithoutTarget = spawnSync(process.execPath, ["scripts/migrate-retailer-acquisition.mjs", "--apply"], {
  cwd: root,
  encoding: "utf8",
  env: migrationEnv,
});
assert.notEqual(applyWithoutTarget.status, 0);
assert.match(applyWithoutTarget.stderr, /--target/i);

const fallbackPassword = "generic-fallback-secret-must-not-print";
const applyWithGenericFallbackOnly = spawnSync(process.execPath, [
  "scripts/migrate-retailer-acquisition.mjs",
  "--apply",
  "--target",
  "fallback.example.test/retailer",
], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...migrationEnv,
    DATABASE_URL: `postgresql://fallback-user:${fallbackPassword}@fallback.example.test/retailer`,
  },
});
assert.notEqual(applyWithGenericFallbackOnly.status, 0);
assert.match(applyWithGenericFallbackOnly.stderr, /BOURBON_QUEUE_DATABASE_URL_UNPOOLED/);
assert.doesNotMatch(`${applyWithGenericFallbackOnly.stdout}\n${applyWithGenericFallbackOnly.stderr}`, new RegExp(fallbackPassword));

const configuredPassword = "retailer-migration-secret-must-not-print";
const mismatchedTarget = spawnSync(process.execPath, [
  "scripts/migrate-retailer-acquisition.mjs",
  "--apply",
  "--target",
  "expected.example.test/retailer",
], {
  cwd: root,
  encoding: "utf8",
  env: {
    ...migrationEnv,
    BOURBON_QUEUE_DATABASE_URL_UNPOOLED: `postgresql://migration-user:${configuredPassword}@actual.example.test/retailer`,
    DATABASE_URL: "postgresql://wrong-user:wrong-password@fallback.example.test/wrong-database",
  },
});
assert.notEqual(mismatchedTarget.status, 0);
assert.match(mismatchedTarget.stderr, /target.*does not match/i);
assert.doesNotMatch(`${mismatchedTarget.stdout}\n${mismatchedTarget.stderr}`, new RegExp(configuredPassword));

const migrationSource = read("scripts/migrate-retailer-acquisition.mjs");
assert.doesNotMatch(migrationSource, /process\.env\.DATABASE_URL/);

const cliDirectory = mkdtempSync(path.join(tmpdir(), "retailer-acquisition-import-test-"));
try {
  const input = path.join(cliDirectory, "ranked.json");
  const audit = path.join(cliDirectory, "audit.json");
  const unauthorizedAudit = path.join(cliDirectory, "unauthorized-audit.json");
  writeFileSync(input, JSON.stringify(rankedArtifact));
  const cli = spawnSync(process.execPath, [
    "--no-warnings",
    "--experimental-strip-types",
    "scripts/retailer-acquisition/import.mts",
    "--input", input,
    "--audit", audit,
    "--owner", OWNER_EMAIL,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(cli.status, 0, cli.stderr);
  const auditArtifact = JSON.parse(readFileSync(audit, "utf8")) as { mode: string; summary: { wouldUpsert: number } };
  assert.equal(auditArtifact.mode, "dry-run");
  assert.equal(auditArtifact.summary.wouldUpsert, 1);

  const unauthorizedCli = spawnSync(process.execPath, [
    "--no-warnings",
    "--experimental-strip-types",
    "scripts/retailer-acquisition/import.mts",
    "--input", input,
    "--audit", unauthorizedAudit,
    "--owner", "operator@example.com",
  ], { cwd: root, encoding: "utf8" });
  assert.notEqual(unauthorizedCli.status, 0);
  const unauthorizedAuditArtifact = JSON.parse(readFileSync(unauthorizedAudit, "utf8")) as { ok: boolean; error: string };
  assert.equal(unauthorizedAuditArtifact.ok, false);
  assert.match(unauthorizedAuditArtifact.error, /owner-only/i);
} finally {
  rmSync(cliDirectory, { recursive: true, force: true });
}

console.log("Retailer acquisition hardening contracts passed.");
