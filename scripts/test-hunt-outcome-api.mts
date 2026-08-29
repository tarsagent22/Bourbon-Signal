import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHuntOutcomeApi } from "../src/lib/hunt-outcome-api.ts";
import type {
  HuntOutcomeRecord,
  HuntOutcomeSignalReference,
} from "../src/lib/hunt-outcome-repository.ts";

class MemoryRepository {
  records = new Map<string, HuntOutcomeRecord>();
  writes: Array<{ userId: string; signal: HuntOutcomeSignalReference; outcome: string }> = [];

  private key(userId: string, episodeId: string) {
    return `${userId}|${episodeId}`;
  }

  async getForUser(userId: string, episodeId: string) {
    return this.records.get(this.key(userId, episodeId)) || null;
  }

  async setForUser(userId: string, signal: HuntOutcomeSignalReference, outcome: HuntOutcomeRecord["outcome"], now: string) {
    this.writes.push({ userId, signal, outcome });
    const key = this.key(userId, signal.availabilityEpisodeId);
    const current = this.records.get(key);
    const record: HuntOutcomeRecord = {
      signalId: signal.signalId,
      availabilityEpisodeId: signal.availabilityEpisodeId,
      outcome,
      sourceType: signal.sourceType,
      stateCode: signal.stateCode || null,
      submittedAt: current?.submittedAt || now,
      updatedAt: current?.outcome === outcome ? current.updatedAt : now,
    };
    this.records.set(key, record);
    return record;
  }

  async removeForUser(userId: string, episodeId: string) {
    return this.records.delete(this.key(userId, episodeId));
  }
}

const accessibleSignal = {
  id: "trusted_source:drop-123",
  kind: "availability",
  availabilityEpisodeId: "episode:drop-123:2026-08-29T12:00:00.000Z",
  source: { type: "trusted_source" },
  location: { state: "KY" },
};
const repository = new MemoryRepository();
const api = createHuntOutcomeApi({
  repository,
  readSignal: async (_request, signalId) => signalId === accessibleSignal.id
    ? Response.json({ signal: accessibleSignal })
    : signalId === "trusted_source:private"
      ? Response.json({ error: "Forbidden" }, { status: 403 })
      : Response.json({ error: "Signal not found" }, { status: 404 }),
  now: () => "2026-08-29T13:00:00.000Z",
});
const request = (method: string, body?: unknown) => new Request(`https://www.bourbonsignal.com/api/v1/signals/${encodeURIComponent(accessibleSignal.id)}/outcome`, {
  method,
  headers: { Authorization: "Bearer mobile-session-token", "Content-Type": "application/json" },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});

const empty = await api.get(request("GET"), accessibleSignal.id, "user-a");
assert.equal(empty.status, 200);
assert.deepEqual(await empty.json(), { contractVersion: "bourbon-signal/mobile-api@1", outcome: null });
assert.equal(empty.headers.get("cache-control"), "private, no-store");
assert.match(String(empty.headers.get("vary")), /Authorization/);

const saved = await api.put(request("PUT", {
  outcome: "found_it",
  sourceType: "member",
  stateCode: "OH",
  userId: "spoofed-user",
}), accessibleSignal.id, "user-a");
assert.equal(saved.status, 200);
const savedPayload = await saved.json();
assert.equal(savedPayload.outcome.outcome, "found_it");
assert.equal(savedPayload.outcome.sourceType, "trusted_source", "source type comes from the accessible Signal, not request input");
assert.equal(savedPayload.outcome.stateCode, "KY", "state comes from the accessible Signal, not request input");
assert.equal(savedPayload.outcome.availabilityEpisodeId, accessibleSignal.availabilityEpisodeId);
assert.equal(JSON.stringify(savedPayload).includes("user-a"), false, "the response never exposes respondent identity");
assert.equal(JSON.stringify(savedPayload).includes("spoofed-user"), false);
assert.equal("total" in savedPayload, false, "the member API never exposes aggregate totals");

const own = await api.get(request("GET"), accessibleSignal.id, "user-a");
assert.equal((await own.json()).outcome.outcome, "found_it");
const otherMember = await api.get(request("GET"), accessibleSignal.id, "user-b");
assert.equal((await otherMember.json()).outcome, null, "members can read only their own selection");

const invalid = await api.put(request("PUT", { outcome: "confirmed" }), accessibleSignal.id, "user-a");
assert.equal(invalid.status, 400);
assert.equal(repository.writes.length, 1, "invalid enum values never reach storage");

const missing = await api.put(request("PUT", { outcome: "didnt_go" }), "trusted_source:missing", "user-a");
assert.equal(missing.status, 404);
const inaccessible = await api.get(request("GET"), "trusted_source:private", "user-a");
assert.equal(inaccessible.status, 404, "inaccessible and unknown IDs share a non-enumerable response");
assert.equal(repository.writes.length, 1);

const removedWithNull = await api.put(request("PUT", { outcome: null }), accessibleSignal.id, "user-a");
assert.equal(removedWithNull.status, 200);
assert.equal((await removedWithNull.json()).outcome, null);
const removedAgain = await api.remove(request("DELETE"), accessibleSignal.id, "user-a");
assert.equal(removedAgain.status, 200);
assert.equal((await removedAgain.json()).outcome, null, "removal remains idempotent");

const route = readFileSync(new URL("../src/app/api/v1/signals/[id]/outcome/route.ts", import.meta.url), "utf8");
for (const method of ["GET", "PUT", "DELETE"]) {
  const start = route.indexOf(`export async function ${method}`);
  assert.ok(start >= 0, `${method} is available to web and mobile clients`);
  const nextExport = route.indexOf("export async function ", start + 1);
  const methodSource = route.slice(start, nextExport < 0 ? route.length : nextExport);
  assert.match(methodSource, /await auth\(\)/, `${method} requires Clerk authentication`);
  assert.match(methodSource, /if \(!userId\)/, `${method} rejects unauthenticated requests`);
}
assert.match(route, /getSignalDetail/, "the endpoint resolves access through the existing Signal detail API");
assert.doesNotMatch(route, /aggregatePrivate|totalResponses|foundItRate/, "private aggregates are not exposed from the member route");
const webClient = readFileSync(new URL("../src/lib/signals/signal-api-client.ts", import.meta.url), "utf8");
const mobileClient = readFileSync(new URL("../apps/mobile/src/api/client.ts", import.meta.url), "utf8");
for (const client of [webClient, mobileClient]) assert.match(client, /setHuntOutcome[\s\S]*?method:\s*"PUT"/);

console.log("Hunt Outcome API tests passed.");
