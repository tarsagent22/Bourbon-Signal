import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import test from 'node:test';
import ts from 'typescript';
import pg from 'pg';
const require = createRequire(import.meta.url);
function load(path, overrides = {}) {
  const exports = {};
  vm.runInNewContext(ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { exports, require: name => overrides[name] ?? require(name), Date, Set, Map, console, process, fetch: () => { throw Error('NO NETWORK'); } });
  return exports;
}
const { PostgresPushOutbox, drainPushOutbox } = load('../src/lib/alert-queue/push-outbox.ts', { './runtime': { alertQueueConnectionString: () => { throw Error('NO PRODUCTION DATABASE'); } } });
const { sendExpoPushMessages, buildExpoPushMessages } = load('../src/lib/push-devices.ts');
const messages = buildExpoPushMessages(['ExpoPushToken[aaaaaaaaaaaa]'], { id: 'alert', bottleName: 'Bottle', storeLabel: 'Store', matchedArea: 'Area' });
const result = (accepted, rejected) => ({ accepted, rejected, tickets: [], invalidTokens: [] });
const pool = new pg.Pool({ host: '127.0.0.1', port: 55439, user: 'postgres', password: '', database: 'postgres', max: 1 });
let sql, repo;
test.before(async () => {
  sql = await pool.connect();
  await sql.query('create temporary table alert_delivery_leases (lease_key text primary key, owner text, expires_at timestamptz)');
  // Temporary schema ensures zero shared/public table writes, even on this isolated server.
  await sql.query('set search_path to pg_temp');
  const schema = readFileSync(new URL('../src/lib/alert-queue/push-outbox.sql', import.meta.url), 'utf8');
  await sql.query(schema); await sql.query(schema);
  repo = new PostgresPushOutbox(sql);
});
test.after(async () => { sql?.release(); await pool.end(); });
let id = 0;
async function fixture() {
  const user = `user-${++id}`, owner = `owner-${id}`;
  await sql.query("insert into alert_delivery_leases values ($1,$2,now()+interval '10 minutes')", [`member:${user}`,owner]);
  await repo.enqueue(user,owner,{ alertId: 'alert', stableKeys: ['episode-key'], expiresAt: new Date(Date.now()+60*60_000).toISOString() });
  const state = async () => (await sql.query('select * from alert_push_outbox where user_id=$1',[user])).rows[0];
  let sends = 0, resolutions = 0;
  const run = (send = async () => result(0,1), resolve = async () => ({ devices: ['CURRENT LIVE ONLY'], messages })) => drainPushOutbox(repo,user,owner,{
    resolve: async row => { resolutions++; return resolve(row); },
    send: async (...args) => { sends++; assert.equal(args[0],user); assert.deepEqual(args[1],['CURRENT LIVE ONLY']); return send(...args); },
  });
  const due = () => sql.query("update alert_push_outbox set next_attempt_at=now()-interval '1 second' where user_id=$1",[user]);
  return {user,owner,state,run,due,get sends(){return sends;},get resolutions(){return resolutions;}};
}
test('known rejection retries on second run without a new inbox or enqueue; accepted does not replay',async()=>{
  const f=await fixture(); await f.run(); assert.equal((await f.state()).status,'pending');
  await f.run(); assert.equal(f.sends,1); await f.due(); await f.run(async()=>result(1,0));
  assert.equal(f.sends,2); assert.equal(f.resolutions,2); assert.equal((await f.state()).status,'accepted');
  await f.run(); assert.equal(f.sends,2);
});
test('network-after-send, zero ownership, and mixed acceptance are terminal unknown/manual',async()=>{
  for(const send of [async()=>{throw Error('network after send');},async()=>result(0,0),async()=>result(1,1)]){
    const f=await fixture();await f.run(send);assert.equal((await f.state()).status,'unknown');await f.due();await f.run();assert.equal(f.sends,1);
  }
});
test('write-ahead unknown survives crash and duplicate enqueue',async()=>{
  const f=await fixture();const row=(await repo.pending(f.user,f.owner))[0];await repo.begin(f.user,f.owner,row.id);
  await repo.enqueue(f.user,f.owner,{alertId:'alert',stableKeys:['episode-key'],expiresAt:new Date(Date.now()+60_000).toISOString()});
  await f.run();assert.equal(f.sends,0);assert.equal((await f.state()).status,'unknown');
});
test('regrouping never replays an unknown episode under a new alert ID',async()=>{
  const f=await fixture();await f.run(async()=>{throw Error('ambiguous');});
  await repo.enqueue(f.user,f.owner,{alertId:'regrouped',stableKeys:['new-episode','episode-key'],expiresAt:new Date(Date.now()+60_000).toISOString()});
  const rows=(await sql.query('select stable_keys,status from alert_push_outbox where user_id=$1 order by created_at',[f.user])).rows;
  assert.equal(rows.length,2);assert.deepEqual(rows[0].stable_keys,['episode-key']);assert.equal(rows[0].status,'unknown');assert.deepEqual(rows[1].stable_keys,['new-episode']);
});
test('retry budget, expiry, preference/entitlement/freshness denial, lease loss fail closed',async()=>{
  const f=await fixture();for(let i=0;i<4;i++){await f.due();await f.run();}assert.equal(f.sends,3);assert.equal((await f.state()).status,'exhausted');
  const expired=await fixture();await sql.query("update alert_push_outbox set expires_at=now()-interval '1 second' where user_id=$1",[expired.user]);await expired.run();assert.equal(expired.sends,0);assert.equal((await expired.state()).status,'expired');
  const denied=await fixture();await denied.run(undefined,async()=>null);assert.equal(denied.sends,0);assert.equal((await denied.state()).status,'suppressed');
  const lost=await fixture();await sql.query("update alert_delivery_leases set owner='replacement' where lease_key=$1",[`member:${lost.user}`]);await assert.rejects(lost.run());assert.equal(lost.sends,0);
});
test('lost completion write cannot turn provider acceptance into auto retry',async()=>{
  const f=await fixture();await assert.rejects(f.run(async()=>{await sql.query("update alert_delivery_leases set owner='replacement' where lease_key=$1",[`member:${f.user}`]);return result(1,0);}));
  assert.equal((await f.state()).status,'unknown');
});
test('outbox stores identifiers only, not devices, tokens or message payloads',async()=>{
  const f=await fixture();const row=await f.state();assert.deepEqual(row.stable_keys,['episode-key']);assert.doesNotMatch(JSON.stringify(row),/ExpoPushToken|CURRENT LIVE|bottleName/);
});
test('transport only counts explicit error tickets as known rejection',async()=>{
  for(const data of [undefined,[],[{}],[{status:'unexpected'}]]){
    await assert.rejects(sendExpoPushMessages(messages,async()=>new Response(JSON.stringify({data}),{status:200})));
  }
  assert.equal((await sendExpoPushMessages(messages,async()=>new Response(JSON.stringify({data:[{status:'error',details:{error:'MessageRateExceeded'}}]}),{status:200}))).rejected,1);
  assert.equal((await sendExpoPushMessages(messages,async()=>new Response(JSON.stringify({data:[{status:'ok',id:'ticket'}]}),{status:200}))).accepted,1);
});
test('missing schema fails closed before resolving tokens or sending',async()=>{
  const f=await fixture();
  await sql.query('alter table alert_push_outbox rename to hidden_push_outbox');
  let resolved=false;
  try {await assert.rejects(drainPushOutbox(repo,f.user,f.owner,{resolve:async()=>{resolved=true;return {devices:[],messages};},send:async()=>{throw Error('must not send');}}),error=>error.code==='42P01');assert.equal(resolved,false);}
  finally{await sql.query('alter table hidden_push_outbox rename to alert_push_outbox');}
});

