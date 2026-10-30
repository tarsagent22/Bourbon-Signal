import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {BourbonBible} from '../../src/core/bible.mjs';
import {collectMnMoCityHiveResearch,mnMoResearchSourceForState} from '../../src/mn-mo-cityhive-research-runtime.mjs';
import {prepareMnMoCityHiveCanary,projectMnMoCityHiveCanary} from '../../src/prepare-mn-mo-cityhive-candidate.mjs';
const root=new URL('../fixtures/mn-mo-cityhive/',import.meta.url),manifest=JSON.parse(await readFile(new URL('receipts.json',root),'utf8'));
const records=JSON.parse(gunzipSync(await readFile(new URL('bible.json.gz',root))).toString()).records;
const bodies=new Map(await Promise.all(manifest.receipts.map(async r=>[r.url,gunzipSync(await readFile(new URL(r.fixturePath,root))).toString()])));
export async function syntheticMnMoCanaryFixture({state,profile='positive16',directory}={}){
 const bible=new BourbonBible(structuredClone(records)),config=mnMoResearchSourceForState(state,{profile}),reportDirectory=path.join(directory,'raw'),env={BOURBON_SIGNAL_SHADOW_MODE:'1',MN_MO_NATIVE_RESEARCH_ENABLED:'1',GITHUB_ACTIONS:'true',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_RUN_ID:'123456789',GITHUB_SHA:'a'.repeat(40),GITHUB_RUN_ATTEMPT:'1'};
 // Explicit synthetic transport/provenance inputs. The old raw bodies remain
 // unchanged; no clock here qualifies real stock or a real hosted source run.
 const report=await collectMnMoCityHiveResearch(config,bible,{env,reportDirectory,incidentDirectory:path.join(directory,'incidents'),fetchText:async(url,{onResponse})=>{const response={ok:true,status:200,url,text:bodies.get(url)};if(!response.text)throw Error('Unknown synthetic fixture URL');await onResponse(response);return response;}});
 const provenance={status:'verified_github_shadow_artifact',state,repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,headSha:env.GITHUB_SHA,currentHead:env.GITHUB_SHA,artifactDigest:'b'.repeat(64),artifactId:'123456'};
 const candidate=await prepareMnMoCityHiveCanary({state,profile,report,reportDirectory,bible,provenance}),projection=projectMnMoCityHiveCanary(report.signals,bible);
 return{scope:'SYNTHETIC_HTTP_CLOCK_AND_PROVENANCE_SCHEMA_ONLY_NOT_ACTUAL_SOURCE_PROOF',bible,config,report,candidate,operational:projection.operational};
}
