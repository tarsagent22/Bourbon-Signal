import { neon } from "@neondatabase/serverless";
import type { BottleContribution, BottleContributionStatus } from "@/lib/bottle-contributions";

type TransactionQuery = {
  query(text: string, params?: unknown[]): Promise<unknown>;
};

type BottleContributionQuery = TransactionQuery & {
  transaction(
    queries: (transaction: TransactionQuery) => Array<Promise<unknown>>,
    options?: { isolationLevel?: "ReadCommitted" | "RepeatableRead" | "Serializable"; readOnly?: boolean; deferrable?: boolean },
  ): Promise<unknown[]>;
};

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || env.BOURBON_QUEUE_DATABASE_URL || env.DATABASE_URL || null;
}

let schemaReady: Promise<void> | null = null;

export class BottleContributionRepository {
  private readonly query: BottleContributionQuery;

  constructor(database: string | BottleContributionQuery) {
    this.query = typeof database === "string"
      ? neon(database) as unknown as BottleContributionQuery
      : database;
  }

  async ensureSchema() {
    if (!schemaReady) {
      schemaReady = this.query.transaction((transaction) => [
        transaction.query(`SELECT pg_advisory_xact_lock(hashtext('bourbon_signal_bottle_contributions_schema_v1'))`),
        transaction.query(`
          CREATE TABLE IF NOT EXISTS bottle_contributions (
            id TEXT PRIMARY KEY,
            normalized_name TEXT NOT NULL,
            status TEXT NOT NULL,
            payload JSONB NOT NULL,
            created_at TIMESTAMPTZ NOT NULL,
            updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
          )
        `),
        transaction.query(`CREATE INDEX IF NOT EXISTS bottle_contributions_updated_idx ON bottle_contributions (updated_at DESC)`),
        transaction.query(`CREATE UNIQUE INDEX IF NOT EXISTS bottle_contributions_actionable_name_idx ON bottle_contributions (normalized_name) WHERE status IN ('new', 'needs_human')`),
      ], { isolationLevel: "Serializable" }).then(() => undefined).catch((error) => {
        schemaReady = null;
        throw error;
      });
    }
    await schemaReady;
  }

  async listContributions(limit = 500): Promise<BottleContribution[]> {
    await this.ensureSchema();
    const rows = await this.query.query(
      `SELECT payload FROM bottle_contributions ORDER BY updated_at DESC LIMIT $1`,
      [Math.max(1, Math.min(limit, 2000))],
    ) as Array<{ payload: BottleContribution }>;
    return rows.map((row) => row.payload);
  }

  async upsertContribution(contribution: BottleContribution): Promise<BottleContribution> {
    await this.ensureSchema();
    const rows = await this.query.query(
      `INSERT INTO bottle_contributions (id, normalized_name, status, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
       ON CONFLICT (normalized_name) WHERE status IN ('new', 'needs_human')
       DO UPDATE SET
         payload = bottle_contributions.payload || EXCLUDED.payload || jsonb_build_object(
           'id', bottle_contributions.id,
           'status', bottle_contributions.status,
           'createdAt', bottle_contributions.payload->'createdAt',
           'duplicateCount', COALESCE((bottle_contributions.payload->>'duplicateCount')::int, 1) + 1,
           'candidateBottleId', COALESCE(bottle_contributions.payload->'candidateBottleId', EXCLUDED.payload->'candidateBottleId'),
           'candidateBottleName', COALESCE(bottle_contributions.payload->'candidateBottleName', EXCLUDED.payload->'candidateBottleName'),
           'confidence', COALESCE(bottle_contributions.payload->'confidence', EXCLUDED.payload->'confidence')
         ),
         updated_at = EXCLUDED.updated_at
       RETURNING payload`,
      [contribution.id, contribution.normalizedName, contribution.status, JSON.stringify(contribution), contribution.createdAt, contribution.updatedAt],
    ) as Array<{ payload: BottleContribution }>;
    if (!rows[0]) throw new Error("Unable to persist bottle contribution.");
    return rows[0].payload;
  }

  async importLegacyContribution(contribution: BottleContribution) {
    await this.ensureSchema();
    await this.query.query(
      `INSERT INTO bottle_contributions (id, normalized_name, status, payload, created_at, updated_at)
       VALUES ($1, $2, $3, $4::jsonb, $5::timestamptz, $6::timestamptz)
       ON CONFLICT DO NOTHING`,
      [contribution.id, contribution.normalizedName, contribution.status, JSON.stringify(contribution), contribution.createdAt, contribution.updatedAt],
    );
  }

  async updateContribution(
    id: string,
    patch: Partial<Pick<BottleContribution, "status" | "candidateBottleId" | "candidateBottleName" | "confidence" | "notes">>,
    updatedAt: string,
  ): Promise<BottleContribution> {
    await this.ensureSchema();
    const status = patch.status;
    if (!status) throw new Error("Bottle contribution status is required.");
    const payloadPatch = { ...patch, updatedAt };
    const rows = await this.query.query(
      `UPDATE bottle_contributions
       SET status = $2, payload = payload || $3::jsonb, updated_at = $4::timestamptz
       WHERE id = $1
       RETURNING payload`,
      [id, status, JSON.stringify(payloadPatch), updatedAt],
    ) as Array<{ payload: BottleContribution }>;
    if (!rows[0]) throw new Error("Contribution not found");
    return rows[0].payload;
  }
}

export function createBottleContributionRepository(env: NodeJS.ProcessEnv = process.env) {
  const url = connectionString(env);
  if (!url) throw new Error("Durable bottle contribution storage is not configured.");
  return new BottleContributionRepository(url);
}

export function isStoredBottleContributionStatus(value: unknown): value is BottleContributionStatus {
  return ["new", "matched_existing", "needs_human", "rejected", "added", "ignored"].includes(String(value));
}
