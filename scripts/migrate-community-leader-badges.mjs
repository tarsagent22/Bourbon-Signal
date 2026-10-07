import { readFile } from "node:fs/promises";
import { neon } from "@neondatabase/serverless";
const apply = process.argv.includes("--apply");
if (apply && process.argv.includes("--check")) throw new Error("Choose --apply or --check.");
const url = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Community award storage is unavailable.");
const sql = neon(url);
const prerequisites = ["community_sightings", "community_sighting_votes", "community_contributor_moderation", "signal_point_source_balances", "hunt_outcomes"];
const ready = await sql.query("SELECT name,to_regclass(name) IS NOT NULL AS ready FROM unnest($1::text[]) name", [prerequisites]);
if (ready.some(row => !row.ready)) throw new Error("Community award prerequisites are unavailable.");

// Match the application migration splitter: dollar-quoted function bodies are one statement.
function statements(source) {
  const result = []; let current = ""; let quote = null; let dollar = null;
  for (let i=0;i<source.length;i++) {
    const c=source[i];
    if (!quote && !dollar && c==="$") {
      const tag=source.slice(i).match(/^\$[A-Za-z0-9_]*\$/)?.[0];
      if (tag) { dollar=tag; current+=tag; i+=tag.length-1; continue; }
    } else if (dollar && source.startsWith(dollar,i)) { current+=dollar; i+=dollar.length-1; dollar=null; continue; }
    if (!dollar && (c==="'" || c==='"')) {
      if (quote===c && source[i+1]===c) { current+=c+c; i++; continue; }
      quote=quote===c ? null : quote || c;
    }
    if(c===';' && !quote && !dollar) { if(current.trim()) result.push(current.trim()); current=""; } else current+=c;
  }
  if(current.trim()) result.push(current.trim());
  return result;
}
if (apply) {
  const source=await readFile(new URL("../src/lib/community-leader-badges-schema.sql",import.meta.url),"utf8");
  await sql.transaction(statements(source).map(statement=>sql.query(statement)));
}
const proof=await sql.query(`SELECT
  to_regclass('community_leader_badge_program') IS NOT NULL AS program,
  to_regclass('community_leader_badge_periods') IS NOT NULL AS periods,
  to_regclass('community_leader_badge_awards') IS NOT NULL AS awards,
  to_regprocedure('settle_community_leader_badges(timestamp with time zone)') IS NOT NULL AS settlement_function`);
console.log(JSON.stringify({mode:apply?"apply":"check",...proof[0]}));
if(apply && Object.values(proof[0]).some(value=>value!==true)) throw new Error("Community award migration verification failed.");
