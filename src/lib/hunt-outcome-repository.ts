import { neon } from "@neondatabase/serverless";

export const HUNT_OUTCOMES = ["found_it", "gone_when_checked", "didnt_go"] as const;
export type HuntOutcome = (typeof HUNT_OUTCOMES)[number];

export const HUNT_OUTCOME_SOURCE_TYPES = ["member", "retailer", "trusted_source", "release_source"] as const;
export type HuntOutcomeSourceType = (typeof HUNT_OUTCOME_SOURCE_TYPES)[number];

export interface HuntOutcomeSignalReference {
  signalId: string;
  availabilityEpisodeId: string;
  sourceType: HuntOutcomeSourceType;
  stateCode?: string | null;
}

export interface HuntOutcomeRecord extends HuntOutcomeSignalReference {
  outcome: HuntOutcome;
  stateCode: string | null;
  submittedAt: string;
  updatedAt: string;
}

export interface HuntOutcomeQueryExecutor {
  query(text: string, params?: unknown[]): Promise<unknown>;
}

interface HuntOutcomeRow {
  signal_id?: unknown;
  availability_episode_id?: unknown;
  outcome?: unknown;
  source_type?: unknown;
  state_code?: unknown;
  submitted_at?: unknown;
  updated_at?: unknown;
}

interface AggregateRow {
  total_responses?: unknown;
  found_it_count?: unknown;
  by_source_type?: unknown;
  by_state?: unknown;
}

interface AggregateBucketRow {
  key?: unknown;
  totalResponses?: unknown;
  foundItCount?: unknown;
  total_responses?: unknown;
  found_it_count?: unknown;
}

export interface PrivateHuntOutcomeAggregationFilter {
  from: string;
  to: string;
  sourceType?: HuntOutcomeSourceType;
  stateCode?: string;
}

export interface PrivateHuntOutcomeAggregation {
  window: { from: string; to: string };
  filters: { sourceType?: HuntOutcomeSourceType; stateCode?: string };
  totalResponses: number;
  foundItCount: number;
  foundItRate: number;
  bySourceType: Array<{
    sourceType: HuntOutcomeSourceType;
    totalResponses: number;
    foundItCount: number;
    foundItRate: number;
  }>;
  byState: Array<{
    stateCode: string;
    totalResponses: number;
    foundItCount: number;
    foundItRate: number;
  }>;
}

const OUTCOME_SET = new Set<string>(HUNT_OUTCOMES);
const SOURCE_TYPE_SET = new Set<string>(HUNT_OUTCOME_SOURCE_TYPES);

function text(value: unknown) {
  return typeof value === "string" ? value : value instanceof Date ? value.toISOString() : String(value || "");
}

function requiredText(value: unknown, label: string, maximumLength: number) {
  const normalized = text(value).trim();
  if (!normalized || normalized.length > maximumLength) throw new Error(`A valid ${label} is required.`);
  return normalized;
}

function normalizedTimestamp(value: unknown, label: string) {
  const parsed = Date.parse(text(value));
  if (!Number.isFinite(parsed)) throw new Error(`A valid ${label} is required.`);
  return new Date(parsed).toISOString();
}

function normalizedState(value: unknown) {
  if (value === null || value === undefined || value === "") return null;
  const state = text(value).trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) throw new Error("A valid state code is required.");
  return state;
}

function normalizedSourceType(value: unknown): HuntOutcomeSourceType {
  const sourceType = text(value);
  if (!SOURCE_TYPE_SET.has(sourceType)) throw new Error("A valid Hunt Outcome source type is required.");
  return sourceType as HuntOutcomeSourceType;
}

export function isHuntOutcome(value: unknown): value is HuntOutcome {
  return typeof value === "string" && OUTCOME_SET.has(value);
}

function rowToOutcome(row: HuntOutcomeRow): HuntOutcomeRecord {
  if (!isHuntOutcome(row.outcome)) throw new Error("Stored Hunt Outcome is invalid.");
  return {
    signalId: requiredText(row.signal_id, "Signal id", 300),
    availabilityEpisodeId: requiredText(row.availability_episode_id, "availability episode id", 400),
    outcome: row.outcome,
    sourceType: normalizedSourceType(row.source_type),
    stateCode: normalizedState(row.state_code),
    submittedAt: normalizedTimestamp(row.submitted_at, "submission timestamp"),
    updatedAt: normalizedTimestamp(row.updated_at, "update timestamp"),
  };
}

