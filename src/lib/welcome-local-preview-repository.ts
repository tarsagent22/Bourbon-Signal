import { neon } from "@neondatabase/serverless";
import {
  toStoredWelcomeLocalPreviewRecord,
  type WelcomeLocalPreviewRecord,
} from "@/lib/welcome-local-preview";

function connectionString(env: NodeJS.ProcessEnv = process.env) {
  return env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
    || env.BOURBON_QUEUE_DATABASE_URL
    || env.DATABASE_URL
    || null;
}

export class WelcomeLocalPreviewRepository {
  private readonly query;

  constructor(url: string) {
    this.query = neon(url);
  }

  async read(userId: string): Promise<WelcomeLocalPreviewRecord | null> {
    const rows = await this.query.query(
      `SELECT payload FROM welcome_signal_previews WHERE user_id = $1 LIMIT 1`,
      [userId],
    ) as Array<{ payload: WelcomeLocalPreviewRecord }>;
    return rows[0]?.payload || null;
  }

  async claim(record: WelcomeLocalPreviewRecord): Promise<WelcomeLocalPreviewRecord> {
    const storedRecord = toStoredWelcomeLocalPreviewRecord(record);
    const rows = await this.query.query(
      `INSERT INTO welcome_signal_previews (user_id, payload, redeemed_at, expires_at)
       VALUES ($1, $2::jsonb, $3::timestamptz, $4::timestamptz)
       ON CONFLICT (user_id) DO NOTHING
       RETURNING payload`,
      [storedRecord.userId, JSON.stringify(storedRecord), storedRecord.redeemedAt, storedRecord.expiresAt],
    ) as Array<{ payload: WelcomeLocalPreviewRecord }>;
    if (rows[0]?.payload) return rows[0].payload;
    const existing = await this.read(storedRecord.userId);
    if (!existing) throw new Error("Unable to save the local signal preview.");
    return existing;
  }

  async replaceActive(record: WelcomeLocalPreviewRecord): Promise<WelcomeLocalPreviewRecord> {
    const storedRecord = toStoredWelcomeLocalPreviewRecord(record);
    const rows = await this.query.query(
      `UPDATE welcome_signal_previews
       SET payload = $2::jsonb
       WHERE user_id = $1 AND expires_at > NOW()
       RETURNING payload`,
      [storedRecord.userId, JSON.stringify(storedRecord)],
    ) as Array<{ payload: WelcomeLocalPreviewRecord }>;
    if (rows[0]?.payload) return rows[0].payload;
    const existing = await this.read(storedRecord.userId);
    if (!existing) throw new Error("Unable to update the local signal preview.");
    return existing;
  }
}

export function createWelcomeLocalPreviewRepository(env: NodeJS.ProcessEnv = process.env) {
  const url = connectionString(env);
  if (!url) throw new Error("Durable Welcome preview storage is not configured.");
  return new WelcomeLocalPreviewRepository(url);
}

export async function readWelcomeLocalPreview(userId: string) {
  return createWelcomeLocalPreviewRepository().read(userId);
}

export async function claimWelcomeLocalPreview(record: WelcomeLocalPreviewRecord) {
  return createWelcomeLocalPreviewRepository().claim(record);
}

export async function replaceWelcomeLocalPreview(record: WelcomeLocalPreviewRecord) {
  return createWelcomeLocalPreviewRepository().replaceActive(record);
}
