import assert from "node:assert/strict";
import type { CollectionBottlePreference } from "../src/lib/member-collection.ts";

const loadedRepository = await import("../src/lib/member-collection-repository.ts");
const repositoryModule = ((loadedRepository as { default?: unknown }).default || loadedRepository) as typeof import("../src/lib/member-collection-repository.ts");
const { MemberCollectionLimitError, MemberCollectionRepository } = repositoryModule;

class FakeDatabase {
  calls: Array<{ text: string; params: unknown[] }> = [];
  collections = new Map<string, { version: number; bottles: CollectionBottlePreference[] }>();

  async query(text: string, params: unknown[] = []) {
    this.calls.push({ text, params });
    if (text.includes("SELECT pg_advisory_xact_lock")) return [];
    if (text.includes("INSERT INTO member_collection_state") && !text.includes("WITH current_state")) return [];
    if (text.includes("WITH current_state") && text.includes("next_version")) {
      const userId = String(params[0]);
      const expectedVersion = Number(params[1]);
      const incoming = JSON.parse(String(params[2])) as CollectionBottlePreference[];
      const limit = params[3] == null ? null : Number(params[3]);
      const current = this.collections.get(userId) || { version: 0, bottles: [] };
      if (expectedVersion !== current.version) return [{ outcome: "conflict", version: current.version, current_count: current.bottles.length }];
      const existingKeys = new Set(current.bottles.map((bottle) => bottle.canonicalKey));
      const additions = incoming.filter((bottle) => !existingKeys.has(bottle.canonicalKey)).length;
      if (limit !== null && additions > 0 && current.bottles.length + additions > limit) {
        return [{ outcome: "collection_limit", version: current.version, current_count: current.bottles.length }];
      }
      const next = { version: current.version + 1, bottles: incoming };
      this.collections.set(userId, next);
      return [{ outcome: "saved", version: next.version, current_count: current.bottles.length }];
    }
    return [];
  }

  async transaction(factory: (executor: { query(text: string, params?: unknown[]): Promise<unknown> }) => Promise<unknown>[]) {
    return Promise.all(factory(this));
  }
}

const bottle = (index: number, rating = 80): CollectionBottlePreference => ({
  bottleId: `bottle-${index}`,
  bottleName: `Bottle ${index}`,
  canonicalKey: `bottle ${index}`,
  rating,
  isRated: true,
  tasteTags: [],
  opened: false,
  sealedQuantity: 1,
  openedQuantity: 0,
  finishedCount: 0,
  tastedOnly: false,
  notes: "",
  addedAt: "2026-08-29T12:00:00.000Z",
  updatedAt: "2026-08-29T12:00:00.000Z",
});

const database = new FakeDatabase();
const repository = new MemberCollectionRepository(database);
let freeVersion = 0;
for (let count = 1; count <= 10; count += 1) {
  const saved = await repository.replaceForUser("free-user", Array.from({ length: count }, (_, index) => bottle(index + 1)), freeVersion, { bottleLimit: 10 });
  freeVersion = saved.version;
  assert.equal(saved.bottles.length, count, `Free add ${count} is allowed`);
}

await assert.rejects(
  repository.replaceForUser("free-user", Array.from({ length: 11 }, (_, index) => bottle(index + 1)), freeVersion, { bottleLimit: 10 }),
  (error: unknown) => error instanceof MemberCollectionLimitError && error.limit === 10 && error.currentCount === 10,
  "Free add 11 is rejected with stable capacity details",
);
assert.equal(database.collections.get("free-user")?.bottles.length, 10, "a rejected addition never truncates or rewrites the collection");

const editedAtLimit = Array.from({ length: 10 }, (_, index) => bottle(index + 1, index === 0 ? 95 : 80));
const edited = await repository.replaceForUser("free-user", editedAtLimit, freeVersion, { bottleLimit: 10 });
assert.equal(edited.bottles[0]?.rating, 95, "editing at the limit remains allowed");
const deleted = await repository.replaceForUser("free-user", edited.bottles.slice(0, 9), edited.version, { bottleLimit: 10 });
assert.equal(deleted.bottles.length, 9, "deleting at the limit remains allowed");

const downgraded = Array.from({ length: 75 }, (_, index) => bottle(index + 100));
database.collections.set("downgraded-user", { version: 4, bottles: downgraded });
const downgradedEdit = await repository.replaceForUser("downgraded-user", downgraded.map((entry, index) => index === 20 ? { ...entry, notes: "Still mine" } : entry), 4, { bottleLimit: 10 });
assert.equal(downgradedEdit.bottles.length, 75, "editing a downgraded 75-bottle collection preserves every bottle");
const downgradedDelete = await repository.replaceForUser("downgraded-user", downgradedEdit.bottles.slice(0, 74), downgradedEdit.version, { bottleLimit: 10 });
assert.equal(downgradedDelete.bottles.length, 74, "downgraded members may delete existing bottles");
await assert.rejects(
  repository.replaceForUser("downgraded-user", [...downgradedDelete.bottles, bottle(999)], downgradedDelete.version, { bottleLimit: 10 }),
  MemberCollectionLimitError,
  "downgraded members cannot add a net-new canonical key",
);

for (const userId of ["standard-user", "barrel-user"]) {
  const saved = await repository.replaceForUser(userId, Array.from({ length: 80 }, (_, index) => bottle(index + 1_000)), 0, { bottleLimit: null });
  assert.equal(saved.bottles.length, 80, `${userId} has unlimited writes`);
}

const replacementSql = database.calls.find((call) => call.text.includes("WITH current_state") && call.text.includes("next_version"));
assert.match(replacementSql?.text || "", /incoming_additions/, "the locked write compares incoming canonical keys with durable existing keys");
assert.match(replacementSql?.text || "", /collection_limit/, "the durable transaction returns a distinct limit outcome");
assert.equal(database.calls.some((call) => call.text.includes("pg_advisory_xact_lock")), true, "limit checks share the existing per-user writer lock");

console.log("member collection entitlement tests passed");
