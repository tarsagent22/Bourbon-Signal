import { readFile } from "node:fs/promises";
import path from "node:path";
import { neon } from "@neondatabase/serverless";
import { NextRequest } from "next/server";
import { requireOwnerApiAccess } from "@/lib/owner-auth";
import { SIGNAL_POINTS_MEMBERSHIP_CREDIT_V3_READY } from "@/lib/signal-points-repository";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONFIRMATION = "activate-membership-credit-v3";

function createSql(connectionString: string) {
  return neon(connectionString);
}
type SqlClient = ReturnType<typeof createSql>;

function databaseUrl() {
  return process.env.BOURBON_QUEUE_DATABASE_URL?.trim()
    || process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED?.trim()
    || process.env.DATABASE_URL?.trim()
    || "";
}

function splitSql(source: string) {
  const statements: string[] = [];
  let current = "";
  let quote: string | null = null;
  let dollarTag: string | null = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (!quote && !dollarTag && char === "$") {
      const match = source.slice(index).match(/^\$[A-Za-z0-9_]*\$/);
      if (match) {
        dollarTag = match[0];
        current += dollarTag;
        index += dollarTag.length - 1;
        continue;
      }
    } else if (dollarTag && source.startsWith(dollarTag, index)) {
      current += dollarTag;
      index += dollarTag.length - 1;
      dollarTag = null;
      continue;
    }
    if (!dollarTag && (char === "'" || char === '"')) {
      if (quote === char && next === char) {
        current += char + next;
        index += 1;
        continue;
      }
      if (!quote) quote = char;
      else if (quote === char) quote = null;
    }
    if (char === ";" && !quote && !dollarTag) {
      if (current.trim()) statements.push(current.trim());
      current = "";
    } else current += char;
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function html(title: string, message: string, ready: boolean) {
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>${title}</title><style>body{margin:0;background:#0c0a08;color:#f2e7d5;font:16px system-ui;display:grid;place-items:center;min-height:100vh}.card{max-width:620px;padding:36px;border:1px solid #6f542c;border-radius:18px;background:#16110c}h1{font:700 32px Georgia;margin-top:0}p{line-height:1.55;color:#cdbfa9}button{background:#c99b4a;color:#171008;border:0;border-radius:9px;padding:13px 18px;font-weight:800;cursor:pointer}.ok{color:#9fcf9f}</style></head><body><main class="card"><h1>${title}</h1><p class="${ready ? "ok" : ""}">${message}</p>${ready ? "" : `<form method="post"><input type="hidden" name="confirmation" value="${CONFIRMATION}"><button type="submit">Activate membership credits</button></form>`}</main></body></html>`, { headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "private, no-store" } });
}

async function readiness(sql: SqlClient) {
  const rows = await sql.query(
    `SELECT EXISTS(SELECT 1 FROM signal_point_migrations WHERE migration_key=$1)
       AND to_regprocedure('prepare_signal_membership_credit_fulfillment(text,text,jsonb)') IS NOT NULL
       AND to_regprocedure('complete_signal_membership_credit_fulfillment(text,text,text,jsonb)') IS NOT NULL AS ready`,
    [SIGNAL_POINTS_MEMBERSHIP_CREDIT_V3_READY],
  ) as Array<{ ready: boolean }>;
  return rows[0]?.ready === true;
}

export async function GET() {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  const connectionString = databaseUrl();
  if (!connectionString) return html("Migration unavailable", "The durable database is not configured.", true);
  const sql = createSql(connectionString);
  const ready = await readiness(sql);
  return html(ready ? "Membership credits active" : "Activate membership credits", ready ? "The v3 database functions and activation marker are present." : "This applies the reviewed Signal Points schema in one serializable transaction after preserving the previous function definitions and catalog rows in the database.", ready);
}

export async function POST(request: NextRequest) {
  const owner = await requireOwnerApiAccess();
  if (owner.error) return owner.error;
  if (request.headers.get("origin") !== request.nextUrl.origin) return new Response("Invalid origin", { status: 403 });
  const body = await request.formData();
  if (body.get("confirmation") !== CONFIRMATION) return new Response("Confirmation required", { status: 400 });
  const connectionString = databaseUrl();
  if (!connectionString) return html("Migration unavailable", "The durable database is not configured.", true);
  const sql = createSql(connectionString);
  if (await readiness(sql)) return html("Membership credits active", "The v3 migration was already complete; no changes were made.", true);

  await sql.transaction((transaction) => [
    transaction.query(`CREATE TABLE IF NOT EXISTS signal_point_schema_backups (
      backup_key TEXT PRIMARY KEY,
      snapshot JSONB NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )`),
    transaction.query(`INSERT INTO signal_point_schema_backups(backup_key,snapshot)
      SELECT $1,jsonb_build_object(
        'functions',COALESCE((SELECT jsonb_agg(pg_get_functiondef(p.oid) ORDER BY p.proname) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname=current_schema() AND p.proname IN ('reserve_signal_reward','transition_signal_reward_redemption','prepare_signal_membership_credit_fulfillment','complete_signal_membership_credit_fulfillment')),'[]'::jsonb),
        'catalog',COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.item_key) FROM signal_reward_catalog c),'[]'::jsonb),
        'migration',COALESCE((SELECT to_jsonb(m) FROM signal_point_migrations m WHERE m.migration_key=$2),'null'::jsonb)
      ) ON CONFLICT (backup_key) DO NOTHING`, [`${SIGNAL_POINTS_MEMBERSHIP_CREDIT_V3_READY}:before`, SIGNAL_POINTS_MEMBERSHIP_CREDIT_V3_READY]),
  ], { isolationLevel: "Serializable" });

  const schemaPath = path.join(process.cwd(), "src", "lib", "signal-points-schema.sql");
  const schema = await readFile(schemaPath, "utf8");
  const statements = splitSql(schema);
  await sql.transaction(
    (transaction) => statements.map((statement) => transaction.query(statement)),
    { isolationLevel: "Serializable" },
  );
  if (!(await readiness(sql))) throw new Error("Membership credit migration verification failed");
  return html("Membership credits active", "Migration, verification, and the database-local rollback snapshot completed successfully.", true);
}
