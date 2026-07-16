#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";

const connectionString = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED
  || process.env.BOURBON_QUEUE_DATABASE_URL
  || process.env.DATABASE_URL;

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
if (process.argv.includes("--check")) {
  console.log(JSON.stringify({
    ok: true,
    checkOnly: true,
    schemaStatements: statements.length,
    functionStatements: statements.filter((statement) => /CREATE OR REPLACE FUNCTION/i.test(statement)).length,
  }));
  process.exit(0);
}
if (!connectionString) {
  throw new Error("Missing BOURBON_QUEUE_DATABASE_URL_UNPOOLED, BOURBON_QUEUE_DATABASE_URL, or DATABASE_URL.");
}
const sql = neon(connectionString);
await sql.transaction((transaction) => [
  ...statements.map((statement) => transaction.query(statement)),
  transaction.query(`
    INSERT INTO retailer_acquisition_migrations (version)
    VALUES ($1)
    ON CONFLICT (version) DO NOTHING
  `, ["retailer-acquisition-v2"]),
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

console.log(JSON.stringify({ ok: true, migration: "retailer-acquisition-v2", schemaStatements: statements.length }, null, 2));
