import { parseNcDatedAnnouncements } from '../src/collectors/nc-dated-announcements.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { recoveryPolicy, mergePollProjection, validatePollPolicy, failClosedPollRows } from '../src/sources/poll-policy.mjs';
import { requiresStateAlertSuppression } from '../src/state-failure-isolation.mjs';
import { buildAnnouncementAlerts, applyAlertPolicyToCandidate } from '../src/export-site-contract.mjs';

test('partial coverage leaves healthy rows alertable; whole fallback and identity quarantine block',()=>{
  assert.equal(requiresStateAlertSuppression({health:'stale_useful',freshness:{status:'stale'},fallback:{status:'partial'}}),false);
  assert.equal(requiresStateAlertSuppression({health:'blocked',fallback:{status:'partial'}}),true);
  assert.equal(requiresStateAlertSuppression({health:'stale_useful',fallback:{status:'last_published'}}),true);
});
test('failure-specific recovery stops identity retries and honors server backoff',()=>{
  assert.equal(recoveryPolicy('source_identity_or_schema_failure').retry,false);
  assert.equal(recoveryPolicy('source_identity_or_schema_failure').pause,21600);
  assert.equal(recoveryPolicy('browser_artifact_unavailable').pause,3600);
  assert.equal(recoveryPolicy('timeout').retry,true);
  assert.equal(recoveryPolicy('rate_limited',2,7200).backoff,7200);
  assert.equal(recoveryPolicy('timeout',5).pause,3600);
});
test('source projection replaces only owned candidates and expires without resurrecting stale stock',()=>{
  const now=Date.parse('2026-10-09T04:00Z');
  const registry=[{id:'fl:abc',state:'FL',chain:'abc',expiryHours:1}];
  const base=[{id:'old',state:'FL',sourceChain:'abc'},{id:'healthy',state:'NC'}];
  const fresh={id:'new',state:'FL',sourceChain:'abc',observedAt:'2026-10-09T03:30Z',signalAt:'2026-10-09T03:30Z'};
  const jobs=[{source_id:'fl:abc',projection:{candidates:[fresh],drops:[fresh]}}];
  assert.deepEqual(mergePollProjection(base,jobs,registry,'candidates',now).map(c=>c.id),['healthy','new']);
  assert.deepEqual(mergePollProjection(base,jobs,registry,'candidates',now+2*3600000).map(c=>c.id),['healthy']);
  const history=mergePollProjection(base,jobs,registry,'drops',now);
  assert.equal(history.find(c=>c.id==='old').canAlertAsInventory,false);
  assert.equal(history.find(c=>c.id==='healthy').stale,undefined);
});
test('board leads receive shipment freshness, while store stock stays at one hour',()=>{
  const c={state:'NC',eligibleForDelivery:true,tier:'allocated',priorityClass:'major',blockers:[],cautions:[],freshnessHours:48};
  assert.equal(applyAlertPolicyToCandidate({...c,actionabilityClass:'board_or_county_lead'}).eligibleForDelivery,true);
  assert.equal(applyAlertPolicyToCandidate({...c,actionabilityClass:'store_inventory'}).eligibleForDelivery,false);
  assert.equal(applyAlertPolicyToCandidate({...c,actionabilityClass:'board_or_county_lead',freshnessHours:169}).eligibleForDelivery,false);
});
test('official dated bottle announcements dedupe independently of retrieval; generic and expired lotteries stay silent',()=>{
  const now=Date.parse('2026-10-09T04:00Z');
  const event={canAlertAsWatch:true,canonicalId:'bottle',locationName:'Wake ABC',sourceType:'official_lottery',category:'lottery',tier:'allocated',state:'NC',eventKey:'draw',entryDeadline:'2026-10-11T04:00Z',observedAt:'2026-10-08T04:00Z',bottleName:'Test bourbon'};
  assert.equal(buildAnnouncementAlerts([event],now).length,1);
  assert.equal(buildAnnouncementAlerts([event],now)[0].dedupeKey,buildAnnouncementAlerts([{...event,observedAt:'2026-10-09T03:00Z'}],now)[0].dedupeKey);
  for(const patch of [{entryDeadline:null},{canonicalId:null},{sourceType:'catalog'},{entryDeadline:'2026-10-08T04:00Z'},{observedAt:'2026-09-01T04:00Z'}]) assert.equal(buildAnnouncementAlerts([{...event,...patch}],now).length,0);
});