function number(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.max(0, Math.trunc(parsed)) : 0;
}

function rate(foundItCount: number, totalResponses: number) {
  return totalResponses > 0 ? foundItCount / totalResponses : 0;
}

function jsonArray(value: unknown): AggregateBucketRow[] {
  if (Array.isArray(value)) return value as AggregateBucketRow[];
  if (typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed as AggregateBucketRow[] : [];
  } catch {
    return [];
  }
}

function bucketCounts(row: AggregateBucketRow) {
  const totalResponses = number(row.totalResponses ?? row.total_responses);
  const foundItCount = number(row.foundItCount ?? row.found_it_count);
  return { totalResponses, foundItCount, foundItRate: rate(foundItCount, totalResponses) };
}

export class HuntOutcomeRepository {
  private readonly query: HuntOutcomeQueryExecutor;

  constructor(input: string | HuntOutcomeQueryExecutor) {
    this.query = typeof input === "string"
      ? neon(input) as unknown as HuntOutcomeQueryExecutor
      : input;
  }

  async getForUser(userId: string, availabilityEpisodeId: string): Promise<HuntOutcomeRecord | null> {
    const memberId = requiredText(userId, "user id", 200);
    const episodeId = requiredText(availabilityEpisodeId, "availability episode id", 400);
    const rows = await this.query.query(`
      SELECT
        signal_id, availability_episode_id, outcome, source_type, state_code,
        submitted_at, updated_at
      FROM hunt_outcomes
      WHERE user_id = $1 AND availability_episode_id = $2
      LIMIT 1
    `, [memberId, episodeId]) as HuntOutcomeRow[];
    return rows[0] ? rowToOutcome(rows[0]) : null;
  }

  async setForUser(
    userId: string,
    signal: HuntOutcomeSignalReference,
    outcome: HuntOutcome,
    updatedAt = new Date().toISOString(),
  ): Promise<HuntOutcomeRecord> {
    const memberId = requiredText(userId, "user id", 200);
    const signalId = requiredText(signal.signalId, "Signal id", 300);
    const episodeId = requiredText(signal.availabilityEpisodeId, "availability episode id", 400);
    if (!isHuntOutcome(outcome)) throw new Error("A valid Hunt Outcome is required.");
    const sourceType = normalizedSourceType(signal.sourceType);
    const stateCode = normalizedState(signal.stateCode);
    const timestamp = normalizedTimestamp(updatedAt, "update timestamp");
    const rows = await this.query.query(`
      INSERT INTO hunt_outcomes (
        user_id, signal_id, availability_episode_id, outcome,
        source_type, state_code, submitted_at, updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7::timestamptz, $7::timestamptz)
      ON CONFLICT (user_id, availability_episode_id)
      DO UPDATE SET
        signal_id = EXCLUDED.signal_id,
        outcome = EXCLUDED.outcome,
        source_type = EXCLUDED.source_type,
        state_code = EXCLUDED.state_code,
        updated_at = CASE
          WHEN hunt_outcomes.signal_id IS DISTINCT FROM EXCLUDED.signal_id
            OR hunt_outcomes.outcome IS DISTINCT FROM EXCLUDED.outcome
            OR hunt_outcomes.source_type IS DISTINCT FROM EXCLUDED.source_type
            OR hunt_outcomes.state_code IS DISTINCT FROM EXCLUDED.state_code
          THEN GREATEST(EXCLUDED.updated_at, hunt_outcomes.submitted_at)
          ELSE hunt_outcomes.updated_at
        END
      RETURNING
        signal_id, availability_episode_id, outcome, source_type, state_code,
        submitted_at, updated_at
    `, [memberId, signalId, episodeId, outcome, sourceType, stateCode, timestamp]) as HuntOutcomeRow[];
    if (!rows[0]) throw new Error("Hunt Outcome could not be saved.");
    return rowToOutcome(rows[0]);
  }

