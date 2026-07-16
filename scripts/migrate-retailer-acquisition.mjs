#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const DATABASE_ENVIRONMENT_VARIABLE = "BOURBON_QUEUE_DATABASE_URL_UNPOOLED";
const MIGRATION_VERSION = "retailer-acquisition-v4";

function option(args, name) {
  const exactIndex = args.indexOf(name);
  const inline = args.find((argument) => argument.startsWith(`${name}=`));
  if (exactIndex >= 0 && inline) throw new Error(`${name} may only be supplied once.`);
  if (exactIndex >= 0) {
    const value = args[exactIndex + 1] || "";
    if (!value || value.startsWith("--")) throw new Error(`${name} requires a value.`);
    return value;
  }
  return inline?.slice(name.length + 1) || "";
}

function normalizedTarget(value) {
  const target = value.trim();
  if (!target) throw new Error("Apply mode requires --target <hostname>/<database>.");
  if (/:\/\/|@|[?#]/.test(target)) {
    throw new Error("--target must contain only <hostname>/<database>; do not pass a connection URL or credentials.");
  }
  const separator = target.indexOf("/");
  if (separator <= 0 || separator === target.length - 1 || target.indexOf("/", separator + 1) >= 0) {
    throw new Error("--target must use the exact <hostname>/<database> format.");
  }
  const host = target.slice(0, separator).trim().toLowerCase();
  const database = target.slice(separator + 1).trim();
  if (!host || !database || /\s/.test(host) || /\s/.test(database)) {
    throw new Error("--target must use the exact <hostname>/<database> format.");
  }
  return `${host}/${database}`;
}

function configuredTarget(connectionString) {
  let parsed;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error(`${DATABASE_ENVIRONMENT_VARIABLE} must be a valid PostgreSQL connection URL.`);
  }
  if (!["postgres:", "postgresql:"].includes(parsed.protocol) || !parsed.hostname) {
    throw new Error(`${DATABASE_ENVIRONMENT_VARIABLE} must be a valid PostgreSQL connection URL.`);
  }
  let database = "";
  try {
    database = decodeURIComponent(parsed.pathname.replace(/^\/+|\/+$/g, ""));
  } catch {
    throw new Error(`${DATABASE_ENVIRONMENT_VARIABLE} must identify a database with a valid URL-encoded name.`);
  }
  if (!database || database.includes("/")) {
    throw new Error(`${DATABASE_ENVIRONMENT_VARIABLE} must identify one explicit database name.`);
  }
  const host = `${parsed.hostname.toLowerCase()}${parsed.port ? `:${parsed.port}` : ""}`;
  return `${host}/${database}`;
}

function splitSqlStatements(source) {
  const statements = [];
  let current = "";
  let singleQuoted = false;
  let doubleQuoted = false;
  let lineComment = false;
  let blockComment = false;
  let dollarTag = "";

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    current += character;

    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        current += next;
        index += 1;
        blockComment = false;
      }
      continue;
    }
    if (dollarTag) {
      if (source.startsWith(dollarTag, index)) {
        current += source.slice(index + 1, index + dollarTag.length);
        index += dollarTag.length - 1;
        dollarTag = "";
      }
      continue;
    }
    if (singleQuoted) {
      if (character === "'" && next === "'") {
        current += next;
        index += 1;
      } else if (character === "'") singleQuoted = false;
      continue;
    }
    if (doubleQuoted) {
      if (character === '"' && next === '"') {
        current += next;
        index += 1;
      } else if (character === '"') doubleQuoted = false;
      continue;
    }

    if (character === "-" && next === "-") {
      current += next;
      index += 1;
      lineComment = true;
    } else if (character === "/" && next === "*") {
      current += next;
      index += 1;
      blockComment = true;
    } else if (character === "'") singleQuoted = true;
    else if (character === '"') doubleQuoted = true;
    else if (character === "$") {
      const match = source.slice(index).match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/);
      if (match) {
        dollarTag = match[0];
        current += source.slice(index + 1, index + dollarTag.length);
        index += dollarTag.length - 1;
      }
    } else if (character === ";") {
      const statement = current.slice(0, -1).trim();
      if (statement) statements.push(statement);
      current = "";
    }
  }

  if (singleQuoted || doubleQuoted || blockComment || dollarTag) throw new Error("Retailer acquisition schema contains unterminated SQL.");
  if (current.trim()) statements.push(current.trim());
  return statements;
}

