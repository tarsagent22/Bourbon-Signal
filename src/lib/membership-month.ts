import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import type { MembershipTier } from "./entitlements.ts";

export type MonthDelivery = { provider: "apple" | "earned_access" | "stripe"; expiresAt?: string; code?: string; redeemUrl?: string };
export type MonthRoute = { provider: "apple" | "earned_access" | "stripe"; audience: "free" | "member"; tier: "standard" | "barrel" };
type Metadata = Record<string, unknown>;
export function membershipMonthRoute(tier: MembershipTier, metadata: Metadata, privateMetadata: Metadata, platform: unknown): MonthRoute | null {
  if (tier === "bottled-in-bond") return null;
  if (tier === "free") return { provider: platform === "ios" ? "apple" : "earned_access", audience: "free", tier: "standard" };
  if (metadata.giftOrderId || metadata.directFounderCheckoutAttemptId) return null;
  // An Apple subscription always retains Apple billing authority, even on the website.
  if (metadata.googleMembershipTier === tier && Date.parse(String(metadata.googleMembershipExpiresAt || "")) > Date.now()) return null;
  if (metadata.appleMembershipTier === tier && Date.parse(String(metadata.appleMembershipExpiresAt || "")) > Date.now() && typeof privateMetadata.appleMembershipProductId === "string") {
    if (!(privateMetadata.appleMembershipProductId as string).endsWith(".monthly") || !["active", "trialing", "canceled_period_end"].includes(String(metadata.appleMembershipStatus))) return null;
    return { provider: "apple", audience: "member", tier };
  }
  if (privateMetadata.stripeSubscriptionId) return { provider: "stripe", audience: "member", tier };
  return null;
}

function encryptionKey() {
  const key = Buffer.from(process.env.MEMBERSHIP_REWARD_CODE_ENCRYPTION_KEY || "", "base64");
  if (key.length !== 32) throw new Error("Apple reward delivery is not configured.");
  return key;
}
export function encryptMembershipCode(code: string) {
  if (!/^[A-Z0-9]{6,40}$/.test(code)) throw new Error("Invalid Apple reward code.");
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(code, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString("base64url")).join(".");
}
export function decryptMembershipCode(encrypted: string) {
  const parts = encrypted.split(".").map(value => Buffer.from(value, "base64url"));
  if (parts.length !== 3 || parts[0].length !== 12 || parts[1].length !== 16) throw new Error("Invalid Apple reward delivery.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), parts[0]);
  decipher.setAuthTag(parts[1]);
  return Buffer.concat([decipher.update(parts[2]), decipher.final()]).toString("utf8");
}
export function membershipMonthQuery() {
  const url = process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
  if (!url) throw new Error("Membership rewards are unavailable.");
  return neon(url);
}
export async function appleMonthAvailable(route: MonthRoute) {
  // Only approved production codes belong in the redeemable pool. Sandbox codes never unlock production rewards.
  if (!process.env.MEMBERSHIP_REWARD_CODE_ENCRYPTION_KEY) return false;
  const rows = await membershipMonthQuery().query("SELECT 1 FROM signal_membership_offer_codes WHERE tier=$1 AND audience=$2 AND environment='PRODUCTION' AND claimed_at IS NULL AND expires_at > NOW() + INTERVAL '1 day' LIMIT 1", [route.tier, route.audience]);
  return rows.length > 0;
}
export async function readMonthDelivery(userId: string, redemptionId: string): Promise<MonthDelivery | null> {
  const rows = await membershipMonthQuery().query(`SELECT r.details,c.encrypted_code,c.expires_at FROM signal_reward_redemptions r
    LEFT JOIN signal_membership_offer_codes c ON c.redemption_id=r.id
    WHERE r.id=$1 AND r.user_id=$2 AND r.status='delivered'`, [redemptionId, userId]) as Array<{details: Metadata; encrypted_code?: string; expires_at?: string}>;
  const row = rows[0];
  if (!row) return null;
  const provider = row.details.monthProvider;
  if (provider === "apple" && row.encrypted_code) {
    const code = decryptMembershipCode(row.encrypted_code);
    return { provider, code, expiresAt: new Date(row.expires_at!).toISOString(), redeemUrl: `https://apps.apple.com/redeem?ctx=offercodes&id=6804261265&code=${encodeURIComponent(code)}` };
  }
  if (provider === "earned_access") return { provider, expiresAt: String(row.details.accessExpiresAt) };
  return provider === "stripe" ? { provider } : null;
}
