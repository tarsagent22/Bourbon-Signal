import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import * as laneImport from '../src/lib/source-lane.ts';
const lane = laneImport.default || laneImport;
import { transport } from './fixtures/source-lane-fixture.mts';
import { buildSourceLaneUsefulness } from '../engine/src/optimization/source-usefulness-report.mjs';
import { deliveryFixture } from './fixtures/source-delivery-fixture.mts';

async function setup(t: any) {
  const db = new PGlite(); t.after(() => db.close());
  await db.exec(await readFile(new URL('../src/lib/source-lane-schema.sql', import.meta.url), 'utf8'));
  const repo = new lane.SourceLaneRepository({ query: (s: string, p: unknown[] = []) => db.query(s,p) });
  const source = lane.SOURCE_LANES[0], base = Date.now();
  let clock = base; t.mock.method(Date, 'now', () => clock);
  const at = (n: number) => new Date(base + n * 300_000).toISOString();
  const policy = (n: number) => ({ snapshotId:'synthetic-review', generatedAt:at(n), source:'remote-snapshot', operating:{state:'SC',health:'healthy',freshness:{status:'fresh'},fallback:{status:'none'}} });
  const bible = { byId:new Map(source.subjects.map(s => [s.canonicalBottleId,{id:s.canonicalBottleId,canonical:s.canonicalName,tier:'allocated',aliases:[]}])) };
  const poll = async(n: number, quantity: number, extra = {}) => {
    clock = Date.parse(at(n));
    assert.equal((await lane.pollSourceLane({repository:repo,source,policy:policy(n),bible,enabled:true,now:()=>at(n),fetcher:transport(source,quantity),...extra})).status,'accepted');
  };
  return {db,repo,source,at,policy,poll};
}

test('R1 reconfirmation preserves every episode clock, expiry and provider latency while updating quantity', async t => {
  const {db,repo,at,policy,poll} = await setup(t);
  await poll(0,0); await poll(1,3);
  const opened = await lane.readSourceLaneCandidates(repo,[],policy(1),true,at(1));
  await repo.trace(opened,'provider_accepted','email',at(1));
  const before = (await repo.inspect()).opportunities;
  await poll(2,4);
  const confirmed = await lane.readSourceLaneCandidates(repo,[],policy(2),true,at(2));
  for (const c of confirmed) {
    const original = opened.find(o=>o.availabilityEpisodeId===c.availabilityEpisodeId)!;
    for (const key of ['observedAt','signalAt','sourceExpiresAt','availabilityEpisodeStartedAt']) assert.equal(c[key],original[key],key);
    for (const key of ['observedAt','signalAt','firstSeenAt','displayAt','availabilityEpisodeStartedAt']) assert.equal(c.sourceDrop[key],original.sourceDrop[key],'drop.'+key);
    assert.equal(c.lastConfirmedAt,at(2)); assert.equal(c.sourceDrop.lastConfirmedAt,at(2));
    assert.equal(c.sourceDrop.quantity,4);
  }
  const after = (await repo.inspect()).opportunities;
  for (const row of after) {
    const original = before.find(o=>o.episode_id===row.episode_id)!;
    for (const key of ['observed_at','expires_at','accepted_at']) assert.deepEqual(row[key],original[key],key);
  }
  const traces = (await db.query('SELECT * FROM source_lane_trace')).rows;
  const report = buildSourceLaneUsefulness({opportunities:after,traces,generatedAt:at(2)});
  assert.equal(report.latencies.observedToProviderAccepted.samples,opened.length);
  assert.equal(report.latencies.observedToProviderAccepted.clockSkew,0);
  await poll(25,4);
  assert.equal((await lane.readSourceLaneCandidates(repo,[],policy(25),true,at(25))).length,0,'confirmations cannot extend the alert lifetime');
  const feed = await lane.readSourceLaneDropOverlay(repo,[],policy(25),true,at(25));
  assert.equal(feed.drops.length,opened.length,'fresh inventory remains visible beyond alert lifetime');
  assert.equal(feed.drops[0].displayAt,opened[0].sourceDrop.displayAt);
  const contractImport=await import('../src/lib/site-engine-contract.ts');
  const evidenceImport=await import('../src/lib/public-drop-evidence.ts');
  const contract=contractImport.default||contractImport,evidence=evidenceImport.default||evidenceImport;
  const normalized=contract.normalizeDropForSite(feed.drops[0]);
  assert.equal(normalized.timestamp,opened[0].sourceDrop.displayAt,'public feed order stays at episode origin');
  assert.equal(evidence.isFreshPublicDrop(normalized,at(25)),true,'fresh confirmed inventory passes the real public freshness gate');
});

