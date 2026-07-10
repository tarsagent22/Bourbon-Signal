import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../src/lib/alert-queue/schema.sql", import.meta.url), "utf8");
assert.match(schema, /create table if not exists alert_candidates/i);
assert.match(schema, /unique\s*\(\s*user_id\s*,\s*channel\s*,\s*stable_match_key\s*,\s*alert_window\s*\)/i);
assert.match(schema, /create table if not exists alert_deliveries/i);
assert.match(schema, /create table if not exists alert_baselines/i);
assert.match(schema, /unique\s*\(\s*user_id\s*,\s*channel\s*,\s*stable_match_key\s*\)/i);
assert.match(schema, /check\s*\(\s*status in \('pending', 'claimed', 'delivered', 'suppressed', 'failed'\)\s*\)/i);
assert.match(schema, /provider_message_id\s+text/i);
assert.match(schema, /attempt_count\s+integer/i);
assert.match(schema, /next_attempt_at\s+timestamptz/i);
assert.match(schema, /create table if not exists clerk_alert_metadata_backups/i);
assert.match(schema, /migration_id\s+text/i);
assert.match(schema, /unique\s*\(user_id, channel, stable_match_key\)/i);
console.log("Alert queue Postgres schema contract passed.");
