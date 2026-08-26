import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import type { BottleContribution } from "../src/lib/bottle-contributions.ts";

const loadedContributions = await import("../src/lib/bottle-contributions.ts");
const contributionsModule = ((loadedContributions as { default?: unknown }).default || loadedContributions) as typeof import("../src/lib/bottle-contributions.ts");
const { addBottleContribution, deterministicBottleContributionId } = contributionsModule;
const loadedRepository = await import("../src/lib/bottle-contribution-repository.ts");
const repositoryModule = ((loadedRepository as { default?: unknown }).default || loadedRepository) as typeof import("../src/lib/bottle-contribution-repository.ts");
const { BottleContributionRepository } = repositoryModule;
const loadedIdempotency = await import("../src/lib/bottle-contribution-idempotency.ts");
const idempotencyModule = ((loadedIdempotency as { default?: unknown }).default || loadedIdempotency) as typeof import("../src/lib/bottle-contribution-idempotency.ts");
const { validBottleContributionIdempotencyKey } = idempotencyModule;

const timestamp = "2026-08-25T12:00:00.000Z";

function contribution(overrides: Partial<BottleContribution> = {}): BottleContribution {
  return {
    id: "bottle_idem_v1_example",
    rawName: "Example Bourbon",
    normalizedName: "example bourbon",
    source: "collection",
    userId: "user_example",
    context: {},
    status: "new",
    duplicateCount: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
  };
}