test('current quarantine and catalog demotion revoke candidates without erasing history',()=>{
 const registry=[{id:'fl:abc',state:'FL',chain:'abc',expiryHours:1}];
 const row={id:'fresh',state:'FL',canonicalBottleId:'b',canAlertAsInventory:true};
 const jobs=[{source_id:'fl:abc',projection:{drops:[row],candidates:[row]}}];
 const lookup={byId:new Map([['b',{tier:'allocated'}]])};
 assert.equal(validatePollPolicy(jobs,registry,lookup,{states:[]})[0].projection.candidates.length,1);
 for(const [policy,health] of [[{byId:new Map([['b',{tier:'regular'}]])},{states:[]}],[lookup,{states:[{state:'FL',health:'blocked'}]}]]) {
  const projected=validatePollPolicy(jobs,registry,policy,health)[0].projection;
  assert.equal(projected.candidates.length,0);assert.equal(projected.drops[0].canAlertAsInventory,false);
 }
});
test('expired independently published drops remain visible as history',()=>{
 const now=Date.parse('2026-10-09T04:00Z');
 const row={id:'new',state:'FL',sourceChain:'abc',observedAt:'2026-10-09T01:00Z'};
 const result=mergePollProjection([],[{source_id:'fl:abc',projection:{drops:[row]}}],[{id:'fl:abc',state:'FL',chain:'abc',expiryHours:1}],'drops',now);
 assert.equal(result[0].id,'new');assert.equal(result[0].stale,true);assert.equal(result[0].canAlertAsInventory,false);
});

test('NC dated event parser requires explicit publication, clock zone and lottery entry deadline',()=>{
 const html=row=>`<script type="application/ld+json">${JSON.stringify(row)}</script>`;
 const row={'@type':'Event',name:'Eagle Rare release',datePublished:'2026-10-09T01:00:00Z',startDate:'2026-10-10T09:00:00-04:00'};
 assert.equal(parseNcDatedAnnouncements(html(row)).length,1);
 for(const patch of [{datePublished:null},{startDate:'2026-10-10'},{name:'Eagle Rare lottery',endDate:row.startDate}])assert.equal(parseNcDatedAnnouncements(html({...row,...patch})).length,0);
 assert.equal(parseNcDatedAnnouncements(html({...row,name:'Eagle Rare lottery',entryDeadline:row.startDate}))[0].entryDeadline,row.startDate);
});

test('storage/policy failure never restores owned snapshot stock or deletes unrelated evidence',()=>{
 const registry=[{id:'fl:abc',state:'FL',chain:'abc'}];
 const rows=[{id:'owned',state:'FL',sourceChain:'abc',canAlertAsInventory:true},{id:'healthy',state:'NC',canAlertAsWatch:true}];
 assert.deepEqual(failClosedPollRows(rows,registry,'candidates').map(row=>row.id),['healthy']);
 const drops=failClosedPollRows(rows,registry,'drops');assert.equal(drops[0].stale,true);assert.equal(drops[0].canAlertAsInventory,false);assert.deepEqual(drops[1],rows[1]);
});

test('Ohio dependency readiness never owns or replaces inventory from the signed browser pipeline',()=>{
 const row={id:'ohlq',state:'OH',observedAt:'2026-10-09T03:00Z'};
 const sources=[{id:'oh:browser-artifact',kind:'oh-probe',state:'OH',expiryHours:1}];
 const jobs=[{source_id:'oh:browser-artifact',projection:{probe:true}}];
 assert.deepEqual(mergePollProjection([row],jobs,sources,'candidates'),[row]);
 assert.deepEqual(failClosedPollRows([row],sources,'drops'),[row]);
});
