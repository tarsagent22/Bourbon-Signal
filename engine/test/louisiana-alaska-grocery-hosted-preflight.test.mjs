import test from 'node:test';import assert from 'node:assert/strict';import {mkdtemp,readFile,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import path from 'node:path';
import {runLouisianaAlaskaGroceryPreflight,LOUISIANA_ALASKA_PREFLIGHT_PLAN} from '../src/run-louisiana-alaska-grocery-preflight.mjs';
import {BourbonBible} from '../src/core/bible.mjs';
import {fixture,mockedCompleteGroceryFetch} from './helpers/synthetic-louisiana-alaska-promotion.mjs';
import {STATE_LIFECYCLE_CONFIG} from '../src/state-lifecycle.mjs';
const bible=new BourbonBible(fixture.records),la=mockedCompleteGroceryFetch('LA'),ak=mockedCompleteGroceryFetch('AK');
const mock=url=>new URL(url).searchParams.get('zipcode')==='70809'||new URL(url).searchParams.get('banner')==='albertsons'?la(url):ak(url);
async function setup(t){const directory=await mkdtemp(path.join(tmpdir(),'la-ak-hosted-preflight-'));t.after(()=>rm(directory,{recursive:true,force:true}));return{output:path.join(directory,'output'),incidentDir:path.join(directory,'incidents'),bible,sleep:async()=>{}};}

test('preflight binds exactly three inactive premises and six one-shot requests with research-only output',async t=>{
 const options=await setup(t);let requests=0;const report=await runLouisianaAlaskaGroceryPreflight({...options,fetchText:url=>{requests++;return mock(url);}});
 assert.equal(report.complete,true);assert.equal(report.requestCount,6);assert.equal(requests,6);assert.deepEqual(report.results.map(row=>row.sourceId),LOUISIANA_ALASKA_PREFLIGHT_PLAN.map(row=>row.id));
 assert.equal(report.shadowRuns,0);assert.equal(report.canaryRuns,0);assert.equal(report.customerCoverageAdded,0);
 assert.ok(report.results.every(row=>row.premiseVerified&&row.rows.length>0));assert.ok(report.results.flatMap(row=>row.rows).every(row=>row.customerVisible===false&&row.researchOnly===true&&!row.eligibleForOnSite&&!row.eligibleForDropFeed&&!row.eligibleForDelivery&&!row.canAlertAsInventory));
 const lifecycle=structuredClone(STATE_LIFECYCLE_CONFIG);lifecycle.activeStates.push('LA');await assert.rejects(()=>runLouisianaAlaskaGroceryPreflight({...options,lifecycle,fetchText:()=>{throw Error('Active preflight HTTP');}}),/inactive LA\/AK/);
});

test('one denied resolver seals its exact status and stops unchanged host requests across both states',async t=>{
 const options=await setup(t);let requests=0;const fetchText=async(url,{onResponse})=>{requests++;const result={status:403,ok:false,url,text:''};onResponse(result);return result;};
 const report=await runLouisianaAlaskaGroceryPreflight({...options,fetchText});assert.equal(report.complete,false);assert.equal(requests,1);assert.equal(report.requestCount,1);
 assert.equal(JSON.parse(await readFile(path.join(options.incidentDir,'LA.json'),'utf8'))['host:www.safeway.com'].httpStatus,403);
 const second=await runLouisianaAlaskaGroceryPreflight({...options,fetchText});assert.equal(second.requestCount,0);assert.equal(requests,1);
});

test('foreign or unrecognized product responses cannot become qualifying source access or inventory proof',async t=>{
 const options=await setup(t),report=await runLouisianaAlaskaGroceryPreflight({...options,fetchText:async url=>url.includes('storeresolver')?mock(url):{status:200,ok:true,url,text:'<html>challenge</html>'}});
 assert.equal(report.complete,false);assert.ok(report.results.every(row=>row.rows.length===0&&row.status==='source_failed'));
});