test('R2 fresh positive baseline is canonical feed evidence but never an alert opportunity', async t => {
  const {repo,at,policy,poll,source} = await setup(t);
  await poll(0,3);
  let feed = await lane.readSourceLaneDropOverlay(repo,[],policy(0),true,at(0));
  assert.equal(feed.drops.length,source.subjects.length,'do not hide verified initial inventory');
  assert.equal((await repo.inspect()).opportunities.length,0);
  const origin = feed.drops[0].displayAt;
  await poll(1,4);
  feed = await lane.readSourceLaneDropOverlay(repo,feed.drops,policy(1),true,at(1));
  assert.equal(feed.drops[0].quantity,4); assert.equal(feed.drops[0].displayAt,origin);
  assert.equal((await lane.readSourceLaneCandidates(repo,feed.drops,policy(1),true,at(1))).length,0);
});

for (const reason of ['rollback','expired','mismatched-policy','failure','unknown','negative']) test('R2 durable feed ownership: '+reason, async t => {
  const {repo,at,policy,poll,source} = await setup(t);
  await poll(0,0); await poll(1,3);
  const candidates = await lane.readSourceLaneCandidates(repo,[],policy(1),true,at(1));
  const old = candidates.map(c=>({...c.sourceDrop,quantity:99,reviewMarker:'synthetic-old-snapshot'}));
  const unrelated = {...old[0],id:'other-store',storeId:'other-store'};
  let currentPolicy = policy(1), now = at(1), enabled = true;
  if (reason==='rollback') enabled=false;
  if (reason==='expired') now=at(30);
  if (reason==='mismatched-policy') currentPolicy={...currentPolicy,snapshotId:null as any};
  if (reason==='failure') {
    const lease = await repo.acquire(source.id,'failure',at(2));
    await repo.failed(source.id,'failure',lease!.generation,at(2),'http_or_redirect');
  }
  if (reason==='unknown') await poll(2,3,{bible:{byId:new Map()}});
  if (reason==='negative') await poll(2,0);
  const feed = await lane.readSourceLaneDropOverlay(repo,[...old,unrelated],currentPolicy,enabled,now);
  assert.deepEqual(feed.drops.map(d=>d.id),['other-store']);
});

for (const channel of ['email','sms','push']) {
  test('R3 '+channel+' actual caller: final validation immediately precedes provider, attempt telemetry follows actual invocation', async t => {
    const {repo,at,policy,poll} = await setup(t);
    await poll(0,0);await poll(1,3);
    const candidates = (await lane.readSourceLaneCandidates(repo,[],policy(1),true,at(1))).slice(0,1);
    const f = deliveryFixture(candidates,lane,{},channel);
    f.context.runtimeSourceCandidatesStillValid = async (cs:any[]) => {
      const valid = await lane.sourceCandidatesStillValid(repo,cs,policy(1),true,at(1));
      f.events.push('validate');return valid;
    };
    const result = await f.run();
    assert.equal(result.errors.length,0,JSON.stringify(result));
    assert.ok(f.sends.length>0,JSON.stringify(result));
    const index = f.events.indexOf('send:'+channel);
    assert.equal(f.events[index-1],'validate',JSON.stringify(f.events));
    assert.ok(f.events.indexOf('trace:provider_attempt:'+channel)>index);
  });
  test('R3 '+channel+' negative committed during preparatory telemetry prevents real caller send', async t => {
    const {repo,at,policy,poll} = await setup(t);
    await poll(0,0);await poll(1,3);
    const candidates = await lane.readSourceLaneCandidates(repo,[],policy(1),true,at(1));
    const f = deliveryFixture(candidates,lane,{},channel);
    let negative=false;
    f.context.traceRuntimeSourceCandidates=async(cs:any[],stage:string,ch:string)=>{
      await repo.trace(cs,stage,ch,at(1));
      if(stage==='considered' && !negative){negative=true;await poll(2,0);}
    };
    f.context.runtimeSourceCandidatesStillValid=(cs:any[])=>lane.sourceCandidatesStillValid(repo,cs,policy(2),true,at(2));
    await f.run({queueMode:'active'});
    assert.equal(negative,true);assert.equal(f.sends.length,0);
    assert.equal((await repo.sql.query("SELECT * FROM source_lane_trace WHERE stage='provider_attempt'")).rows.length,0);
  });
  test('R4 '+channel+' actual failed call emits failure, telemetry failure cannot repeat acceptance', async t => {
    const {repo,at,policy,poll} = await setup(t);
    await poll(0,0);await poll(1,3);
    const candidates = (await lane.readSourceLaneCandidates(repo,[],policy(1),true,at(1))).slice(0,1);
    const f = deliveryFixture(candidates,lane,{},channel);
    const trace = (cs:any[],stage:string,ch:string)=>repo.trace(cs,stage,ch,at(1));
    f.context.traceRuntimeSourceCandidates=trace;
    const reject=async()=>{throw new Error('synthetic transport failure');};
    if(channel==='email')f.context.getResendClient=()=>({emails:{send:reject}});
    if(channel==='sms')f.context.sendTwilioSms=reject;
    if(channel==='push')f.context.sendExpoPushMessages=reject;
    await f.run().catch(()=>{});
    assert.equal((await repo.sql.query("SELECT * FROM source_lane_trace WHERE stage='provider_failed' AND channel=$1",[channel])).rows.length,1);

    // Runtime trace API normally swallows writes; specifically exercise the
    // helper's post-send instrumentation boundary with a throwing callback too.
    let calls=0;
    const accepted=await lane.invokeSourceProvider({validate:async()=>true,send:async()=>{calls++;return 'accepted';},recordAttempt:async()=>{throw Error('telemetry unavailable');}});
    assert.equal(accepted.result,'accepted');assert.equal(calls,1);
  });
}