test("validates the optional bottle contribution idempotency header contract", () => {
  for (const key of ["cellar-local-12345678", "12345678", "a.b_c:d-e"]) {
    assert.equal(validBottleContributionIdempotencyKey(key), key);
  }
  assert.equal(validBottleContributionIdempotencyKey(" 12345678 "), "12345678", "the bottle route matches the sightings trim contract");
  for (const key of ["short", "contains space", "bad/slash", "x".repeat(121)]) {
    assert.equal(validBottleContributionIdempotencyKey(key), null);
  }
  assert.equal(validBottleContributionIdempotencyKey(null), null);

  const route = readFileSync(new URL("../src/app/api/bottle-contributions/route.ts", import.meta.url), "utf8");
  assert.match(route, /req\.headers\.get\(["']Idempotency-Key["']\)/);
  assert.match(route, /rawIdempotencyKey[\s\S]*Invalid Idempotency-Key[\s\S]*status:\s*400/);
  assert.match(route, /addBottleContribution\(\{[\s\S]*userId[\s\S]*idempotencyKey/);
  assert.doesNotMatch(route, /userId:\s*payload\./, "the authenticated route must never bind idempotency to a client user id");
});

test("deterministic contribution ids replay by authenticated user and key without exposing either", async () => {
  const inserted = new Map<string, BottleContribution>();
  const idempotentCalls: BottleContribution[] = [];
  const repository = {
    async insertOrReplayContribution(item: BottleContribution) {
      idempotentCalls.push(item);
      const existing = inserted.get(item.id);
      if (existing) return existing;
      inserted.set(item.id, item);
      return item;
    },
    async upsertContribution() {
      throw new Error("idempotent adds must not use the duplicate-counting upsert");
    },
  };
  const dependencies = {
    repository,
    candidateMatcher: async () => ({ bottleId: "catalog-example", bottleName: "Example Bourbon", matchScore: 120, confidence: "high" as const }),
    now: () => timestamp,
  };
  const input = { rawName: "Example Bourbon", source: "collection" as const, userId: "user_123", idempotencyKey: "cellar-local-12345678" };
  const first = await addBottleContribution(input, dependencies);
  const replay = await addBottleContribution(input, dependencies);
  assert.equal(first.id, replay.id);
  assert.equal(inserted.size, 1);
  assert.equal(idempotentCalls.length, 2);
  assert.equal(first.status, "matched_existing", "candidate matching remains intact on idempotent adds");
  assert.equal(first.candidateBottleId, "catalog-example");
  assert.match(first.id, /^bottle_idem_v1_[a-f0-9]{64}$/);
  assert.doesNotMatch(first.id, /user_123|cellar-local/);

  const otherUser = deterministicBottleContributionId(input.source, "user_456", input.idempotencyKey);
  const otherKey = deterministicBottleContributionId(input.source, input.userId, "cellar-local-87654321");
  const otherSource = deterministicBottleContributionId("sighting", input.userId, input.idempotencyKey);
  assert.notEqual(first.id, otherUser);
  assert.notEqual(first.id, otherKey);
  assert.notEqual(first.id, otherSource);
  assert.equal(first.id, deterministicBottleContributionId(input.source, input.userId, input.idempotencyKey));
});

test("non-idempotent contribution callers retain the existing upsert behavior", async () => {
  const upserts: BottleContribution[] = [];
  const repository = {
    async insertOrReplayContribution() {
      throw new Error("non-idempotent adds must not use idempotent insertion");
    },
    async upsertContribution(item: BottleContribution) {
      upserts.push(item);
      return item;
    },
  };
  await addBottleContribution(
    { rawName: "Unmatched Example", source: "bottle_check" },
    { repository, candidateMatcher: async () => null, now: () => timestamp },
  );
  assert.equal(upserts.length, 1);
  assert.equal(upserts[0]?.duplicateCount, 1);
  assert.doesNotMatch(upserts[0]?.id || "", /^bottle_idem_v1_/);
});

test("the service rejects malformed idempotency keys even outside the HTTP route", async () => {
  await assert.rejects(
    addBottleContribution(
      { rawName: "Example Bourbon", source: "collection", userId: "user_123", idempotencyKey: "bad key" },
      {
        repository: {
          async insertOrReplayContribution(item) { return item; },
          async upsertContribution(item) { return item; },
        },
        candidateMatcher: async () => null,
      },
    ),
    /Invalid Idempotency-Key/,
  );
});

test("repository idempotent insert returns an inserted row without a fallback query", async () => {
  const inserted = contribution();
  const calls: Array<{ text: string; params: unknown[] }> = [];
  const query = {
    async query(text: string, params: unknown[] = []) {
      calls.push({ text, params });
      return [{ payload: inserted }];
    },
    async transaction() { return []; },
  };
  const repository = new BottleContributionRepository(query);
  assert.equal(await repository.insertOrReplayContribution(inserted), inserted);
  assert.equal(calls.length, 1);
  assert.match(calls[0]!.text, /ON CONFLICT DO NOTHING[\s\S]*RETURNING payload/);
});

test("repository falls back by deterministic id or active normalized name without incrementing duplicates", async () => {
  const incoming = contribution();
  const replayById = contribution({ status: "matched_existing", duplicateCount: 1 });
  const activeCollision = contribution({ id: "prior-active-row", duplicateCount: 4 });
  for (const existing of [replayById, activeCollision]) {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const query = {
      async query(text: string, params: unknown[] = []) {
        calls.push({ text, params });
        return calls.length === 1 ? [] : [{ payload: existing }];
      },
      async transaction() { return []; },
    };
    const repository = new BottleContributionRepository(query);
    const result = await repository.insertOrReplayContribution(incoming);
    assert.equal(result, existing);
    assert.equal(result.duplicateCount, existing.duplicateCount);
    assert.equal(calls.length, 2);
    assert.match(calls[1]!.text, /id\s*=\s*\$1/);
    assert.match(calls[1]!.text, /normalized_name\s*=\s*\$2/);
    assert.match(calls[1]!.text, /status IN \('new', 'needs_human'\)/);
    assert.deepEqual(calls[1]!.params, [incoming.id, incoming.normalizedName]);
  }
});

test("repository fails when a conflict cannot be replayed", async () => {
  const query = {
    async query() { return []; },
    async transaction() { return []; },
  };
  const repository = new BottleContributionRepository(query);
  await assert.rejects(repository.insertOrReplayContribution(contribution()), /Unable to persist or replay bottle contribution/);
});
