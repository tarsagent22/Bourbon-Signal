import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
const url = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Missing application database connection.");
const sql = neon(url);
function splitSql(source) {
  const statements = [];
  let current = '';
  let quote = null;
  let dollarTag = null;
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];
    if (!quote && !dollarTag && (char === '$')) {
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
    if (char === ';' && !quote && !dollarTag) {
      if (current.trim()) statements.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  if (current.trim()) statements.push(current.trim());
  return statements;
}

if (process.argv.includes("--apply")) {
 const source = await readFile(new URL("../src/lib/membership-month-schema.sql",import.meta.url),"utf8");
 await sql.transaction(tx=>splitSql(source).map(statement=>tx.query(statement)),{isolationLevel:"Serializable"});
}
const rows = await sql.query("SELECT EXISTS(SELECT 1 FROM signal_point_migrations WHERE migration_key='signal_points_membership_month_v5_ready') AND to_regclass('signal_membership_offer_codes') IS NOT NULL AND to_regprocedure('redeem_signal_membership_month(text,text,text,text,text,text,text,text)') IS NOT NULL AS ready");
if (rows[0]?.ready !== true) throw new Error("Membership month migration is not ready.");
console.log("Membership month migration ready. Apple delivery still requires approved production codes.");