test('R4 SQL window completeness is not end-to-end outcome coverage',()=>{
  const report=buildSourceLaneUsefulness({complete:true});
  assert.equal(report.windowComplete,true);
  assert.equal(report.endToEndComplete,false);
  assert.equal(report.deviceReceipt,'unavailable');
  assert.equal(report.complete,undefined,'ambiguous complete flag must not advertise full coverage');
});

test('R4 email rendering rejection is not an attempted or failed provider call',async t=>{
  const {repo,at,policy,poll}=await setup(t);await poll(0,0);await poll(1,3);
  const candidates=(await lane.readSourceLaneCandidates(repo,[],policy(1),true,at(1))).slice(0,1);
  const f=deliveryFixture(candidates,lane,{},'email');
  f.context.traceRuntimeSourceCandidates=(cs:any[],stage:string,ch:string)=>repo.trace(cs,stage,ch,at(1));
  f.context.PaidDropAlertEmail=()=>{throw Error('synthetic render failure');};
  const result=await f.run();
  assert.equal(result.errors.length,1);assert.equal(f.sends.length,0);
  assert.equal((await repo.sql.query("SELECT * FROM source_lane_trace WHERE stage IN ('provider_attempt','provider_failed')")).rows.length,0);
});

test('R4 SMS configuration rejection is not an attempted or failed provider call',async t=>{
  const {repo,at,policy,poll}=await setup(t);await poll(0,0);await poll(1,3);
  const candidates=(await lane.readSourceLaneCandidates(repo,[],policy(1),true,at(1))).slice(0,1);
  const f=deliveryFixture(candidates,lane,{},'sms');
  f.context.traceRuntimeSourceCandidates=(cs:any[],stage:string,ch:string)=>repo.trace(cs,stage,ch,at(1));
  const unavailable=()=>{throw new f.context.DefinitiveSmsSendError('synthetic unconfigured SMS');};
  f.context.assertTwilioSmsConfigured=unavailable;
  f.context.sendTwilioSms=async()=>unavailable();
  const result=await f.run();
  assert.equal(result.errors.length,1);
  assert.equal((await repo.sql.query("SELECT * FROM source_lane_trace WHERE stage IN ('provider_attempt','provider_failed')")).rows.length,0);
});

test('R4 onsite terminal trace follows actual inbox success, not failed metadata attempts',async t=>{
  const {repo,at,policy,poll}=await setup(t);await poll(0,0);await poll(1,3);
  const candidates=(await lane.readSourceLaneCandidates(repo,[],policy(1),true,at(1))).slice(0,1);
  for(const fail of [true,false]){
    const f=deliveryFixture(candidates,lane,{},'onSite');
    f.context.traceRuntimeSourceCandidates=(cs:any[],stage:string,ch:string)=>repo.trace(cs,stage,ch,at(1));
    if(fail) {const client=await f.context.clerkClient();client.users.updateUserMetadata=async()=>{throw Error('synthetic metadata rejection');};f.context.clerkClient=async()=>client;}
    await f.run();
    assert.equal((await repo.sql.query("SELECT * FROM source_lane_trace WHERE stage='onsite_committed'")).rows.length,fail?0:1);
  }
});
