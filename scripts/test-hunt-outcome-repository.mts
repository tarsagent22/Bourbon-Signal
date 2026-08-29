import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  HuntOutcomeRepository,
  type HuntOutcomeRecord,
} from "../src/lib/hunt-outcome-repository.ts";

type StoredRow = {
  user_id: string;
  signal_id: string;
  availability_episode_id: string;
  outcome: string;
  source_type: string;
  state_code: string | null;
  submitted_at: string;
  updated_at: string;
};

class RecordingExecutor {
  calls: Array<{ text: string; params: unknown[] }> = [];
  rows: StoredRow[] = [];

  async query(text: string, params: unknown[] = []) {
    this.calls.push({ text, params });
    if (/INSERT INTO hunt_outcomes/i.test(text)) {
      const [userId, signalId, episodeId, outcome, sourceType, stateCode, updatedAt] = params as string[];
      let current = this.rows.find((row) => row.user_id === userId && row.availability_episode_id === episodeId);
      if (!current) {
        current = {
          user_id: userId,
          signal_id: signalId,
          availability_episode_id: episodeId,
          outcome,
          source_type: sourceType,
          state_code: stateCode || null,
          submitted_at: updatedAt,
          updated_at: updatedAt,
        };
        this.rows.push(current);
      } else if (
        current.signal_id !== signalId
        || current.outcome !== outcome
        || current.source_type !== sourceType
        || current.state_code !== (stateCode || null)
      ) {
        Object.assign(current, {
          signal_id: signalId,
          outcome,
          source_type: sourceType,
          state_code: stateCode || null,
          updated_at: updatedAt,
        });
      }
      return [{ ...current }];
    }
    if (/DELETE FROM hunt_outcomes/i.test(text)) {
      const [userId, episodeId] = params as string[];
      const before = this.rows.length;
      this.rows = this.rows.filter((row) => row.user_id !== userId || row.availability_episode_id !== episodeId);
      return before === this.rows.length ? [] : [{ availability_episode_id: episodeId }];
    }
    if (/FROM hunt_outcomes/i.test(text)) {
      const [userId, episodeId] = params as string[];
      return this.rows
        .filter((row) => row.user_id === userId && row.availability_episode_id === episodeId)
        .map((row) => ({ ...row }));
    }
    throw new Error(`Unexpected query: ${text}`);
  }
}

const signal = {
  signalId: "trusted_source:drop-123",
  availabilityEpisodeId: "episode:drop-123:2026-08-29T12:00:00.000Z",
  sourceType: "trusted_source" as const,
  stateCode: "KY",
};
const executor = new RecordingExecutor();
const repository = new HuntOutcomeRepository(executor);

const first = await repository.setForUser("user-a", signal, "found_it", "2026-08-29T13:00:00.000Z");
assert.deepEqual(first, {
  signalId: signal.signalId,
  availabilityEpisodeId: signal.availabilityEpisodeId,
  outcome: "found_it",
  sourceType: "trusted_source",
  stateCode: "KY",
  submittedAt: "2026-08-29T13:00:00.000Z",
  updatedAt: "2026-08-29T13:00:00.000Z",
} satisfies HuntOutcomeRecord);

const replay = await repository.setForUser("user-a", signal, "found_it", "2026-08-29T14:00:00.000Z");
assert.equal(replay.updatedAt, first.updatedAt, "replaying the same choice is a timestamp-idempotent update");
assert.equal(replay.submittedAt, first.submittedAt, "replaying never changes the initial submission time");

const replacement = await repository.setForUser("user-a", signal, "gone_when_checked", "2026-08-29T15:00:00.000Z");
assert.equal(replacement.outcome, "gone_when_checked", "a later choice replaces the prior value");
assert.equal(replacement.submittedAt, first.submittedAt, "replacement retains the initial submission time");
assert.equal(replacement.updatedAt, "2026-08-29T15:00:00.000Z");

await repository.setForUser("user-b", signal, "didnt_go", "2026-08-29T15:30:00.000Z");
await repository.setForUser("user-a", {
  ...signal,
  availabilityEpisodeId: "episode:drop-123:2026-09-02T12:00:00.000Z",
}, "found_it", "2026-09-02T13:00:00.000Z");
assert.equal(executor.rows.length, 3, "members and later availability episodes receive independent rows");
assert.equal((await repository.getForUser("user-b", signal.availabilityEpisodeId))?.outcome, "didnt_go");

assert.equal(await repository.removeForUser("user-a", signal.availabilityEpisodeId), true);
assert.equal(await repository.removeForUser("user-a", signal.availabilityEpisodeId), false, "removal is idempotent");
assert.equal(await repository.getForUser("user-a", signal.availabilityEpisodeId), null);
assert.equal((await repository.getForUser("user-b", signal.availabilityEpisodeId))?.outcome, "didnt_go", "removal is private to the authenticated member");

await assert.rejects(
  () => repository.setForUser("user-a", signal, "confirmed" as never),
  /valid Hunt Outcome/i,
  "repository validation rejects values outside the locked enum",
);

const upsertSql = executor.calls.find((call) => /INSERT INTO hunt_outcomes/i.test(call.text))?.text || "";
assert.match(upsertSql, /ON CONFLICT\s*\(user_id, availability_episode_id\)/i, "replacement is atomic on member plus episode");
assert.match(upsertSql, /IS DISTINCT FROM/i, "identical requests do not rewrite timestamps");
for (const call of executor.calls.filter((call) => /FROM hunt_outcomes|DELETE FROM hunt_outcomes/i.test(call.text))) {
  assert.match(call.text, /user_id\s*=\s*\$1/i, "member reads and removals are scoped by authenticated user id");
}

const schema = readFileSync(new URL("../src/lib/hunt-outcome-schema.sql", import.meta.url), "utf8");
assert.match(schema, /PRIMARY KEY\s*\(user_id, availability_episode_id\)/i);
assert.match(schema, /CHECK\s*\(outcome IN \('found_it', 'gone_when_checked', 'didnt_go'\)\)/i);
assert.match(schema, /submitted_at\s+TIMESTAMPTZ\s+NOT NULL/i);
assert.match(schema, /updated_at\s+TIMESTAMPTZ\s+NOT NULL/i);
assert.match(schema, /CHECK\s*\(source_type IN \('member', 'retailer', 'trusted_source', 'release_source'\)\)/i);

const migration = readFileSync(new URL("./migrate-app-storage.mjs", import.meta.url), "utf8");
assert.match(migration, /hunt-outcome-schema\.sql/, "durable app storage applies the Hunt Outcome schema");
assert.match(migration, /'hunt_outcomes'/, "durable app storage verifies the Hunt Outcome table");

console.log("Hunt Outcome repository tests passed.");
