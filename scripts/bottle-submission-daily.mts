import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import pg from "pg";
import { put } from "@vercel/blob";
const require = createRequire(import.meta.url);
const { validateBottleSubmissionResearch } = require("../shared/bottle-submission-research.ts") as typeof import("../shared/bottle-submission-research");
const { validateReviewedBottleArtwork } = require("../shared/bottle-artwork.ts") as typeof import("../shared/bottle-artwork");
const { LABEL_FREE_PRODUCTS } = createRequire(import.meta.url)("../apps/mobile/src/components/label-free-artwork-catalog.ts") as {LABEL_FREE_PRODUCTS:Array<{id:string;name:string;names?:string[];shape:string}>};

const args = process.argv.slice(2);
const option = (key:string) => args[args.indexOf(key)+1];
const apply = args.includes("--apply");
const input = args.includes("--input") ? option("--input") : null;
if (apply && !input) throw new Error("--apply requires a reviewed results file via --input.");
const database = process.env.BOURBON_QUEUE_DATABASE_URL_UNPOOLED || process.env.BOURBON_QUEUE_DATABASE_URL || process.env.DATABASE_URL;
if (!database) throw new Error("The bottle research database is unavailable.");
const client = new pg.Client({connectionString:database});
const normalize = (v:string) => v.toLowerCase().replace(/['’.*]/g, "").replace(/[^a-z0-9]+/g," ").trim();
await client.connect();
try {
  if (!input) {
    // A backlog query, rather than a 24-hour cutoff, survives missed daily runs.
    const result = await client.query(`SELECT c.id,c.updated_at::text AS expected_updated_at,c.payload,b.version AS bottle_version,b.patch AS bottle_patch
      FROM bottle_contributions c LEFT JOIN owner_bottle_records b ON b.bottle_id=c.payload->>'candidateBottleId'
      WHERE ((c.status IN ('new','needs_human') AND (c.payload->'context'->'research' IS NULL OR
          (c.payload->'context'->'research'->'artwork' IS NULL AND COALESCE(c.payload->'context'->'research'->>'confidence','low') <> 'low')))
        OR (c.status='added' AND b.bottle_id LIKE 'owner-%' AND b.patch->'artwork' IS NULL AND c.payload->'context'->'research'->'artwork' IS NULL
          AND COALESCE(c.payload->'context'->'research'->>'confidence','medium') <> 'low'))
      ORDER BY CASE WHEN c.status IN ('new','needs_human') THEN 0 ELSE 1 END,c.created_at,c.id LIMIT 2000`);
    const jobs = result.rows.map(row => {
      const c = row.payload;
      const name = row.bottle_patch?.canonicalName || c.rawName;
      const existing = LABEL_FREE_PRODUCTS.find(b => [b.name,...(b.names || [])].some(n => normalize(n) === normalize(name)));
      return {id:row.id,expectedUpdatedAt:row.expected_updated_at,status:c.status,rawName:c.rawName,canonicalName:name,
        bottleId:c.candidateBottleId || null,bottleVersion:row.bottle_version == null ? null : Number(row.bottle_version),
        source:c.source,location:{storeName:c.context?.storeName,city:c.context?.storeCity,state:c.context?.storeState},
        previousResearch:c.context?.research || null,existingArtwork:existing ? {id:existing.id,name:existing.name,shape:existing.shape} : null};
    }).filter(job => !(job.status === "added" && job.existingArtwork)).slice(0,25);
    const output = args.includes("--out") ? option("--out") : ".operator/bottle-research-queue.json";
    await mkdir(path.dirname(output),{recursive:true});
    await writeFile(output,JSON.stringify({generatedAt:new Date().toISOString(),jobs},null,2));
    console.log(JSON.stringify({mode:"export",count:jobs.length,output}));
  } else {
    const payload = JSON.parse(await readFile(input,"utf8"));
    if (!Array.isArray(payload.results) || payload.results.length > 25) throw new Error("Expected at most 25 reviewed results.");
    const ids = new Set<string>();
    let saved = 0;
    for (const item of payload.results) {
      if (!item.id || ids.has(item.id) || !item.expectedUpdatedAt) throw new Error("Results require unique IDs and expected timestamps.");
      ids.add(item.id);
      const research = validateBottleSubmissionResearch(item.research);
      let artwork = undefined;
      let bytes:Buffer | undefined;
      if (item.artwork) {
        if (item.artwork.reviewed !== true || !item.artwork.description?.trim()) throw new Error("Inspect each image before setting artwork.reviewed=true.");
        bytes = await readFile(path.resolve(item.artwork.path));
        if (bytes.length > 10*1024*1024 || bytes.subarray(0,8).toString("hex") !== "89504e470d0a1a0a" || bytes[25] !== 6) throw new Error("Artwork must be a transparent RGBA PNG under 10 MiB.");
      }
      if (!apply) { console.log(JSON.stringify({id:item.id,valid:true,artwork:!!bytes,mode:"dry-run"})); continue; }
      await client.query("BEGIN");
      try {
        const current = (await client.query("SELECT payload FROM bottle_contributions WHERE id=$1 AND updated_at=$2::timestamptz FOR UPDATE",[item.id,item.expectedUpdatedAt])).rows[0]?.payload;
        if (!current) throw new Error("admin_conflict: submission changed; export it again");
        if (!["new","needs_human","added"].includes(current.status)) throw new Error("Submission no longer needs this research.");
        if (bytes) {
          const sha256 = createHash("sha256").update(bytes).digest("hex");
          const uploaded = await put(`bottle-artwork/${sha256}.png`,bytes,{access:"public",addRandomSuffix:false,allowOverwrite:true,contentType:"image/png"});
          artwork = validateReviewedBottleArtwork({url:uploaded.url,sha256,reviewedAt:new Date().toISOString(),description:item.artwork.description});
        }
        const enriched = {...research,...(artwork ? {artwork} : current.context?.research?.artwork ? {artwork:validateReviewedBottleArtwork(current.context.research.artwork)} : {})};
        if (current.status === "added" && artwork) {
          const record = (await client.query("SELECT patch,version FROM owner_bottle_records WHERE bottle_id=$1",[current.candidateBottleId])).rows[0];
          if (!record || Number(record.version) !== item.bottleVersion || record.patch.artwork) throw new Error("admin_conflict: bottle artwork changed; export again");
          await client.query("SELECT owner_save_bottle_record($1,$2::jsonb,NULL,$3::bigint,$4,$5,NULL)",[current.candidateBottleId,JSON.stringify({...record.patch,artwork}),item.bottleVersion,"codex-bottle-research","Added inspected original label-less artwork"]);
        }
        await client.query("UPDATE bottle_contributions SET payload=jsonb_set(payload,'{context}',COALESCE(payload->'context','{}'::jsonb) || jsonb_build_object('research',$2::jsonb)) || jsonb_build_object('updatedAt',now()),updated_at=now() WHERE id=$1",[item.id,JSON.stringify(enriched)]);
        await client.query("INSERT INTO owner_workspace_audit(actor_id,action,target_id,details) VALUES('codex-bottle-research','bottle_research',$1,$2::jsonb)",[item.id,JSON.stringify({reason:"Researched national rarity recommendation; original artwork inspected",research:enriched})]);
        await client.query("COMMIT"); saved++;
      } catch(error) { await client.query("ROLLBACK"); throw error; }
    }
    console.log(JSON.stringify({mode:apply?"apply":"dry-run",saved}));
  }
} finally { await client.end(); }
