import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { deliveryFixture } from './fixtures/source-delivery-fixture.mts';
import * as laneImport from '../src/lib/source-lane.ts';
const lane=laneImport.default||laneImport;

for(const channel of ['onSite','push']) test('correction-2 R5 real handler-to-delivery '+channel+' simulation has truthful counts and no writes',async()=>{
 const candidate={id:'synthetic',eligibleForDelivery:true,dedupeKey:'synthetic',availabilityEpisodeId:'synthetic-episode',bottle:'Synthetic bottle',state:'SC',tier:'allocated',observedAt:new Date().toISOString()};
 const f=deliveryFixture([candidate],lane,{},channel);let writes=0;
 const fail=async()=>{writes++;throw Error('unexpected write');};
 f.context.createProductionAlertQueueRepository=()=>new Proxy({},{get:()=>fail});
 f.context.createProductionPushOutbox=()=>new Proxy({},{get:()=>fail});
 f.context.persistRuntimeSourceDemand=fail;f.context.traceRuntimeSourceCandidates=fail;
 f.context.pollRuntimeSourceLanes=async(dry:boolean)=>assert.equal(dry,true);
 const client=await f.context.clerkClient();client.users.updateUserMetadata=fail;f.context.clerkClient=async()=>client;
 let raw:any;
 const run=await handler({secret:()=>secret,read:async()=>{raw=await f.run({dryRun:true,queueMode:'off'});return raw;}});
 const response=await run(request());const data=await response.json();
 assert.equal(writes,0);assert.equal(f.sends.length,0);assert.equal(raw.errors.length,0);
 assert.equal(response.status,200,'legitimate simulated inbox alerts must not be rejected as writes');
 assert.equal(data.summary.onSiteAlertsWouldCreate,1);assert.equal(data.summary.onSiteAlertsCreated,0);
 assert.equal(data.summary.pushNotificationsWouldSend,channel==='push'?1:0);
 assert.equal(data.summary.queueMode,'off');assert.equal(data.summary.dryRun,true);
 assert.equal(data.errorCount,0);assert.equal(JSON.stringify(data).includes('synthetic'),false);
});

test('correction-2 R5 diagnostics still reject actual provider send reports',async()=>{
 for(const field of ['emailsSent','smsSent','pushNotificationsSent']) {
   const run=await handler({secret:()=>secret,read:async()=>({dryRun:true,[field]:1,onSiteAlertsCreated:1})});
   assert.equal((await run(request())).status,503,field);
 }
});

async function handler(options: any) {
 const loaded = await import('../src/lib/alert-readiness.ts').catch(() => null);
 assert.ok(loaded, 'fixed-purpose read-only alert diagnostics handler must exist');
 return (loaded.default || loaded).createAlertReadinessHandler(options);
}
const secret = 'synthetic-read-only-test-secret-000000000000';
const request = (query='', token=secret, method='GET') => new Request('https://www.bourbonsignal.com/api/ops/alert-readiness'+query,{method,headers:{authorization:'Bearer '+token}});

test('diagnostics fail closed before reads for unset, wrong and oversized credentials',async()=>{
 let reads=0; const read=async()=>{reads++;return {}};
 for(const expected of [undefined,'', 'short']) assert.equal((await(await handler({secret:()=>expected,read}))(request())).status,401);
 const run=await handler({secret:()=>secret,read});
 for(const token of ['', 'wrong', 'x'.repeat(1000)]) assert.equal((await run(request('',token))).status,401);
 assert.equal(reads,0);
});
test('diagnostics cannot take live, baseline, recipient or other query controls',async()=>{
 let reads=0; const run=await handler({secret:()=>secret,read:async()=>{reads++;return {}}});
 for(const query of ['?dryRun=0','?baseline=1','?testEmail=fixture@example.invalid','?cron=v3','?anything=1']) assert.equal((await run(request(query))).status,400);
 assert.equal((await run(request('',secret,'POST'))).status,405);assert.equal(reads,0);
});
test('diagnostics return only bounded aggregate readiness with no raw errors or member fields',async()=>{
 let reads=0; const run=await handler({secret:()=>secret,read:async()=>{reads++;return {dryRun:true,snapshotSource:'remote-snapshot',snapshotFresh:true,usersConsidered:4,usersMatched:2,emailsWouldSend:1,emailsSent:0,errors:['private fixture@example.invalid'],members:[{phone:'private'}],unknown:99};}});
 const response=await run(request());const data=await response.json();
 assert.equal(response.status,200);assert.match(response.headers.get('cache-control')||'',/private.*no-store/);
 assert.equal(reads,1);assert.equal(data.summary.usersMatched,2);assert.equal(data.errorCount,1);
 assert.equal(data.deviceReceiptProven,false);assert.equal(data.summary.emailsSent,0);
 assert.equal(JSON.stringify(data).includes('private'),false);assert.equal('unknown' in data.summary,false);
});
test('unexpected live result or read exception is a sanitized failure',async()=>{
 for(const read of [async()=>({dryRun:false}),async()=>{throw Error('private fixture detail');}]){
 const response=await(await handler({secret:()=>secret,read}))(request());assert.equal(response.status,503);assert.equal((await response.text()).includes('private'),false);
 }
});
test('deployed diagnostics route hardcodes dry-run and never accepts caller delivery options',async()=>{
 const text=await readFile(new URL('../src/app/api/ops/alert-readiness/route.ts',import.meta.url),'utf8').catch(()=> '');
 assert.match(text,/deliverPreferenceAlerts\(new Request\("https:\/\/www\.bourbonsignal\.com\/api\/alerts\/deliver"/);
 assert.match(text,/\{ dryRun: true, queueMode: "off" \}/);
 assert.match(text,/ALERT_READINESS_READ_SECRET/);
 assert.doesNotMatch(text,/searchParams|baseline:|testEmail:|testPhone:/);
});
