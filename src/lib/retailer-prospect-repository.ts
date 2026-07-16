import { randomUUID } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import {
  assertProspectTransition,
  buildProspectDedupeKeys,
  isOfficialContactEvidence,
  normalizeRetailerProspect,
  type NormalizedRetailerProspect,
  type OfficialContactEvidence,
  type ProspectContactChannel,
  type ProspectMessageVersion,
  type ProspectOutreachKind,
  type RetailerProspectInput,
  type RetailerProspectScore,
  type RetailerProspectState,
} from "@/lib/retailer-acquisition";

export interface RetailerProspectRecord extends NormalizedRetailerProspect {
  id: string;
  prospectState: RetailerProspectState;
  identityKey: string;
  locationKey: string;
  domainKey: string;
  discoverySource: string;
  sourceUrl: string;
  score: RetailerProspectScore;
  outcome: string | null;
  initialContactCount: number;
  followUpCount: number;
  createdAt: string;
  updatedAt: string;
}

export interface RetailerProspectMessageRecord extends ProspectMessageVersion {
  id: string;
  createdBy: string;
  approvedBy: string | null;
  approvedAt: string | null;
  createdAt: string;
}

export interface RetailerProspectEvidenceRecord extends OfficialContactEvidence {
  id: string;
  prospectId: string;
  verifiedBy: string | null;
  createdAt: string;
}

const PROSPECT_STATES_SQL = `'discovered', 'qualified', 'contact_verified', 'draft_ready', 'awaiting_approval',
  'approved', 'contacted', 'follow_up_due', 'interested', 'onboarding', 'verified',
  'first_signal_live', 'paused', 'declined', 'invalid'`;

const APPROVE_MESSAGE_FUNCTION = `
  CREATE OR REPLACE FUNCTION approve_retailer_prospect_message(
    target_prospect_id TEXT, target_version INTEGER, target_message_id TEXT,
    target_packet_id TEXT, owner_id TEXT
  ) RETURNS retailer_prospect_message_versions AS $$
  DECLARE approved_message retailer_prospect_message_versions;
  BEGIN
    PERFORM 1 FROM retailer_prospects
    WHERE id = target_prospect_id AND state = 'awaiting_approval' FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Prospect is not awaiting approval'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM retailer_prospect_contact_evidence
      WHERE prospect_id = target_prospect_id AND verified_at IS NOT NULL
    ) THEN RAISE EXCEPTION 'Verified official contact evidence is required'; END IF;

    UPDATE retailer_prospect_message_versions SET status = 'superseded'
    WHERE prospect_id = target_prospect_id AND status = 'approved';
    UPDATE retailer_prospect_message_versions
    SET status = 'approved', approved_by = owner_id, approved_at = NOW()
    WHERE id = target_message_id AND prospect_id = target_prospect_id
      AND version = target_version AND status = 'draft'
    RETURNING * INTO approved_message;
    IF NOT FOUND THEN RAISE EXCEPTION 'Draft message version was not found'; END IF;

    INSERT INTO retailer_prospect_approval_packets (id, prospect_id, message_version_id, packet, approved_by)
    SELECT target_packet_id, prospects.id, approved_message.id,
      jsonb_build_object(
        'prospectId', prospects.id,
        'retailer', jsonb_build_object(
          'name', prospects.name, 'address', prospects.address, 'city', prospects.city,
          'state', prospects.region, 'postalCode', prospects.postal_code,
          'website', prospects.website, 'listedPhone', prospects.listed_phone
        ),
        'score', prospects.score, 'scoreComponents', prospects.score_components,
        'scoreInputs', prospects.score_inputs, 'scoreRationale', prospects.score_rationale,
        'messageVersion', approved_message.version,
        'message', jsonb_build_object('channel', approved_message.channel, 'subject', approved_message.subject, 'body', approved_message.body),
        'officialContactEvidence', COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'kind', evidence.kind, 'sourceUrl', evidence.source_url,
            'contactValue', evidence.contact_value, 'capturedAt', evidence.captured_at,
            'verifiedAt', evidence.verified_at
          ) ORDER BY evidence.captured_at DESC)
          FROM retailer_prospect_contact_evidence evidence
          WHERE evidence.prospect_id = prospects.id AND evidence.verified_at IS NOT NULL
        ), '[]'::jsonb),
        'guardrails', jsonb_build_array(
          'Owner approval applies only to this exact message version.',
          'No outreach may be recorded from a draft or superseded version.',
          'At most one follow-up may be recorded.',
          'Demand and outcomes remain aggregate; do not add identities or invented reach claims.'
        )
      ), owner_id
    FROM retailer_prospects prospects WHERE prospects.id = target_prospect_id;
    UPDATE retailer_prospects SET state = 'approved', updated_at = NOW()
    WHERE id = target_prospect_id;
    RETURN approved_message;
  END;
  $$ LANGUAGE plpgsql
`;

