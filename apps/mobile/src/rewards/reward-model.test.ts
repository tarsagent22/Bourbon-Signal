import assert from "node:assert/strict";
import test from "node:test";
import {
  rewardCost,
  rewardGoal,
  nextAchievements,
  activityLabel,
} from "./reward-model";
import { createMobileApi } from "../api/client";
import type { AchievementSummary, SignalRewardItem } from "../api/types";

const catalog: SignalRewardItem[] = [
  {
    key: "sticker_pack",
    name: "Stickers",
    points: 75,
    fulfillmentType: "physical",
  },
  {
    key: "rocks_glass",
    name: "Glass",
    points: 400,
    fulfillmentType: "physical",
    options: { glassQuantity: 1, engravingPointsPerGlass: 125 },
  },
  {
    key: "sold_out",
    name: "Unavailable",
    points: 150,
    fulfillmentType: "physical",
    inventoryRemaining: 0,
  },
];
test("goals survive spending, ignore removed and sold-out catalog entries, and handle empty catalogs", () => {
  assert.equal(rewardGoal(catalog, "rocks_glass", 500)?.key, "rocks_glass");
  assert.equal(rewardGoal(catalog, "rocks_glass", 55)?.key, "rocks_glass");
  assert.equal(rewardGoal(catalog, "sold_out", 130)?.key, "rocks_glass");
  assert.equal(rewardGoal(catalog, "removed", 130)?.key, "rocks_glass");
  assert.equal(rewardGoal([], null, 130), null);
  assert.equal(rewardCost(catalog[1], true), 525);
  assert.equal(rewardCost(catalog[1], false), 400);
});
test("next achievements show the next unearned tier, never spendable balance", () => {
  const summary = {
    badgeProgress: [
      {
        id: "spotter_bronze",
        label: "Spotter",
        current: 5,
        target: 5,
        earned: true,
      },
      {
        id: "spotter_silver",
        label: "Spotter",
        current: 8,
        target: 25,
        earned: false,
      },
      {
        id: "spotter_gold",
        label: "Spotter",
        current: 8,
        target: 50,
        earned: false,
      },
      {
        id: "photo_finish",
        label: "Photo Finish",
        current: 0,
        target: 1,
        earned: false,
      },
    ],
  } as AchievementSummary;
  assert.deepEqual(
    nextAchievements(summary).map((item) => item.id),
    ["spotter_silver", "photo_finish"],
  );
});
test("activity explains reversals and refunds instead of calling all entries earnings", () => {
  const entry = {
    id: "1",
    kind: "migration_debit",
    points: -10,
    balanceDelta: -10,
    debtDelta: 0,
    sourceType: "clerk_metadata",
    reason: "sighting_base_v4",
    createdAt: "2026-10-03T00:00:00Z",
  };
  assert.equal(activityLabel(entry), "Sighting removed or adjusted");
  assert.equal(
    activityLabel({ ...entry, kind: "cancellation_credit", points: 75 }),
    "Redemption canceled · points returned",
  );
});
test("redemption retries preserve the same authenticated request and fail closed on malformed success", async () => {
  const requests: Request[] = [];
  const api = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "member-token",
    fetcher: async (request) => {
      requests.push(new Request(request));
      return Response.json({
        ok: true,
        redemptionId: "r1",
        status: "submitted",
        balance: 55,
      });
    },
  });
  const payload = {
    itemKey: "sticker_pack",
    idempotencyKey: "same-logical-request",
    confirmSavedAddress: true,
    details: {},
  };
  await api.redeemReward(payload);
  await api.redeemReward(payload);
  assert.equal(requests[0].headers.get("authorization"), "Bearer member-token");
  assert.deepEqual(await requests[0].json(), await requests[1].json());
  const bad = createMobileApi({
    baseUrl: "https://example.test",
    getToken: async () => "member-token",
    fetcher: async () => Response.json({ ok: true }),
  });
  await assert.rejects(() => bad.redeemReward(payload), /invalid response/i);
});