// Execute the actual delivery function with the real PostgreSQL outbox. All Clerk,
// ownership and provider boundaries are local fakes; no live SDK/service is invoked.
const deliverySource = readFileSync(new URL('../src/lib/alert-delivery.ts',import.meta.url),'utf8');
const deliveryCode = ts.transpile(deliverySource.slice(deliverySource.indexOf('export async function deliverPreferenceAlerts(')).replace('export async','async'),{target:ts.ScriptTarget.ES2022});
const laneSource = readFileSync(new URL('../src/lib/source-lane.ts',import.meta.url),'utf8');
const providerCode = ts.transpile(laneSource.slice(laneSource.indexOf('export async function invokeSourceProvider'),laneSource.indexOf('export class SourceLaneRepository')).replace('export async','async'),{target:ts.ScriptTarget.ES2022});
async function callerFixture() {
  const userId=`caller-${++id}`;
  const prefs={push:{enabled:true},onSite:{enabled:true},email:{enabled:false},sms:{enabled:false},sightings:{enabled:true},rarityTiers:['allocated']};
  const user={id:userId,publicMetadata:{paid:true,notificationPreferences:prefs,areaPreferences:{saved:true},bottleAlertPreferences:{}},privateMetadata:{alertDelivery:{dedupeIdentityVersion:2,recent:[]},pushDevices:['live-v1']}};
  let sends=0,inboxes=0,reads=0,failAfterInbox=false;
  const candidate={eligibleForDelivery:true,bottle:'Bottle',tier:'allocated',signalAt:new Date().toISOString(),key:'episode',dedupeKey:'group',sourceType:'engine'};
  const queue={
    acquireLease:async(key,owner,_at,expires)=>{const r=await sql.query(`insert into alert_delivery_leases values ($1,$2,$3) on conflict (lease_key) do update set owner=excluded.owner,expires_at=excluded.expires_at where alert_delivery_leases.expires_at<=now() returning lease_key`,[key,owner,expires]);return !!r.rows.length;},
    releaseLease:async(key,owner)=>{await sql.query('delete from alert_delivery_leases where lease_key=$1 and owner=$2',[key,owner]);},
    registerSnapshot:async()=>{},readRecipientCursor:async()=>0,writeRecipientCursor:async()=>{},
  };
  const context={
    process:{env:{}},Date,Set,Map,Math,Number,String,
    // This fixture exercises the existing non-source-lane push path. Preserve
    // the real final provider boundary, while keeping new source I/O isolated.
    pollRuntimeSourceLanes:async()=>{},traceRuntimeSourceCandidates:async()=>{},persistRuntimeSourceDemand:async()=>{},
    runtimeSourceCandidatesStillValid:async candidates=>{assert.ok(candidates.every(c=>!c.sourceLaneId));return true;},
    classifyCompanyMember:()=>({kind:'member'}),
    assertAlertDeliveryAuthorized:()=>{}, readAlertCandidateBatch:async()=>({candidates:[candidate],snapshot:{snapshotId:'test',generatedAt:new Date().toISOString()}}),
    evaluateAlertSnapshotSafety:()=>({safe:true}),loadSiteLocationLookupRecords:async()=>{},
    asString:(v,d='')=>typeof v==='string'?v:d,asNumber:(v,d=0)=>typeof v==='number'?v:d,asBoolean:v=>v===true,
    candidateCanUseOnSite:()=>true,candidatePassesFreshOnSiteGuardrails:c=>Date.now()-Date.parse(c.signalAt)<2*3600000,
    ALERT_DELIVERY_ENABLED:true,ALERT_ONSITE_DELIVERY_ENABLED:true,ALERT_EMAIL_DELIVERY_ENABLED:false,ALERT_SMS_DELIVERY_ENABLED:false,
    MAX_DELIVERY_USERS:10,MAX_RECIPIENT_SCAN_USERS:100,MAX_ONSITE_ALERTS_PER_USER:1,CANDIDATE_POOL_PER_USER:25,MAX_RECENT_DELIVERIES_PER_USER:250,MAX_RECENT_ONSITE_ALERTS_PER_USER:100,
    alertQueueDatabaseConfigured:()=>true,createProductionAlertQueueRepository:()=>queue,createProductionPushOutbox:()=>repo,drainPushOutbox,
    randomUUID:()=>`worker-${++id}`,getResendClient:()=>null,
    clerkClient:async()=>({users:{getUser:async()=>{reads++;return structuredClone(user);},updateUserMetadata:async(_id,patch)=>{if(failAfterInbox&&inboxes)throw Error('failure after inbox success');if(patch.privateMetadata?.alertInbox)inboxes++;Object.assign(user.privateMetadata,structuredClone(patch.privateMetadata||{}));}}}),
    getUsersPage:async(_c,offset)=>({data:offset?[]:[structuredClone(user)],totalCount:1}),
    getServerEntitlements:async pub=>({tier:pub.paid?'standard':'free',canReceiveSightingsAlerts:true}),
    normalizeNotificationPreferences:v=>v,normalizeAreaPrefs:v=>v,hasSavedAreaPreferences:v=>v?.saved,
    normalizeBottleAlertPreferences:v=>({bottleNames:[],bottleKeys:[],...v}),normalizeDeliveryMetadata:v=>v,normalizeAlertInboxMetadata:v=>v||{recent:[]},normalizePendingExpoPushTickets:()=>[],
    pushPreferenceProjectionAllowsDelivery:v=>v?.status!=='pending',
    groupCandidatesByLocation:cs=>cs,enumerateUnderlyingAlertChildren:c=>[c],stableUnderlyingAlertKey:c=>c.key,
    alertRarityIsSelected:(tier,tiers)=>tiers.includes(tier),candidateMatchesArea:(_c,areas)=>areas.saved,candidateMatchesBottlePrefs:(_c,_mode,bottles)=>!bottles.deny,
    sortCandidatesForMember:()=>0,selectUnseenCandidate:(c,seen,legacy)=>seen.has(c.key)||legacy.has(c.dedupeKey)?null:c,
    candidateStoreLabel:()=> 'Store',candidateToMemberAlert:(_u,c,now)=>({id:`alert-${now}`,dedupeKey:c.dedupeKey,underlyingStableKeys:[c.key],bottleName:c.bottle,storeLabel:'Store',matchedArea:'Area',signalAt:c.signalAt,freshnessLimitHours:2}),
    memberAlertPassesFinalFreshness:()=>true,uniqueStrings:values=>[...new Set(values)],firstAlertCreatedMetadata:()=>({activation:{}}),primaryEmailForUser:()=>'',
    ownedPushDevices:async(_u,devices)=>devices,enabledPushTokens:devices=>devices.length?['ExpoPushToken[aaaaaaaaaaaa]']:[],buildExpoPushMessages,
    sendOwnedExpoPushMessages:async(_u,devices)=>{sends++;assert.deepEqual(devices,sends===1?['live-v1']:['live-v2']);return sends===1?result(0,1):result(1,0);},
    disablePushTokens:d=>d,
  };
  const ctx=vm.createContext(context);vm.runInContext(providerCode,ctx);vm.runInContext(deliveryCode,ctx);
  return {user,candidate,context:ctx,run:options=>ctx.deliverPreferenceAlerts({},options),get sends(){return sends;},get inboxes(){return inboxes;},get reads(){return reads;},set failAfterInbox(v){failAfterInbox=v;},
    due:()=>sql.query("update alert_push_outbox set next_attempt_at=now()-interval '1 second' where user_id=$1",[userId]),
    state:async()=>(await sql.query('select * from alert_push_outbox where user_id=$1',[userId])).rows[0]};
}
test('actual caller: inbox succeeds, known rejection, second run sends only push with current devices',async()=>{
  const f=await callerFixture();const first=await f.run();assert.equal(first.onSiteAlertsCreated,1);assert.equal(f.inboxes,1);assert.equal(f.sends,1);
  assert.equal((await f.state()).status,'pending');f.user.privateMetadata.pushDevices=['live-v2'];await f.due();
  const second=await f.run();assert.equal(second.onSiteAlertsCreated,0);assert.equal(second.emailsSent,0);assert.equal(second.smsSent,0);assert.equal(second.pushNotificationsSent,1);
  assert.equal(f.inboxes,1);assert.equal(f.sends,2);assert.equal((await f.state()).status,'accepted');await f.run();assert.equal(f.sends,2);
});
test('actual caller: metadata failure after inbox success and known push rejection recovers only push',async()=>{
  const f=await callerFixture();f.failAfterInbox=true;await assert.rejects(f.run());assert.equal(f.inboxes,1);assert.equal((await f.state()).status,'pending');assert.equal(f.sends,1);
  f.failAfterInbox=false;f.user.privateMetadata.pushDevices=['live-v2'];await f.due();const next=await f.run();assert.equal(next.onSiteAlertsCreated,0);assert.equal(f.inboxes,1);assert.equal(f.sends,2);assert.equal((await f.state()).status,'accepted');
});
test('actual caller: crash between inbox success and push boundary leaves a recoverable intent',async()=>{
  const f=await callerFixture();f.context.drainPushOutbox=async(...args)=>{if(f.inboxes)throw Error('simulated worker exit after inbox');return drainPushOutbox(...args);};
  await assert.rejects(f.run());assert.equal(f.inboxes,1);assert.equal(f.sends,0);assert.equal((await f.state()).status,'pending');
  f.context.drainPushOutbox=drainPushOutbox;const next=await f.run();assert.equal(next.onSiteAlertsCreated,0);assert.equal(f.inboxes,1);assert.equal(f.sends,1);
});
test('actual caller: current area, rarity, bottles, projection and freshness block pending retries',async()=>{
  for(const deny of [f=>f.user.publicMetadata.areaPreferences.saved=false,f=>f.user.publicMetadata.notificationPreferences.rarityTiers=[],f=>f.user.publicMetadata.bottleAlertPreferences.deny=true,f=>f.user.privateMetadata.pushPreferenceProjection={status:'pending'},f=>f.candidate.signalAt=new Date(Date.now()-3*3600000).toISOString()]){
    const f=await callerFixture();await f.run();await f.due();deny(f);await f.run();assert.equal(f.sends,1);assert.equal((await f.state()).status,'suppressed');
  }
});
test('actual caller: free, disabled push, dry run, baseline and shadow never drain pending sends',async()=>{
  for(const [change,options] of [[f=>f.user.publicMetadata.paid=false,{}],[f=>f.user.publicMetadata.notificationPreferences.push.enabled=false,{}],[()=>{},{dryRun:true}],[()=>{},{baselineOnSiteOnly:true}],[()=>{},{baselineEmailOnly:true}],[()=>{},{baselineSmsOnly:true}],[()=>{},{queueMode:'shadow'}]]){
    const f=await callerFixture();await f.run();await f.due();change(f);
    // These runs must not enter the live outbox at all.
    f.context.createProductionPushOutbox=()=>{throw Error('unexpected live outbox');};
    if(options.baselineOnSiteOnly)f.context.flattenUnderlyingStableKeys=()=>[];
    await f.run(options);assert.equal(f.sends,1);
  }
});
