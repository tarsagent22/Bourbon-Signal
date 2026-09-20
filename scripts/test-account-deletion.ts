import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  AccountDeletionRecentAuthenticationError,
  drainAccountDeletionCleanup,
  recentAuthenticationIsValid,
  requestAccountDeletion,
} from "../src/lib/account-deletion.ts";

test("account deletion requires a recent first-factor verification", () => {
  assert.equal(recentAuthenticationIsValid([0, -1]), true);
  assert.equal(recentAuthenticationIsValid([9, 3]), true);
  assert.equal(recentAuthenticationIsValid([11, 0]), false);
  assert.equal(recentAuthenticationIsValid(null), false);
});

test("account deletion durably queues first, clears delivery/data, revokes every session, bans, then deletes identity", async () => {
  const calls: string[] = [];
  const result = await requestAccountDeletion({
    userId: "user_test",
    factorVerificationAge: [1, -1],
    now: "2026-09-13T20:30:00.000Z",
    repository: {
      begin: async () => { calls.push("begin"); return { requestId: "delete_1" }; },
      eraseOwnedProductDataAndDisableDelivery: async () => { calls.push("cleanup"); return ["push_devices", "queued_alerts", "collection", "community_sightings"]; },
      recordOutcome: async (_userId, outcome) => { calls.push(`outcome:${outcome.identityDeleted}`); },
    },
    identityProvider: {
      disableDeliveryMetadata: async () => { calls.push("disable-metadata"); },
      listSessionIds: async () => { calls.push("list-sessions"); return ["session_a", "session_b"]; },
      revokeSession: async (id) => { calls.push(`revoke:${id}`); },
      banUser: async () => { calls.push("ban"); },
      deleteUser: async () => { calls.push("delete-user"); },
    },
  });

  assert.deepEqual(calls, [
    "begin", "cleanup", "disable-metadata", "list-sessions", "revoke:session_a", "revoke:session_b", "ban", "delete-user", "outcome:true",
  ]);
  assert.equal(result.identityDeleted, true);
  assert.equal(result.accessRevoked, true);
  assert.equal(result.status, "completed");
  assert.deepEqual(result.remainingCleanup, []);
});

test("a cleanup failure disables delivery metadata but preserves the identity for an authenticated retry", async () => {
  const calls: string[] = [];
  const result = await requestAccountDeletion({
    userId: "user_test",
    factorVerificationAge: [0, 0],
    repository: {
      begin: async () => ({ requestId: "delete_2" }),
      eraseOwnedProductDataAndDisableDelivery: async () => { calls.push("cleanup"); throw new Error("database unavailable"); },
      recordOutcome: async () => { calls.push("outcome"); },
    },
    identityProvider: {
      disableDeliveryMetadata: async () => { calls.push("disable-metadata"); },
      listSessionIds: async () => ["session_a"],
      revokeSession: async () => { calls.push("revoke"); },
      banUser: async () => { calls.push("ban"); },
      deleteUser: async () => { calls.push("delete-user"); },
    },
  });
  assert.deepEqual(calls, ["cleanup", "disable-metadata", "outcome"]);
  assert.equal(result.accessRevoked, false);
  assert.equal(result.identityDeleted, false);
  assert.ok(result.remainingCleanup.includes("application_data_cleanup_retry"));
});

test("lease loss aborts deletion before later delivery or identity mutations", async () => {
  const calls: string[] = [];
  let checks = 0;
  await assert.rejects(requestAccountDeletion({
    userId: "user_lease",
    factorVerificationAge: [0, 0],
    assertLeaseHeld: async () => { checks += 1; if (checks === 2) throw new Error("member_lease_lost"); },
    repository: {
      begin: async () => { calls.push("begin"); return { requestId: "delete_lease" }; },
      eraseOwnedProductDataAndDisableDelivery: async () => { calls.push("cleanup"); return []; },
      recordOutcome: async () => { calls.push("outcome"); },
    },
    identityProvider: {
      disableDeliveryMetadata: async () => { calls.push("disable-metadata"); }, listSessionIds: async () => [],
      revokeSession: async () => {}, banUser: async () => { calls.push("ban"); }, deleteUser: async () => { calls.push("delete-user"); },
    },
  }), /member_lease_lost/);
  assert.deepEqual(calls, ["begin"]);
});

