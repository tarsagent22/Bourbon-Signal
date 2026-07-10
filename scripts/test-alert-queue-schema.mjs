import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const schema = readFileSync(new URL("../src/lib/alert-queue/schema.sql", import.meta.url), "utf8");
assert.match(schema, /create table if not exists alert_candidates/i);
assert.match(schema, /unique\s*\(\s*user_id\s*,\s*channel\s*,\s*stable_match_key\s*,\s*alert_window\s*\)/i);
assert.match(schema, /create table if not exists alert_deliveries/i);
assert.match(schema, /create table if not exists alert_baselines/i);
assert.match(schema, /unique\s*\(\s*user_id\s*,\s*channel\s*,\s*stable_match_key\s*\)/i);
assert.match(schema, /check\s*\(\s*status in \('pending', 'claimed', 'delivered', 'suppressed', 'failed'\)\s*\)/i);
console.log("Alert queue Postgres schema contract passed.");