const RECORD_OUTREACH_FUNCTION = `
  CREATE OR REPLACE FUNCTION record_retailer_prospect_outreach(
    outreach_id TEXT, target_prospect_id TEXT, target_message_version_id TEXT,
    outreach_kind TEXT, outreach_channel TEXT, owner_id TEXT,
    contact_time TIMESTAMPTZ, outreach_note TEXT
  ) RETURNS retailer_prospect_outreach AS $$
  DECLARE prospect retailer_prospects; recorded retailer_prospect_outreach;
  BEGIN
    SELECT * INTO prospect FROM retailer_prospects WHERE id = target_prospect_id FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'Prospect was not found'; END IF;
    IF NOT EXISTS (
      SELECT 1 FROM retailer_prospect_message_versions message_versions
      WHERE message_versions.id = target_message_version_id
        AND message_versions.prospect_id = target_prospect_id
        AND message_versions.status = 'approved'
    ) THEN RAISE EXCEPTION 'Outreach requires an approved message version'; END IF;

    IF outreach_kind = 'initial' THEN
      IF prospect.state <> 'approved' OR prospect.initial_contact_count <> 0 THEN
        RAISE EXCEPTION 'Initial outreach is not allowed';
      END IF;
    ELSIF outreach_kind = 'follow_up' THEN
      IF NOT (
        prospect.state = 'follow_up_due' AND prospect.initial_contact_count = 1
        AND prospect.follow_up_count < 1
      ) THEN RAISE EXCEPTION 'Only one follow-up is allowed when follow-up is due'; END IF;
    ELSE RAISE EXCEPTION 'Unknown outreach kind';
    END IF;

    INSERT INTO retailer_prospect_outreach (
      id, prospect_id, message_version_id, kind, channel, recorded_by, contacted_at, note
    ) VALUES (
      outreach_id, target_prospect_id, target_message_version_id, outreach_kind,
      outreach_channel, owner_id, contact_time, outreach_note
    ) RETURNING * INTO recorded;
    UPDATE retailer_prospects
    SET state = 'contacted',
      initial_contact_count = CASE WHEN outreach_kind = 'initial' THEN 1 ELSE initial_contact_count END,
      follow_up_count = CASE WHEN outreach_kind = 'follow_up' THEN follow_up_count + 1 ELSE follow_up_count END,
      updated_at = NOW()
    WHERE id = target_prospect_id;
    RETURN recorded;
  END;
  $$ LANGUAGE plpgsql
`;

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || env.BOURBON_QUEUE_DATABASE_URL || env.DATABASE_URL || null;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function asObject(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function asArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function toIso(value: unknown) {
  const parsed = value instanceof Date ? value : new Date(asString(value));
  if (Number.isNaN(parsed.getTime())) throw new RangeError("Invalid retailer prospect timestamp");
  return parsed.toISOString();
}

function scoreFromRow(row: Record<string, unknown>): RetailerProspectScore {
  const components = asObject(row.score_components);
  const inputs = asObject(row.score_inputs);
  const demand = asObject(inputs.demand);
  const coverage = asObject(inputs.coverage);
  const fit = asObject(inputs.fit);
  const evidence = asObject(inputs.evidence);
  return {
    total: Number(row.score || 0),
    scoreOutOf: 100,
    components: {
      demand: Number(components.demand || 0),
      coverageGap: Number(components.coverageGap || 0),
      retailerFit: Number(components.retailerFit || 0),
      evidenceQuality: Number(components.evidenceQuality || 0),
    },
    inputs: {
      demand: {
        searches30d: Number(demand.searches30d || 0),
        savedAlerts: Number(demand.savedAlerts || 0),
        watchlistMatches: Number(demand.watchlistMatches || 0),
      },
      coverage: {
        marketStores: Number(coverage.marketStores || 0),
        coveredStores: Number(coverage.coveredStores || 0),
        citySignals30d: Number(coverage.citySignals30d || 0),
      },
      fit: {
        independent: fit.independent === true,
        bourbonSpecialist: fit.bourbonSpecialist === true,
        liveInventoryGap: fit.liveInventoryGap === true,
      },
      evidence: {
        officialContact: evidence.officialContact === true,
        officialWebsite: evidence.officialWebsite === true,
        physicalLocation: evidence.physicalLocation === true,
      },
    },
    rationale: asArray(row.score_rationale).filter((item): item is string => typeof item === "string"),
  };
}

function prospectFromRow(row: Record<string, unknown>): RetailerProspectRecord {
  return {
    id: asString(row.id),
    prospectState: asString(row.state) as RetailerProspectState,
    name: asString(row.name),
    address: asString(row.address),
    city: asString(row.city),
    state: asString(row.region),
    postalCode: asString(row.postal_code),
    website: asString(row.website),
    listedPhone: asString(row.listed_phone),
    identityKey: asString(row.identity_key),
    locationKey: asString(row.location_key),
    domainKey: asString(row.domain_key),
    discoverySource: asString(row.discovery_source),
    sourceUrl: asString(row.source_url),
    score: scoreFromRow(row),
    outcome: asString(row.outcome) || null,
    initialContactCount: Number(row.initial_contact_count || 0),
    followUpCount: Number(row.follow_up_count || 0),
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

function evidenceFromRow(row: Record<string, unknown>): RetailerProspectEvidenceRecord {
  return {
    id: asString(row.id),
    prospectId: asString(row.prospect_id),
    kind: asString(row.kind) as OfficialContactEvidence["kind"],
    sourceUrl: asString(row.source_url),
    contactValue: asString(row.contact_value),
    capturedAt: toIso(row.captured_at),
    verifiedAt: row.verified_at ? toIso(row.verified_at) : undefined,
    verifiedBy: asString(row.verified_by) || null,
    createdAt: toIso(row.created_at),
  };
}

function messageFromRow(row: Record<string, unknown>): RetailerProspectMessageRecord {
  return {
    id: asString(row.id),
    prospectId: asString(row.prospect_id),
    version: Number(row.version || 0),
    channel: asString(row.channel) as ProspectContactChannel,
    subject: asString(row.subject),
    body: asString(row.body),
    status: asString(row.status) as ProspectMessageVersion["status"],
    createdBy: asString(row.created_by),
    approvedBy: asString(row.approved_by) || null,
    approvedAt: row.approved_at ? toIso(row.approved_at) : null,
    createdAt: toIso(row.created_at),
  };
}

export class RetailerProspectRepository {
  private readonly query;
  private schemaReady: Promise<void> | null = null;

  constructor(url: string) {
    this.query = neon(url);
  }

  async ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        await this.query.query(`
          CREATE TABLE IF NOT EXISTS retailer_prospects (
            id TEXT PRIMARY KEY,
            state TEXT NOT NULL DEFAULT 'discovered' CHECK (state IN (${PROSPECT_STATES_SQL})),
            name TEXT NOT NULL, address TEXT NOT NULL DEFAULT '', city TEXT NOT NULL DEFAULT '',
            region TEXT NOT NULL, postal_code TEXT NOT NULL DEFAULT '', website TEXT NOT NULL DEFAULT '',
            listed_phone TEXT NOT NULL DEFAULT '', identity_key TEXT NOT NULL UNIQUE,
            location_key TEXT NOT NULL DEFAULT '', domain_key TEXT NOT NULL DEFAULT '',
            discovery_source TEXT NOT NULL, source_url TEXT NOT NULL DEFAULT '',
            score NUMERIC(5,1) NOT NULL DEFAULT 0 CHECK (score >= 0 AND score <= 100),
            score_components JSONB NOT NULL DEFAULT '{}'::jsonb,
            score_inputs JSONB NOT NULL DEFAULT '{}'::jsonb,
            score_rationale JSONB NOT NULL DEFAULT '[]'::jsonb,
            outcome TEXT, initial_contact_count SMALLINT NOT NULL DEFAULT 0 CHECK (initial_contact_count BETWEEN 0 AND 1),
            follow_up_count SMALLINT NOT NULL DEFAULT 0 CHECK (follow_up_count BETWEEN 0 AND 1),
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `);
        await this.query.query(`CREATE INDEX IF NOT EXISTS retailer_prospects_state_score_idx ON retailer_prospects (state, score DESC, created_at ASC)`);
        await this.query.query(`CREATE INDEX IF NOT EXISTS retailer_prospects_location_key_idx ON retailer_prospects (location_key) WHERE location_key <> ''`);
        await this.query.query(`CREATE INDEX IF NOT EXISTS retailer_prospects_domain_key_idx ON retailer_prospects (domain_key) WHERE domain_key <> ''`);
        await this.query.query(`
          CREATE TABLE IF NOT EXISTS retailer_prospect_contact_evidence (
            id TEXT PRIMARY KEY, prospect_id TEXT NOT NULL REFERENCES retailer_prospects(id) ON DELETE CASCADE,
            kind TEXT NOT NULL CHECK (kind IN ('official_website_email', 'official_website_phone', 'official_contact_form', 'regulator_listing')),
            source_url TEXT NOT NULL, contact_value TEXT NOT NULL, captured_at TIMESTAMPTZ NOT NULL,
            verified_at TIMESTAMPTZ, verified_by TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (prospect_id, kind, contact_value)
          )
        `);
        await this.query.query(`CREATE INDEX IF NOT EXISTS retailer_prospect_contact_evidence_prospect_idx ON retailer_prospect_contact_evidence (prospect_id, verified_at DESC)`);
        await this.query.query(`
          CREATE TABLE IF NOT EXISTS retailer_prospect_message_versions (
            id TEXT PRIMARY KEY, prospect_id TEXT NOT NULL REFERENCES retailer_prospects(id) ON DELETE CASCADE,
            version INTEGER NOT NULL CHECK (version > 0), channel TEXT NOT NULL CHECK (channel IN ('email', 'phone', 'contact_form')),
            subject TEXT NOT NULL DEFAULT '', body TEXT NOT NULL,
            status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'superseded')),
            created_by TEXT NOT NULL, approved_by TEXT, approved_at TIMESTAMPTZ,
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (prospect_id, version)
          )
        `);
        await this.query.query(`CREATE UNIQUE INDEX IF NOT EXISTS retailer_prospect_one_approved_message_idx ON retailer_prospect_message_versions (prospect_id) WHERE status = 'approved'`);
        await this.query.query(`
          CREATE TABLE IF NOT EXISTS retailer_prospect_approval_packets (
            id TEXT PRIMARY KEY, prospect_id TEXT NOT NULL REFERENCES retailer_prospects(id) ON DELETE CASCADE,
            message_version_id TEXT NOT NULL REFERENCES retailer_prospect_message_versions(id) ON DELETE RESTRICT,
            packet JSONB NOT NULL, approved_by TEXT NOT NULL, approved_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            UNIQUE (message_version_id)
          )
        `);
        await this.query.query(`
          CREATE TABLE IF NOT EXISTS retailer_prospect_outreach (
            id TEXT PRIMARY KEY, prospect_id TEXT NOT NULL REFERENCES retailer_prospects(id) ON DELETE CASCADE,
            message_version_id TEXT NOT NULL REFERENCES retailer_prospect_message_versions(id) ON DELETE RESTRICT,
            kind TEXT NOT NULL CHECK (kind IN ('initial', 'follow_up')),
            channel TEXT NOT NULL CHECK (channel IN ('email', 'phone', 'contact_form')),
            recorded_by TEXT NOT NULL, contacted_at TIMESTAMPTZ NOT NULL, note TEXT NOT NULL DEFAULT '',
            created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(), UNIQUE (prospect_id, kind)
          )
        `);
        await this.query.query(APPROVE_MESSAGE_FUNCTION);
        await this.query.query(RECORD_OUTREACH_FUNCTION);
      })().catch((error) => {
        this.schemaReady = null;
        throw error;
      });
    }
    await this.schemaReady;
  }

  async discover(input: {
    id?: string;
    prospect: RetailerProspectInput;
    score: RetailerProspectScore;
    discoverySource: string;
    sourceUrl?: string;
  }) {
    const normalized = normalizeRetailerProspect(input.prospect);
    if (!normalized.ok || !normalized.value) throw new Error(normalized.error || "Invalid retailer prospect.");
    const keys = buildProspectDedupeKeys(normalized.value);
    await this.ensureSchema();
    const duplicateRows = await this.query.query(`
      SELECT * FROM retailer_prospects
      WHERE identity_key = $1 OR ($2 <> '' AND location_key = $2)
      ORDER BY CASE WHEN identity_key = $1 THEN 0 ELSE 1 END
      LIMIT 1
    `, [keys.identityKey, keys.locationKey]);
    if (duplicateRows[0]) return { prospect: prospectFromRow(duplicateRows[0] as Record<string, unknown>), deduplicated: true };

    const rows = await this.query.query(`
      INSERT INTO retailer_prospects (
        id, name, address, city, region, postal_code, website, listed_phone,
        identity_key, location_key, domain_key, discovery_source, source_url,
        score, score_components, score_inputs, score_rationale
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16::jsonb, $17::jsonb)
      ON CONFLICT (identity_key) DO UPDATE SET
        source_url = CASE WHEN retailer_prospects.source_url = '' THEN EXCLUDED.source_url ELSE retailer_prospects.source_url END,
        updated_at = NOW()
      RETURNING *
    `, [
      input.id || randomUUID(), normalized.value.name, normalized.value.address, normalized.value.city,
      normalized.value.state, normalized.value.postalCode, normalized.value.website, normalized.value.listedPhone,
      keys.identityKey, keys.locationKey, keys.domainKey, input.discoverySource.trim().slice(0, 120),
      (input.sourceUrl || "").trim().slice(0, 500), input.score.total,
      JSON.stringify(input.score.components), JSON.stringify(input.score.inputs), JSON.stringify(input.score.rationale),
    ]);
    return { prospect: prospectFromRow(rows[0] as Record<string, unknown>), deduplicated: false };
  }

  async getProspect(id: string) {
    await this.ensureSchema();
    const rows = await this.query.query(`SELECT * FROM retailer_prospects WHERE id = $1 LIMIT 1`, [id]);
    return rows[0] ? prospectFromRow(rows[0] as Record<string, unknown>) : null;
  }

  async listProspects(input: { state?: RetailerProspectState; limit?: number; offset?: number } = {}) {
    await this.ensureSchema();
    const limit = Math.min(Math.max(input.limit || 100, 1), 500);
    const offset = Math.max(input.offset || 0, 0);
    const rows = input.state
      ? await this.query.query(`SELECT * FROM retailer_prospects WHERE state = $1 ORDER BY score DESC, created_at ASC LIMIT $2 OFFSET $3`, [input.state, limit, offset])
      : await this.query.query(`SELECT * FROM retailer_prospects ORDER BY score DESC, created_at ASC LIMIT $1 OFFSET $2`, [limit, offset]);
    return rows.map((row) => prospectFromRow(row as Record<string, unknown>));
  }

  async listEvidence(prospectId?: string) {
    await this.ensureSchema();
    const rows = prospectId
      ? await this.query.query(`SELECT * FROM retailer_prospect_contact_evidence WHERE prospect_id = $1 ORDER BY captured_at DESC`, [prospectId])
      : await this.query.query(`SELECT * FROM retailer_prospect_contact_evidence ORDER BY captured_at DESC`);
    return rows.map((row) => evidenceFromRow(row as Record<string, unknown>));
  }

  async addOfficialContactEvidence(input: {
    prospectId: string;
    evidence: OfficialContactEvidence;
    verifiedBy: string;
  }) {
    const prospect = await this.getProspect(input.prospectId);
    if (!prospect) throw new Error("Retailer prospect was not found.");
    if (!isOfficialContactEvidence({ ...input.evidence, verifiedAt: input.evidence.verifiedAt || new Date().toISOString() }, prospect.domainKey)) {
      throw new Error("Contact evidence is not from a verifiable official source.");
    }
    const rows = await this.query.query(`
      INSERT INTO retailer_prospect_contact_evidence (
        id, prospect_id, kind, source_url, contact_value, captured_at, verified_at, verified_by
      ) VALUES ($1, $2, $3, $4, $5, $6, COALESCE($7::timestamptz, NOW()), $8)
      ON CONFLICT (prospect_id, kind, contact_value) DO UPDATE SET
        source_url = EXCLUDED.source_url, captured_at = EXCLUDED.captured_at,
        verified_at = COALESCE(retailer_prospect_contact_evidence.verified_at, EXCLUDED.verified_at),
        verified_by = COALESCE(retailer_prospect_contact_evidence.verified_by, EXCLUDED.verified_by)
      RETURNING *
    `, [
      input.evidence.id || randomUUID(), input.prospectId, input.evidence.kind, input.evidence.sourceUrl,
      input.evidence.contactValue, input.evidence.capturedAt, input.evidence.verifiedAt || null, input.verifiedBy,
    ]);
    return evidenceFromRow(rows[0] as Record<string, unknown>);
  }

  async transition(input: { prospectId: string; state: RetailerProspectState; outcome?: string | null }) {
    if (input.state === "approved") throw new Error("Approve an exact message version to enter the approved state.");
    const prospect = await this.getProspect(input.prospectId);
    if (!prospect) throw new Error("Retailer prospect was not found.");
    const [evidenceRows, approvedRows] = await Promise.all([
      this.query.query(`SELECT 1 FROM retailer_prospect_contact_evidence WHERE prospect_id = $1 AND verified_at IS NOT NULL LIMIT 1`, [input.prospectId]),
      this.query.query(`SELECT 1 FROM retailer_prospect_message_versions WHERE prospect_id = $1 AND status = 'approved' LIMIT 1`, [input.prospectId]),
    ]);
    assertProspectTransition(prospect.prospectState, input.state, {
      hasOfficialContact: evidenceRows.length > 0,
      hasApprovedVersion: approvedRows.length > 0,
      followUpCount: prospect.followUpCount,
    });
    const outcome = input.outcome?.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "").slice(0, 40) || null;
    const rows = await this.query.query(`
      UPDATE retailer_prospects SET state = $3, outcome = COALESCE($4, outcome), updated_at = NOW()
      WHERE id = $1 AND state = $2 RETURNING *
    `, [input.prospectId, prospect.prospectState, input.state, outcome]);
    if (!rows[0]) throw new Error("Retailer prospect changed while the transition was being applied.");
    return prospectFromRow(rows[0] as Record<string, unknown>);
  }

  async createDraft(input: {
    prospectId: string;
    channel: ProspectContactChannel;
    subject: string;
    body: string;
    createdBy: string;
  }) {
    const prospect = await this.getProspect(input.prospectId);
    if (!prospect || !["contact_verified", "draft_ready"].includes(prospect.prospectState)) throw new Error("Prospect must have verified contact before drafting.");
    if (!input.body.trim()) throw new Error("Draft body is required.");
    const rows = await this.query.query(`
      WITH next_version AS (
        SELECT COALESCE(MAX(version), 0) + 1 AS version
        FROM retailer_prospect_message_versions WHERE prospect_id = $2
      ), superseded AS (
        UPDATE retailer_prospect_message_versions SET status = 'superseded'
        WHERE prospect_id = $2 AND status = 'draft' RETURNING id
      )
      INSERT INTO retailer_prospect_message_versions (
        id, prospect_id, version, channel, subject, body, status, created_by
      ) SELECT $1, $2, next_version.version, $3, $4, $5, 'draft', $6 FROM next_version
      RETURNING *
    `, [randomUUID(), input.prospectId, input.channel, input.subject.trim().slice(0, 240), input.body.trim().slice(0, 10_000), input.createdBy]);
    if (prospect.prospectState === "contact_verified") {
      await this.query.query(`UPDATE retailer_prospects SET state = 'draft_ready', updated_at = NOW() WHERE id = $1 AND state = 'contact_verified'`, [input.prospectId]);
    }
    return messageFromRow(rows[0] as Record<string, unknown>);
  }

  async listMessageVersions(prospectId?: string) {
    await this.ensureSchema();
    const rows = prospectId
      ? await this.query.query(`SELECT * FROM retailer_prospect_message_versions WHERE prospect_id = $1 ORDER BY version DESC`, [prospectId])
      : await this.query.query(`SELECT * FROM retailer_prospect_message_versions ORDER BY prospect_id, version DESC`);
    return rows.map((row) => messageFromRow(row as Record<string, unknown>));
  }

  async submitDraftForApproval(input: { prospectId: string; messageId: string }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      UPDATE retailer_prospects prospects SET state = 'awaiting_approval', updated_at = NOW()
      WHERE prospects.id = $1 AND prospects.state = 'draft_ready'
        AND EXISTS (
          SELECT 1 FROM retailer_prospect_message_versions messages
          WHERE messages.id = $2 AND messages.prospect_id = prospects.id AND messages.status = 'draft'
        )
        AND EXISTS (
          SELECT 1 FROM retailer_prospect_contact_evidence evidence
          WHERE evidence.prospect_id = prospects.id AND evidence.verified_at IS NOT NULL
        )
      RETURNING *
    `, [input.prospectId, input.messageId]);
    if (!rows[0]) throw new Error("A draft and verified official contact are required for approval review.");
    return prospectFromRow(rows[0] as Record<string, unknown>);
  }

  async approveExactDraft(input: { prospectId: string; messageId: string; version: number; approvedBy: string }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      SELECT * FROM approve_retailer_prospect_message($1, $2, $3, $4, $5)
    `, [input.prospectId, input.version, input.messageId, randomUUID(), input.approvedBy]);
    if (!rows[0]) throw new Error("Draft could not be approved.");
    return messageFromRow(rows[0] as Record<string, unknown>);
  }

  async getApprovalPacket(prospectId: string) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      SELECT packet, approved_at FROM retailer_prospect_approval_packets
      WHERE prospect_id = $1 ORDER BY approved_at DESC LIMIT 1
    `, [prospectId]);
    if (!rows[0]) return null;
    const row = rows[0] as Record<string, unknown>;
    return { packet: asObject(row.packet), approvedAt: toIso(row.approved_at) };
  }

  async listApprovalPackets() {
    await this.ensureSchema();
    const rows = await this.query.query(`
      SELECT prospect_id, packet, approved_at FROM retailer_prospect_approval_packets
      ORDER BY approved_at DESC
    `);
    return rows.map((value) => {
      const row = value as Record<string, unknown>;
      return { prospectId: asString(row.prospect_id), packet: asObject(row.packet), approvedAt: toIso(row.approved_at) };
    });
  }

  async recordManualOutreach(input: {
    prospectId: string;
    messageVersionId: string;
    kind: ProspectOutreachKind;
    channel: ProspectContactChannel;
    recordedBy: string;
    contactedAt: string;
    note?: string;
  }) {
    await this.ensureSchema();
    const rows = await this.query.query(`
      SELECT * FROM record_retailer_prospect_outreach($1, $2, $3, $4, $5, $6, $7, $8)
    `, [
      randomUUID(), input.prospectId, input.messageVersionId, input.kind, input.channel,
      input.recordedBy, input.contactedAt, (input.note || "").trim().slice(0, 500),
    ]);
    if (!rows[0]) throw new Error("Manual outreach could not be recorded.");
    return rows[0] as Record<string, unknown>;
  }

  async aggregateOutcomes() {
    await this.ensureSchema();
    const [stateRows, outcomeRows, totalRows] = await Promise.all([
      this.query.query(`SELECT state, COUNT(*)::integer AS count FROM retailer_prospects GROUP BY state ORDER BY state`),
      this.query.query(`SELECT outcome, COUNT(*)::integer AS count FROM retailer_prospects WHERE outcome IS NOT NULL GROUP BY outcome ORDER BY outcome`),
      this.query.query(`SELECT COUNT(*)::integer AS count FROM retailer_prospects`),
    ]);
    const states: Partial<Record<RetailerProspectState, number>> = {};
    const outcomes: Record<string, number> = {};
    for (const row of stateRows as Array<Record<string, unknown>>) states[asString(row.state) as RetailerProspectState] = Number(row.count || 0);
    for (const row of outcomeRows as Array<Record<string, unknown>>) outcomes[asString(row.outcome)] = Number(row.count || 0);
    return { total: Number((totalRows[0] as Record<string, unknown> | undefined)?.count || 0), states, outcomes };
  }
}

let repository: RetailerProspectRepository | null = null;

export function getRetailerProspectRepository(env: NodeJS.ProcessEnv = process.env) {
  if (!repository) {
    const url = connectionString(env);
    if (!url) throw new Error("Retailer prospect database is not configured.");
    repository = new RetailerProspectRepository(url);
  }
  return repository;
}
