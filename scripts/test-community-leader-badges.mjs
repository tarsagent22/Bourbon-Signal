import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { communityLeaderBadge } from "../shared/community-leader-badges.ts";
import { readCommunityLeaderAwards, validatePublicLeaderBadges } from "../src/lib/community-leader-badges.ts";
import { featuredBadgeLabels } from "../src/lib/featured-badges.ts";
import { reconcileMemberRewards, summarizeMemberRewards } from "../src/lib/sighting-rewards.ts";

const db = new PGlite();
const query = { query: async (sql, params) => (await db.query(sql, params)).rows };
assert.deepEqual(await readCommunityLeaderAwards(query, "missing"), [], "pre-migration installs retain existing achievement metrics");
for (const file of ["founder-shipping-schema.sql", "community-sightings-schema.sql", "signal-points-schema.sql", "hunt-outcome-schema.sql", "community-leader-badges-schema.sql"]) await db.exec(await readFile(new URL(`../src/lib/${file}`, import.meta.url), "utf8"));
await db.query("UPDATE community_leader_badge_program SET first_month='2026-10-01',first_year=2026");
let sequence = 0;
async function post(user, day, extra = {}, month = 10) {
  const id = `${user}-${month}-${day}-${++sequence}`;
  const createdAt = `2026-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}T14:00:00Z`;
  const payload = { id, reporterUserId: user, bottleId: "bottle-"+day, bottleName: "Bourbon", storeId: "store-1", storeName: "Store", storeAddress: "1 Main", storeCity: "Lexington", storeState: "KY", sightingType: "seen_in_store", createdAt, ...extra };
  await db.query("INSERT INTO community_sightings(id,reporter_user_id,payload,created_at) VALUES($1,$2,$3::jsonb,$4)", [id,user,JSON.stringify(payload),createdAt]);
  return id;
}
for (let day=1;day<=6;day++) {
  await post("active",day);
  const id = await post("helpful",day,{ rewardState: { photoProof: { status: "verified_public", url: "https://proof.private.blob.vercel-storage.com/photo.jpg" } } });
  for (const voter of ["a","b","c"]) await db.query("INSERT INTO community_sighting_votes(sighting_id,user_id,kind,created_at) VALUES($1,$2,'up','2026-10-30')",[id,voter]);
}
// Thirty uploads on one day cannot win Most Active, and bottle/store/day repeats count once.
for (let i=0;i<30;i++) await post("spam",1,{ bottleId: "different-"+i });
for (let day=1;day<=8;day++) await post("restricted",day);
await db.query("INSERT INTO community_contributor_moderation(reporter_user_id,restriction_kind,restriction_reason,restricted_at,restricted_by) VALUES('restricted','spam','Test','2026-10-30','admin')");
for (let day=1;day<=8;day++) await post("pending",day,{ reviewState: { needsBottleReview: true } });
for (let day=1;day<=8;day++) await post("rejected",day,{ rewardState: { rejectedAt: "2026-10-31" } });
for (let day=1;day<=5;day++) { const id=await post("self",day); await db.query("INSERT INTO community_sighting_votes(sighting_id,user_id,kind,created_at) VALUES($1,'self','up','2026-10-30')",[id]); }
let result = (await db.query("SELECT * FROM settle_community_leader_badges('2026-11-07T04:59:59Z')")).rows[0];
assert.deepEqual(result,{settled_periods:0,awards:0,revoked:0},"period has seven days of grace and uses Eastern boundaries");
result = (await db.query("SELECT * FROM settle_community_leader_badges('2026-11-08T05:00:00Z')")).rows[0];
assert.deepEqual(result,{settled_periods:1,awards:3,revoked:0});
assert.deepEqual((await readCommunityLeaderAwards(query,"active")).map(a=>a.id),["most_active_month_2026_10"]);
assert.deepEqual((await readCommunityLeaderAwards(query,"helpful")).map(a=>a.id).sort(),["most_active_month_2026_10","top_contributor_month_2026_10"]);
for (const user of ["spam","restricted","pending","rejected","self"]) assert.deepEqual(await readCommunityLeaderAwards(query,user),[],user);
assert.deepEqual((await db.query("SELECT * FROM settle_community_leader_badges('2026-11-09')")).rows[0],{settled_periods:0,awards:0,revoked:0},"repeat runs do not issue another award");
// Annual recognition scores the entire year rather than counting monthly trophies.
await db.query("INSERT INTO signal_point_accounts(user_id) VALUES('updates')");
for (let i=0;i<10;i++) {
  await db.query("INSERT INTO hunt_outcomes(user_id,signal_id,availability_episode_id,outcome,source_type,submitted_at,updated_at) VALUES('updates',$1,$1,'found_it','retailer',$2,$2)",["episode-"+i,`2026-11-${String(1+Math.floor(i/3)).padStart(2,"0")}T14:00:00Z`]);
  await db.query("INSERT INTO signal_point_source_balances(user_id,source_key,points) VALUES('updates',$1,5)",["quality_outcome_v1:episode-"+i]);
}
await db.query("INSERT INTO hunt_outcomes(user_id,signal_id,availability_episode_id,outcome,source_type,submitted_at,updated_at) VALUES('updates','withdrawn','withdrawn','didnt_go','retailer','2026-11-06','2026-11-06')");
await db.query("INSERT INTO signal_point_source_balances(user_id,source_key,points) VALUES('updates','quality_outcome_v1:withdrawn',0)");
for (let day=1;day<=26;day++) await post("annual",day,{},12);
await db.query("SELECT * FROM settle_community_leader_badges('2027-01-09T05:00:00Z')");
assert.ok((await readCommunityLeaderAwards(query,"updates")).some(a=>a.id==="top_contributor_month_2026_11"),"rewarded availability updates qualify without photo posts");
assert.equal((await db.query("SELECT contributions,active_days,score FROM community_leader_badge_awards WHERE user_id='updates' AND badge_id='top_contributor_month_2026_11'")).rows[0].score,20,"withdrawn updates do not count");
const annual = await readCommunityLeaderAwards(query,"annual");
assert.ok(annual.some(a=>a.id==="most_active_year_2026"));
assert.ok(annual.some(a=>a.id==="top_contributor_year_2026"));
assert.ok(annual.every(a=>a.pointsAwarded===0));
assert.equal(communityLeaderBadge("top_contributor_year_2026")?.label,"Top Contributor · 2026");
assert.equal(communityLeaderBadge("most_active_month_2026_10")?.label,"Most Active · Oct 2026");
for (const invalid of ["most_active_month_2026", "most_active_year_2026_10", "most_active_month_2026_13", "top_contributor_year_2025"]) assert.equal(communityLeaderBadge(invalid),null);
const summary = summarizeMemberRewards([],{},{leaderAwards:annual,featuredBadgeIds:["top_contributor_year_2026"]});
assert.ok(summary.badges.some(b=>b.id==="top_contributor_year_2026"));
assert.deepEqual(summary.featuredBadgeIds,["top_contributor_year_2026"]);
assert.ok(summary.badgeProgress.some(b=>b.id==="top_contributor_year_2026" && b.category==="Leaders"));
assert.equal(reconcileMemberRewards([],undefined,"2027-01-09",{leaderAwards:annual}).points,0,"leader awards never enter the point ledger");
assert.deepEqual(featuredBadgeLabels({memberRewards:{badges:annual},featuredBadgeIds:["top_contributor_year_2026","unearned"]}),["Top Contributor · 2026"]);
const displayed = [{reporterUserId:"annual",reporterBadges:["Top Contributor · 2026","Spotter · Gold"]},{reporterUserId:"other",reporterBadges:["Top Contributor · 2026"]}];
assert.deepEqual((await validatePublicLeaderBadges(query,displayed)).map(s=>s.reporterBadges),[["Top Contributor · 2026","Spotter · Gold"],[]],"another member cannot claim a leader badge");
await db.query("UPDATE community_sightings SET payload=jsonb_set(payload,'{rewardState}','{\"rejectedAt\":\"2027-01-10\"}'::jsonb) WHERE reporter_user_id='annual'");
assert.deepEqual(await readCommunityLeaderAwards(query,"annual"),[],"moderation hides an award before the next cron run");
assert.deepEqual((await validatePublicLeaderBadges(query,displayed))[0].reporterBadges,["Spotter · Gold"],"stale featured snapshots cannot display revoked recognition");
const revoke=(await db.query("SELECT * FROM settle_community_leader_badges('2027-01-11')")).rows[0];
assert.ok(revoke.revoked>=2);
await db.close();
console.log("Leader badge SQL passed: calendar boundaries, grace, monthly/yearly independence, ties, anti-spam, moderation, ownership, idempotency and zero-point awards.");
