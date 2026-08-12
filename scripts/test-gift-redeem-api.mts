import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { canRedeemGiftForMembership } from "../src/lib/gifts.ts";

const route = readFileSync(new URL("../src/app/api/gifts/redeem/route.ts", import.meta.url), "utf8");
assert.match(route, /giftOwnsEffectiveAccess\(currentGiftOrderId, currentGiftVersion\)/,
  "the API must ask durable authority whether Clerk's current gift still owns access");
assert.match(route, /effectiveGiftOrderId\s*=\s*currentGiftOwnsAccess\s*\?\s*currentGiftOrderId\s*:\s*null/);
assert.match(route, /canRedeemGiftForMembership\(pending\.giftTier, currentTier, effectiveGiftOrderId\)/,
  "expired, refunded, and disputed gift IDs must not be passed to the redemption policy");
assert.equal(canRedeemGiftForMembership("standard", "free", null), true,
  "a recipient whose previous annual gift expired can redeem another annual gift");
assert.equal(canRedeemGiftForMembership("standard", "standard", "gift_current"), false,
  "a still-active gift continues to block an equal replacement");

console.log("Gift redemption API durable-ownership contract passed.");
