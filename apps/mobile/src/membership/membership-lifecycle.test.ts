import assert from "node:assert/strict";
import test from "node:test";
import type { AppleMembershipSummary, MemberProfile } from "../api/types";
import {
  DOWNGRADE_DATA_NOTICE,
  deriveMobileMembershipLifecycle,
  monthlyTrialIsEligible,
} from "./membership-lifecycle";
import type { PurchaseFlowStatus } from "./purchases";

function profile(tier: MemberProfile["profile"]["membership"]["tier"]): MemberProfile["profile"] {
  return {
    identity: tier === "bottled-in-bond" ? { kind: "founder", number: 7, label: "Founder #7" } : null,
    displayName: "Member",
    customDisplayName: null,
    feedAreas: { states: [] },
    membership: { tier, label: tier, paid: tier !== "free", hasBetaAccess: false },
    entitlements: { fullFeed: tier !== "free", canSubmitSignals: true },
  };
}

function apple(status: AppleMembershipSummary["status"], productId: AppleMembershipSummary["productId"] = "com.bourbonsignal.app.standard.monthly"): AppleMembershipSummary {
  return {
    productId,
    status,
    environment: "sandbox",
    expiresAt: "2026-10-13T20:00:00.000Z",
    offerState: status === "trialing" ? "introductory_trial" : "none",
    updatedAt: "2026-09-13T20:00:00.000Z",
  };
}

function lifecycle(input: {
  tier?: MemberProfile["profile"]["membership"]["tier"];
  purchaseStatus?: PurchaseFlowStatus;
  membership?: AppleMembershipSummary | null;
}) {
  return deriveMobileMembershipLifecycle({
    profile: profile(input.tier ?? "free"),
    purchaseStatus: input.purchaseStatus ?? "ready",
    appleMembership: input.membership ?? null,
  });
}

test("canonical mobile lifecycle covers every launch membership state", () => {
  const cases: Array<[ReturnType<typeof lifecycle>, string]> = [
    [lifecycle({ tier: "free" }), "free"],
    [lifecycle({ purchaseStatus: "pending" }), "purchase_pending"],
    [lifecycle({ tier: "standard", membership: apple("trialing") }), "trialing"],
    [lifecycle({ tier: "standard", membership: apple("active") }), "active"],
    [lifecycle({ tier: "standard", membership: apple("grace_period") }), "grace_period"],
    [lifecycle({ tier: "free", membership: apple("billing_issue") }), "billing_retry"],
    [lifecycle({ tier: "standard", membership: apple("canceled_period_end") }), "canceled_at_period_end"],
    [lifecycle({ membership: apple("expired") }), "expired"],
    [lifecycle({ membership: apple("refunded") }), "refunded_or_revoked"],
    [lifecycle({ membership: apple("revoked") }), "refunded_or_revoked"],
    [lifecycle({ tier: "bottled-in-bond", purchaseStatus: "unavailable" }), "founder"],
    [lifecycle({ purchaseStatus: "unavailable" }), "provider_unavailable"],
  ];
  assert.deepEqual(cases.map(([value]) => value.state), cases.map(([, expected]) => expected));
});

test("Founder and active server authority outrank provider availability while pending never grants access", () => {
  assert.equal(lifecycle({ tier: "bottled-in-bond", purchaseStatus: "error" }).state, "founder");
  assert.equal(lifecycle({ tier: "barrel", purchaseStatus: "unavailable" }).state, "active");
  const pending = lifecycle({ purchaseStatus: "pending" });
  assert.equal(pending.state, "purchase_pending");
  assert.equal(pending.accessActive, false);
  assert.match(pending.detail, /not changed|confirmed/i);
});

test("downgrades preserve saved data and only block additions above the current limit", () => {
  assert.match(DOWNGRADE_DATA_NOTICE, /saved.*stay/i);
  assert.match(DOWNGRADE_DATA_NOTICE, /additions.*limit/i);
  for (const status of ["expired", "refunded", "revoked"] as const) {
    assert.equal(lifecycle({ membership: apple(status) }).preservationNotice, DOWNGRADE_DATA_NOTICE);
  }
});

test("trial copy requires affirmative account and StoreKit eligibility and only applies monthly", () => {
  assert.equal(monthlyTrialIsEligible({ tier: "standard", interval: "monthly", accountEligible: true, storeEligible: true }), true);
  assert.equal(monthlyTrialIsEligible({ tier: "barrel", interval: "monthly", accountEligible: true, storeEligible: true }), true);
  assert.equal(monthlyTrialIsEligible({ tier: "standard", interval: "monthly", accountEligible: undefined, storeEligible: true }), false);
  assert.equal(monthlyTrialIsEligible({ tier: "standard", interval: "monthly", accountEligible: true, storeEligible: undefined }), false);
  assert.equal(monthlyTrialIsEligible({ tier: "standard", interval: "annual", accountEligible: true, storeEligible: true }), false);
  assert.equal(monthlyTrialIsEligible({ tier: "bottled-in-bond", interval: "lifetime", accountEligible: true, storeEligible: true }), false);
});
