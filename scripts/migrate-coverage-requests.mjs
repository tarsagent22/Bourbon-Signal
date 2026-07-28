#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const DATABASE_ENVIRONMENT_VARIABLE = "BOURBON_QUEUE_DATABASE_URL_UNPOOLED";
const MIGRATION_VERSION = "coverage-requests-v2";

function option(args, name) {
  const exact = args.indexOf(name);
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (exact >= 0 && inline) throw new Error(`${name} may only be supplied once.`);
  if (exact >= 0) {
    const value = args[exact + 1] || "";
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
    return value;
  }
  return inline?.slice(name.length + 1) || "";
}

function normalizedTarget(value) {
  const target = value.trim();
  if (!target || /:\/\//.test(target) || target.includes("@") || target.split("/").length !== 2) {
    throw new Error("--target must use <hostname>/<database> without credentials.");
  }
  return target.toLowerCase();
}

function configuredTarget(connectionString) {
  const parsed = new URL(connectionString);
  const database = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ""));
  if (!parsed.hostname || !database || database.includes("/")) {
    throw new Error(`${DATABASE_ENVIRONMENT_VARIABLE} must identify one PostgreSQL database.`);
  }
  return `${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ""}/${database.toLowerCase()}`;
}

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const check = args.includes("--check");
const target = option(args, "--target");
if (apply && check) throw new Error("Choose either --check or --apply.");
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--target") {
    index += 1;
    continue;
  }
  if (argument.startsWith("--target=") || argument === "--apply" || argument === "--check") continue;
  throw new Error(`Unknown migration argument: ${argument}`);
}

const schema = await readFile(new URL("../src/lib/coverage-request-schema.sql", import.meta.url), "utf8");
const statements = schema.split(";").map((statement) => statement.trim()).filter(Boolean);
if (!apply) {
  if (target) throw new Error("--target is only accepted with --apply.");
  console.log(JSON.stringify({
    ok: true,
    mode: "plan",
    checkOnly: true,
    migration: MIGRATION_VERSION,
    schemaStatements: statements.length,
    applyCommand: "npm run migrate:coverage-requests:apply -- --target <hostname>/<database>",
  }, null, 2));
  process.exit(0);
}

const requestedTarget = normalizedTarget(target);
const connectionString = process.env[DATABASE_ENVIRONMENT_VARIABLE];
if (!connectionString) throw new Error(`Apply mode requires ${DATABASE_ENVIRONMENT_VARIABLE}.`);
const actualTarget = configuredTarget(connectionString);
if (requestedTarget !== actualTarget) {
  throw new Error(`Requested target ${requestedTarget} does not match configured target ${actualTarget}.`);
}

const sql = neon(connectionString);
await sql.transaction((transaction) => statements.map((statement) => transaction.query(statement)));
const verification = await sql.query(`
  SELECT
    to_regclass('public.coverage_requests') AS coverage_requests,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.coverage_requests'::regclass
        AND contype = 'u'
        AND pg_get_constraintdef(oid) = 'UNIQUE (user_id, canonical_target_key)'
    ) AS has_unique_target,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.coverage_requests'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%target_type%state%county%city%store%'
    ) AS has_target_type_check,
    EXISTS (
      SELECT 1
      FROM pg_constraint
      WHERE conrelid = 'public.coverage_requests'::regclass
        AND contype = 'c'
        AND pg_get_constraintdef(oid) LIKE '%status%requested%on_radar%improved%closed%'
    ) AS has_status_check,
    to_regclass('public.coverage_requests_user_updated_idx') IS NOT NULL AS has_user_index,
    to_regclass('public.coverage_requests_demand_idx') IS NOT NULL AS has_demand_index,
    (
      SELECT column_default = 'false'
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = 'coverage_requests'
        AND column_name = 'notification_enabled'
    ) AS has_opt_in_default
`);
const schemaReady = verification[0]
  && verification[0].coverage_requests
  && verification[0].has_unique_target === true
  && verification[0].has_target_type_check === true
  && verification[0].has_status_check === true
  && verification[0].has_user_index === true
  && verification[0].has_demand_index === true
  && verification[0].has_opt_in_default === true;
if (!schemaReady) {
  throw new Error("Coverage request schema verification failed.");
}
console.log(JSON.stringify({ ok: true, mode: "apply", migration: MIGRATION_VERSION, target: actualTarget }, null, 2));