  async removeForUser(userId: string, availabilityEpisodeId: string): Promise<boolean> {
    const memberId = requiredText(userId, "user id", 200);
    const episodeId = requiredText(availabilityEpisodeId, "availability episode id", 400);
    const rows = await this.query.query(`
      DELETE FROM hunt_outcomes
      WHERE user_id = $1 AND availability_episode_id = $2
      RETURNING availability_episode_id
    `, [memberId, episodeId]) as Array<{ availability_episode_id?: unknown }>;
    return Boolean(rows[0]);
  }

  async aggregatePrivate(filter: PrivateHuntOutcomeAggregationFilter): Promise<PrivateHuntOutcomeAggregation> {
    const from = normalizedTimestamp(filter.from, "aggregation window");
    const to = normalizedTimestamp(filter.to, "aggregation window");
    if (Date.parse(from) >= Date.parse(to)) throw new Error("A valid aggregation window is required.");
    const sourceType = filter.sourceType === undefined ? null : normalizedSourceType(filter.sourceType);
    const stateCode = filter.stateCode === undefined ? null : normalizedState(filter.stateCode);
    const rows = await this.query.query(`
      WITH filtered AS (
        SELECT outcome, source_type, state_code
        FROM hunt_outcomes
        WHERE updated_at >= $1::timestamptz
          AND updated_at < $2::timestamptz
          AND ($3::text IS NULL OR source_type = $3)
          AND ($4::text IS NULL OR state_code = $4)
      ), totals AS (
        SELECT
          COUNT(*)::int AS total_responses,
          COUNT(*) FILTER (WHERE outcome = 'found_it')::int AS found_it_count
        FROM filtered
      ), source_totals AS (
        SELECT
          source_type AS key,
          COUNT(*)::int AS total_responses,
          COUNT(*) FILTER (WHERE outcome = 'found_it')::int AS found_it_count
        FROM filtered
        GROUP BY source_type
      ), state_totals AS (
        SELECT
          state_code AS key,
          COUNT(*)::int AS total_responses,
          COUNT(*) FILTER (WHERE outcome = 'found_it')::int AS found_it_count
        FROM filtered
        WHERE state_code IS NOT NULL
        GROUP BY state_code
      )
      SELECT
        totals.total_responses,
        totals.found_it_count,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'key', key,
            'totalResponses', total_responses,
            'foundItCount', found_it_count
          ) ORDER BY key)
          FROM source_totals
        ), '[]'::jsonb) AS by_source_type,
        COALESCE((
          SELECT jsonb_agg(jsonb_build_object(
            'key', key,
            'totalResponses', total_responses,
            'foundItCount', found_it_count
          ) ORDER BY key)
          FROM state_totals
        ), '[]'::jsonb) AS by_state
      FROM totals
    `, [from, to, sourceType, stateCode]) as AggregateRow[];
    const row = rows[0] || {};
    const totalResponses = number(row.total_responses);
    const foundItCount = number(row.found_it_count);
    const bySourceType = jsonArray(row.by_source_type)
      .filter((bucket) => SOURCE_TYPE_SET.has(text(bucket.key)))
      .map((bucket) => ({
        sourceType: text(bucket.key) as HuntOutcomeSourceType,
        ...bucketCounts(bucket),
      }));
    const byState = jsonArray(row.by_state)
      .filter((bucket) => /^[A-Z]{2}$/.test(text(bucket.key)))
      .map((bucket) => ({
        stateCode: text(bucket.key),
        ...bucketCounts(bucket),
      }));
    return {
      window: { from, to },
      filters: {
        ...(sourceType ? { sourceType } : {}),
        ...(stateCode ? { stateCode } : {}),
      },
      totalResponses,
      foundItCount,
      foundItRate: rate(foundItCount, totalResponses),
      bySourceType,
      byState,
    };
  }
}

let repository: HuntOutcomeRepository | null = null;

export function getHuntOutcomeRepository(env: NodeJS.ProcessEnv = process.env) {
  if (repository) return repository;
  const connectionString = env.BOURBON_QUEUE_DATABASE_URL
    || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.DATABASE_URL;
  if (!connectionString) throw new Error("Hunt Outcome storage is not configured.");
  repository = new HuntOutcomeRepository(connectionString);
  return repository;
}
