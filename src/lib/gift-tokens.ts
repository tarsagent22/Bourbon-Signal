import { createHmac, timingSafeEqual } from "node:crypto";

type GiftRedemptionKey = { version: string; secret: string };

export function giftRedemptionKeys(env: NodeJS.ProcessEnv = process.env): GiftRedemptionKey[] {
  const version = env.GIFT_REDEMPTION_KEY_VERSION?.trim() || "v1";
  const secret = env.GIFT_REDEMPTION_HASH_SECRET?.trim() || env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!secret || secret.length < 32) throw new Error("Gift redemption hashing is not configured.");
  const keys = [{ version, secret }];
  const previousVersion = env.GIFT_REDEMPTION_PREVIOUS_KEY_VERSION?.trim();
  const previousSecret = env.GIFT_REDEMPTION_HASH_SECRET_PREVIOUS?.trim();
  if (previousVersion || previousSecret) {
    if (!previousVersion || !previousSecret || previousSecret.length < 32 || previousVersion === version) {
      throw new Error("Previous gift redemption hashing key is not configured correctly.");
    }
    keys.push({ version: previousVersion, secret: previousSecret });
  }
  return keys;
}

export function currentGiftRedemptionKeyVersion(env: NodeJS.ProcessEnv = process.env) {
  return giftRedemptionKeys(env)[0].version;
}

function redemptionKey(version: string, env: NodeJS.ProcessEnv) {
  const key = giftRedemptionKeys(env).find((candidate) => candidate.version === version);
  if (!key) throw new Error(`Gift redemption key version ${version} is unavailable.`);
  return key;
}

export function giftRedemptionToken(orderId: string, env: NodeJS.ProcessEnv = process.env, keyVersion = currentGiftRedemptionKeyVersion(env)) {
  const key = redemptionKey(keyVersion, env);
  return createHmac("sha256", key.secret).update(`bourbon-signal/gift-token/${keyVersion}:${orderId}`).digest("base64url");
}

export function giftRedemptionTokenHash(token: string, env: NodeJS.ProcessEnv = process.env, keyVersion = currentGiftRedemptionKeyVersion(env)) {
  const key = redemptionKey(keyVersion, env);
  return createHmac("sha256", key.secret).update(`bourbon-signal/gift-token-hash/${keyVersion}:${token}`).digest("hex");
}

export function constantTimeTokenHashMatches(left: string, right: string) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