const schema = await readFile(new URL("../src/lib/retailer-prospect-schema.sql", import.meta.url), "utf8");
const statements = splitSqlStatements(schema);
const args = process.argv.slice(2);
const apply = args.includes("--apply");
const check = args.includes("--check");
const targetArgument = option(args, "--target");
const recognizedArguments = new Set(["--apply", "--check", "--target"]);
for (let index = 0; index < args.length; index += 1) {
  const argument = args[index];
  if (argument === "--target") {
    index += 1;
    continue;
  }
  if (argument.startsWith("--target=")) continue;
  if (!recognizedArguments.has(argument)) throw new Error(`Unknown migration argument: ${argument}.`);
}
if (apply && check) throw new Error("Choose either --check or --apply; schema mutation requires --apply only.");
if (!apply) {
  if (targetArgument) throw new Error("--target is only used with --apply.");
  console.log(JSON.stringify({
    ok: true,
    mode: "plan",
    checkOnly: true,
    migration: MIGRATION_VERSION,
    schemaStatements: statements.length,
    functionStatements: statements.filter((statement) => /CREATE OR REPLACE FUNCTION/i.test(statement)).length,
    applyCommand: "npm run migrate:retailer-acquisition:apply -- --target <hostname>/<database>",
  }, null, 2));
  process.exit(0);
}
const requestedTarget = normalizedTarget(targetArgument);
const connectionString = process.env[DATABASE_ENVIRONMENT_VARIABLE];
if (!connectionString) {
  throw new Error(`Apply mode requires ${DATABASE_ENVIRONMENT_VARIABLE}; generic database URL fallbacks are not accepted.`);
}
const actualTarget = configuredTarget(connectionString);
if (requestedTarget !== actualTarget) {
  throw new Error(`Requested target ${requestedTarget} does not match configured target ${actualTarget}.`);
}
const sql = neon(connectionString);
await sql.transaction((transaction) => [
  ...statements.map((statement) => transaction.query(statement)),
  transaction.query(`
    INSERT INTO retailer_acquisition_migrations (version)
    VALUES ($1)
    ON CONFLICT (version) DO NOTHING
  `, [MIGRATION_VERSION]),
]);

const verification = await sql.query(`
  SELECT
    to_regclass('public.retailer_prospects') AS prospects,
    to_regclass('public.retailer_regulator_authorities') AS authorities,
    to_regclass('public.retailer_prospect_contact_evidence') AS evidence,
    to_regclass('public.retailer_prospect_message_versions') AS messages,
    to_regclass('public.retailer_prospect_approval_packets') AS packets,
    to_regclass('public.retailer_prospect_outreach') AS outreach,
    to_regclass('public.retailer_acquisition_migrations') AS migrations,
    to_regprocedure('public.approve_retailer_prospect_message(text,integer,text,text,text)') AS approve_function,
    to_regprocedure('public.record_retailer_prospect_outreach(text,text,text,text,text,timestamptz,text)') AS outreach_function
`);
const result = verification[0] || {};
const missing = Object.entries(result).filter(([, value]) => !value).map(([key]) => key);
if (missing.length) throw new Error(`Retailer acquisition schema verification failed: missing ${missing.join(", ")}.`);

console.log(JSON.stringify({ ok: true, mode: "apply", migration: MIGRATION_VERSION, target: actualTarget, schemaStatements: statements.length }, null, 2));
