import { neon } from "@neondatabase/serverless";
import { approvedCatalogKey, type ApprovedBottle, type ApprovedLocation } from "@/lib/approved-catalog";

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || env.DATABASE_URL || null;
}

export class ApprovedCatalogRepository {
  private readonly query;

  constructor(url: string) {
    this.query = neon(url);
  }

  async listApprovedBottles(limit = 2000): Promise<ApprovedBottle[]> {
    const rows = await this.query.query(
      `SELECT payload FROM approved_catalog_bottles ORDER BY updated_at DESC LIMIT $1`,
      [Math.max(1, Math.min(limit, 5000))],
    ) as Array<{ payload: ApprovedBottle }>;
    return rows.map((row) => row.payload);
  }

  async listApprovedLocations(limit = 5000): Promise<ApprovedLocation[]> {
    const rows = await this.query.query(
      `SELECT payload FROM approved_catalog_locations ORDER BY updated_at DESC LIMIT $1`,
      [Math.max(1, Math.min(limit, 10000))],
    ) as Array<{ payload: ApprovedLocation }>;
    return rows.map((row) => row.payload);
  }

  async upsertApprovedBottle(bottle: ApprovedBottle): Promise<ApprovedBottle> {
    const rows = await this.query.query(
      `INSERT INTO approved_catalog_bottles (id, normalized_name, payload, approved_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz, $5::timestamptz)
       ON CONFLICT (normalized_name) DO UPDATE SET
         payload = EXCLUDED.payload,
         approved_by = EXCLUDED.approved_by,
         updated_at = EXCLUDED.updated_at
       RETURNING payload`,
      [bottle.id, approvedCatalogKey(bottle.canonicalName), JSON.stringify(bottle), bottle.approvedBy, bottle.approvedAt],
    ) as Array<{ payload: ApprovedBottle }>;
    if (!rows[0]) throw new Error("Unable to persist approved bottle.");
    return rows[0].payload;
  }

  async upsertApprovedLocation(location: ApprovedLocation): Promise<ApprovedLocation> {
    const normalizedKey = approvedCatalogKey([location.state, location.name, location.address || location.city, location.zip || ""].join(" "));
    const rows = await this.query.query(
      `INSERT INTO approved_catalog_locations (id, normalized_key, payload, approved_by, created_at, updated_at)
       VALUES ($1, $2, $3::jsonb, $4, $5::timestamptz, $5::timestamptz)
       ON CONFLICT (normalized_key) DO UPDATE SET
         payload = EXCLUDED.payload,
         approved_by = EXCLUDED.approved_by,
         updated_at = EXCLUDED.updated_at
       RETURNING payload`,
      [location.id, normalizedKey, JSON.stringify(location), location.approvedBy, location.approvedAt],
    ) as Array<{ payload: ApprovedLocation }>;
    if (!rows[0]) throw new Error("Unable to persist approved location.");
    return rows[0].payload;
  }
}

export function createApprovedCatalogRepository(env: NodeJS.ProcessEnv = process.env) {
  const url = connectionString(env);
  if (!url) throw new Error("Durable approved catalog storage is not configured.");
  return new ApprovedCatalogRepository(url);
}
