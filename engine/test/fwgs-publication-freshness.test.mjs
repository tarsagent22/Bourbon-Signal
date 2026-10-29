import test from 'node:test';import assert from 'node:assert/strict';
import {FWGS_PUBLICATION_MAX_AGE_MS,FWGS_PUBLICATION_HEADROOM_MS,FWGS_REUSABLE_SOURCE_MAX_AGE_MS,fwgsReuseAgeLimit,fwgsPublicationFreshness,browserCollectorRefreshDecision,browserCollectorScripts,targetedPaPublicationAdmission} from '../src/fwgs-publication-freshness.mjs';
import {PENNSYLVANIA_EXPANSION_EXPECTATIONS} from '../src/verify-pa-expansion.mjs';
const now=Date.parse('2026-10-29T16:36:11.189Z'),artifact=(minutes,{chunks}={})=>({generatedAt:new Date(now-minutes*60000).toISOString(),inventoryEndpoint:'/ccstorex/custom/v1/b2b/get-inventory',...(chunks?{chunks}: {})});

test('failed maintenance source would be refused before its ten-minute publication pipeline',()=>{
 const payload={...artifact(0),generatedAt:'2026-10-29T14:45:09.517Z'},before=JSON.stringify(payload),result=fwgsPublicationFreshness(payload,{nowMs:now});
 assert.equal(FWGS_PUBLICATION_MAX_AGE_MS,PENNSYLVANIA_EXPANSION_EXPECTATIONS.maximumAgeMs);assert.equal(FWGS_PUBLICATION_MAX_AGE_MS,120*60000);assert.equal(FWGS_PUBLICATION_HEADROOM_MS,30*60000);assert.equal(FWGS_REUSABLE_SOURCE_MAX_AGE_MS,90*60000);
 assert.equal(result.ok,false);assert.ok(result.remainingMs<10*60000);assert.equal(JSON.stringify(payload),before,'admission cannot renew the source clock');
 const decision=browserCollectorRefreshDecision({rawStates:'CA,NV,NY,TX,IL,ID,PA',browserRefreshMinutes:240,lastBrowserRefreshAt:new Date(now-10*60000).toISOString(),fwgsArtifact:payload,nowMs:now});
 assert.equal(decision.due,true);assert.equal(decision.fwgsOnly,true,'PA source expiry cannot newly schedule Ohio collection');
});

test('only original coherent source clocks with reserved headroom can be reused',()=>{
 assert.equal(fwgsPublicationFreshness(artifact(90),{nowMs:now}).ok,true);
 assert.equal(fwgsPublicationFreshness(artifact(90),{nowMs:now+1}).ok,false);
 assert.equal(fwgsPublicationFreshness(artifact(10),{nowMs:now,maxAgeMs:5*60000}).ok,false);
 assert.equal(fwgsReuseAgeLimit(999999999),90*60000);assert.equal(fwgsReuseAgeLimit(0),0);
 for(const invalid of [-1,NaN,Infinity,1.5])assert.throws(()=>fwgsReuseAgeLimit(invalid),/nonnegative integer/);
 for(const payload of [undefined,{...artifact(10),generatedAt:'bad'},artifact(-1),{...artifact(10),inventoryEndpoint:'/catalog'},
  {...artifact(10),chunks:[{generatedAt:artifact(20).generatedAt}]},{...artifact(10),chunks:[{generatedAt:'bad'}]},
  {...artifact(10),chunks:[{generatedAt:artifact(-1).generatedAt}]},{...artifact(10),chunks:{}}])assert.equal(fwgsPublicationFreshness(payload,{nowMs:now}).ok,false);
 const merged=artifact(20,{chunks:[{generatedAt:artifact(20).generatedAt},{generatedAt:artifact(10).generatedAt}]});assert.equal(fwgsPublicationFreshness(merged,{nowMs:now}).ok,true);
});

test('explicit browser holds and nonbrowser targeted cohorts retain their source boundaries',()=>{
 const common={fwgsArtifact:artifact(111),nowMs:now,lastBrowserRefreshAt:new Date(now-5*60000).toISOString()};
 for(const rawStates of ['CA,NV,NY,TX,IL,ID','CA','NY','TX'])assert.equal(browserCollectorRefreshDecision({...common,rawStates}).due,false);
 assert.equal(browserCollectorRefreshDecision({...common,rawStates:'PA',skip:true}).due,false);
 assert.equal(browserCollectorRefreshDecision({...common,rawStates:'PA',browserRefreshMinutes:999000}).due,false);
 assert.equal(browserCollectorRefreshDecision({...common,rawStates:'OH'}).due,false,'PA age must not change Ohio-only scheduling');
 const ohio=browserCollectorRefreshDecision({...common,rawStates:'OH',lastBrowserRefreshAt:new Date(now-241*60000).toISOString()});assert.equal(ohio.due,true);assert.notEqual(ohio.fwgsOnly,true,'existing interval behavior remains unchanged');
 const normallyDue=browserCollectorRefreshDecision({...common,rawStates:'',lastBrowserRefreshAt:new Date(now-241*60000).toISOString()});assert.equal(normallyDue.due,true);assert.equal(normallyDue.fwgsOnly,false,'Normal interval source plan remains unchanged');
 assert.equal(browserCollectorRefreshDecision({...common,rawStates:'PA',fwgsArtifact:artifact(20)}).due,false);
 assert.equal(browserCollectorRefreshDecision({...common,rawStates:'PA',fwgsArtifact:artifact(20),browserRefreshMinutes:0}).due,true);
 assert.equal(browserCollectorRefreshDecision({...common,rawStates:'',fwgsArtifact:artifact(111)}).fwgsOnly,true);
});


test('PA-only recovery never adds an Ohio script even with an already running CDP session',()=>{
  for(const rawStates of ['PA','VA,PA','CA,NV,NY,TX,IL,ID,PA'])for(const browserStarted of [true,false])assert.deepEqual(browserCollectorScripts({rawStates,browserStarted}),['src/fwgs-browser-full.mjs']);
  assert.deepEqual(browserCollectorScripts({rawStates:'',browserStarted:false,fwgsOnly:true}),['src/fwgs-browser-full.mjs']);
  for(const rawStates of ['','OH','OH,PA'])assert.deepEqual(browserCollectorScripts({rawStates,browserStarted:false}),['src/ohlq-browser-collector.mjs','src/fwgs-browser-full.mjs']);
});


test('targeted PA must enter with headroom while scheduled fallback and unrelated states remain independent',()=>{
  assert.equal(targetedPaPublicationAdmission('PA',artifact(111),{nowMs:now}).ok,false);
  assert.equal(targetedPaPublicationAdmission('CA,PA',artifact(20),{nowMs:now}).ok,true);
  for(const states of ['', 'OH', 'CA,NV,NY,TX,IL,ID'])assert.deepEqual(targetedPaPublicationAdmission(states,artifact(111),{nowMs:now}),{required:false,ok:true});
});