test("account deletion rejects stale authentication before creating a tombstone", async () => {
  let began = false;
  await assert.rejects(
    requestAccountDeletion({
      userId: "user_test",
      factorVerificationAge: [30, -1],
      repository: {
        begin: async () => { began = true; return { requestId: "delete_3" }; },
        eraseOwnedProductDataAndDisableDelivery: async () => [],
        recordOutcome: async () => undefined,
      },
      identityProvider: {
        disableDeliveryMetadata: async () => undefined,
        listSessionIds: async () => [],
        revokeSession: async () => undefined,
        banUser: async () => undefined,
        deleteUser: async () => undefined,
      },
    }),
    AccountDeletionRecentAuthenticationError,
  );
  assert.equal(began, false);
});

test("account deletion does not claim access revocation when identity shutdown fails", async () => {
  const result = await requestAccountDeletion({
    userId: "user_risk",
    factorVerificationAge: [0, -1],
    repository: {
      begin: async () => ({ requestId: "delete_4" }),
      eraseOwnedProductDataAndDisableDelivery: async () => ["push_devices", "queued_alerts"],
      recordOutcome: async () => undefined,
    },
    identityProvider: {
      disableDeliveryMetadata: async () => undefined,
      listSessionIds: async () => ["session_current"],
      revokeSession: async () => undefined,
      banUser: async () => { throw new Error("ban unavailable"); },
      deleteUser: async () => { throw new Error("delete unavailable"); },
    },
  });
  assert.equal(result.accessRevoked, false);
  assert.ok(result.remainingCleanup.includes("access_revocation"));
});

test("durable cleanup retries after access was banned, deletes the identity, and terminally anonymizes the tombstone", async () => {
  const calls: string[] = [];
  let claimed = false;
  const repository = {
    begin: async () => ({ requestId: "delete_retry" }),
    eraseOwnedProductDataAndDisableDelivery: async () => { calls.push("cleanup"); return ["all_product_data"]; },
    recordOutcome: async (_userId: string, outcome: { identityDeleted: boolean }) => { calls.push(`outcome:${outcome.identityDeleted}`); },
    claimCleanupBatch: async () => {
      if (claimed) return [];
      claimed = true;
      return [{ userId: "user_banned", requestId: "delete_retry" }];
    },
    terminalize: async (userId: string, requestId: string) => { calls.push(`terminal:${userId}:${requestId}`); },
  };
  let deleteAttempts = 0;
  const identityProvider = {
    disableDeliveryMetadata: async () => { calls.push("disable-metadata"); },
    listSessionIds: async () => [],
    revokeSession: async () => undefined,
    banUser: async () => { calls.push("ban"); },
    deleteUser: async () => {
      deleteAttempts += 1;
      calls.push(`delete:${deleteAttempts}`);
      if (deleteAttempts === 1) throw new Error("Clerk unavailable");
    },
  };

  const initial = await requestAccountDeletion({
    userId: "user_banned",
    factorVerificationAge: [0, 0],
    repository,
    identityProvider,
  });
  assert.equal(initial.accessRevoked, true);
  assert.equal(initial.identityDeleted, false);
  assert.ok(initial.remainingCleanup.includes("identity_delete_retry"));

  const drained = await drainAccountDeletionCleanup({ repository, identityProvider, limit: 10 });
  assert.deepEqual(drained, { claimed: 1, completed: 1, pending: 0 });
  assert.ok(calls.includes("terminal:user_banned:delete_retry"));
});

test("a CRON_SECRET-authorized route drains deletion cleanup without member authentication", () => {
  const route = readFileSync(new URL("../src/app/api/account-deletion/cleanup/route.ts", import.meta.url), "utf8");
  assert.match(route, /CRON_SECRET/);
  assert.match(route, /drainAccountDeletionCleanup/);
  assert.match(route, /createAccountDeletionIdentityProvider/);
  assert.doesNotMatch(route, /await auth\(/);
});
