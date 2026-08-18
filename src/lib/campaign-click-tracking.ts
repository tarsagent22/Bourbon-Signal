import { createHmac, timingSafeEqual } from "node:crypto";
import { neon } from "@neondatabase/serverless";

export type CampaignClickDestination = "points" | "trial";
export interface CampaignClickPayload {
  version: 1;
  campaignId: string;
  recipientId: string;
  destination: CampaignClickDestination;
  expiresAt: string;
}

const DESTINATIONS: Record<CampaignClickDestination, string> = {
  points: "https://www.bourbonsignal.com/dashboard?section=memberPoints&utm_source=bourbon_signal&utm_medium=email&utm_campaign=free_trial_points_pilot_v1",
  trial: "https://www.bourbonsignal.com/pricing?source=free_trial_points_pilot_v1&utm_source=bourbon_signal&utm_medium=email&utm_campaign=free_trial_points_pilot_v1",
};

function validSecret(secret: string) {
  if (secret.length < 32) throw new Error("Campaign click signing secret must be at least 32 characters.");
  return secret;
}

function signature(body: string, secret: string) {
  return createHmac("sha256", validSecret(secret)).update(body).digest("base64url");
}

function validText(value: unknown, pattern: RegExp) {
  return typeof value === "string" && pattern.test(value);
}

export function createCampaignClickToken(input: Omit<CampaignClickPayload, "version">, secret: string) {
  const payload: CampaignClickPayload = { version: 1, ...input };
  if (!validText(payload.campaignId, /^[a-z0-9-]{1,100}$/)
    || !validText(payload.recipientId, /^[A-Za-z0-9_-]{8,128}$/)
    || !Object.prototype.hasOwnProperty.call(DESTINATIONS, payload.destination)
    || !Number.isFinite(Date.parse(payload.expiresAt))) throw new Error("Invalid campaign click payload.");
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${body}.${signature(body, secret)}`;
}

export function verifyCampaignClickToken(token: string, secret: string, now = new Date()): CampaignClickPayload | null {
  try {
    const [body, supplied, extra] = token.split(".");
    if (!body || !supplied || extra) return null;
    const expected = signature(body, secret);
    const left = Buffer.from(supplied);
    const right = Buffer.from(expected);
    if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as CampaignClickPayload;
    if (payload.version !== 1
      || !validText(payload.campaignId, /^[a-z0-9-]{1,100}$/)
      || !validText(payload.recipientId, /^[A-Za-z0-9_-]{8,128}$/)
      || !Object.prototype.hasOwnProperty.call(DESTINATIONS, payload.destination)
      || !Number.isFinite(Date.parse(payload.expiresAt))
      || Date.parse(payload.expiresAt) <= now.getTime()) return null;
    return payload;
  } catch {
    return null;
  }
}

export function campaignClickDestination(destination: CampaignClickDestination) {
  return DESTINATIONS[destination];
}

export async function recordCampaignClick(payload: CampaignClickPayload, env: NodeJS.ProcessEnv = process.env) {
  const connectionString = env.BOURBON_QUEUE_DATABASE_URL || env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || env.DATABASE_URL;
  if (!connectionString) throw new Error("Campaign click database is not configured.");
  const sql = neon(connectionString);
  await sql.query(
    `INSERT INTO campaign_email_clicks (campaign_id, recipient_hash, destination, first_clicked_at, last_clicked_at, click_count)
     VALUES ($1, $2, $3, NOW(), NOW(), 1)
     ON CONFLICT (campaign_id, recipient_hash, destination) DO UPDATE
     SET last_clicked_at = NOW(), click_count = campaign_email_clicks.click_count + 1`,
    [payload.campaignId, payload.recipientId, payload.destination],
  );
}
