import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {STATE_LIFECYCLE_CONFIG} from '../../src/state-lifecycle.mjs';
import {collectCityHiveResearchReport,cityHiveResearchSourceForState} from '../../src/research-cityhive-runtime.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from '../../src/collectors/central-cityhive-expansion.mjs';
import {suppressActiveRenewalReport,validateActiveRenewalMaintenance} from '../../src/active-research-renewal.mjs';
import {collectGroceryResearchReport,groceryResearchSourceForState} from '../../src/research-grocery-runtime.mjs';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from '../../src/collectors/western-grocery-premises.mjs';
// Explicitly synthetic authority/raw fixtures. These are never issued source,
// canary or promotion artifacts and never make a network request.
export async function activeRenewalCityHiveFixture({state,directory,bible,soldOutSourceIds=[]}={}){
 await mkdir(directory,{recursive:true});const sources=CENTRAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===state),bodies=new Map();
 const soldOut=value=>{if(!value||typeof value!=='object')return;if(value.merchant_id&&value.product_id&&value.option_id)value.quantity=0;Object.values(value).forEach(soldOut);};
 for(const source of sources){const payload=JSON.parse(await readFile(new URL('../fixtures/central-cityhive/'+source.id+'.json',import.meta.url),'utf8'));if(soldOutSourceIds.includes(source.id))soldOut(payload);bodies.set(source.hostname,'<script type="application/json">'+JSON.stringify(payload)+'</script>');}
 const env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'999990',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_SHA:'a'.repeat(40)};
 const maintenance=validateActiveRenewalMaintenance({workflow:{id:311991230,path:'.github/workflows/refresh-feed.yml',state:'disabled_manually'},queues:Object.fromEntries(['queued','in_progress','requested','waiting','pending'].map(status=>[status,{total_count:0,workflow_runs:[]}])),recent:{total_count:0,workflow_runs:[]},checkedAt:new Date().toISOString(),workflowRunId:env.GITHUB_RUN_ID});
 const prior=process.env.BOURBON_SIGNAL_SHADOW_MODE;process.env.BOURBON_SIGNAL_SHADOW_MODE='1';let report;
 try{report=await collectCityHiveResearchReport(cityHiveResearchSourceForState(state),bible,{env,reportDirectory:directory,incidentFile:path.join(directory,'synthetic-incidents.json'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},readAttempts:async()=>({}),writeAttempts:async()=>{},persistIncidentJournal:async(file,value)=>writeFile(file,JSON.stringify(value)),fetchText:async url=>({ok:true,status:200,url,text:bodies.get(new URL(url).hostname)})});}
 finally{if(prior==null)delete process.env.BOURBON_SIGNAL_SHADOW_MODE;else process.env.BOURBON_SIGNAL_SHADOW_MODE=prior;}
 report=suppressActiveRenewalReport(state,report);report.metadata.manualActiveRenewal.maintenance=maintenance;
 return{state,report,reportDirectory:directory,bible,lifecycleConfig:structuredClone(STATE_LIFECYCLE_CONFIG),provenance:{status:'verified_github_shadow_artifact',state,repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,headSha:env.GITHUB_SHA,currentHead:env.GITHUB_SHA,artifactId:'999991',artifactDigest:'b'.repeat(64)}};
}

export async function activeRenewalGroceryFixture({state,directory,bible}={}){
 await mkdir(directory,{recursive:true});const sources=WESTERN_GROCERY_EXPANSION_SOURCES.filter(source=>source.stateCode===state);
 const stores=sources.map(source=>({locationId:source.merchantId,polarisBannerName:source.banner,domainName:source.resolverDomainName||source.banner,
  address:{line1:source.address.split(',')[0],city:source.city,state,country:'US',zipcode:source.zip}}));
 const env={BOURBON_SIGNAL_SHADOW_MODE:'1',GITHUB_ACTIONS:'true',GITHUB_RUN_ID:'999990',GITHUB_REPOSITORY:'tarsagent22/Bourbon-Signal',GITHUB_SHA:'a'.repeat(40)};
 const maintenance=validateActiveRenewalMaintenance({workflow:{id:311991230,path:'.github/workflows/refresh-feed.yml',state:'disabled_manually'},queues:Object.fromEntries(['queued','in_progress','requested','waiting','pending'].map(status=>[status,{total_count:0,workflow_runs:[]}])),recent:{total_count:0,workflow_runs:[]},checkedAt:new Date().toISOString(),workflowRunId:env.GITHUB_RUN_ID});
 let report=await collectGroceryResearchReport(groceryResearchSourceForState(state),bible,{env,reportDirectory:directory,attemptsFile:path.join(directory,'synthetic-attempts.json'),cursorDir:path.join(directory,'cursor'),sleep:async()=>{},
  fetchText:async value=>{const url=new URL(value),resolver=url.pathname.includes('storeresolver'),store=url.searchParams.get('storeid');
   const payload=resolver?{instore:{stores:stores.map(store=>({...store,distance:Number(url.searchParams.get('zipcode'))%23}))}}:{appCode:'GR204',appMsg:'Google Retail returned empty',response:{numFound:0,start:0,miscInfo:{query:url.searchParams.get('q'),filter:`(inventory(${store}, price) >0) AND (inventory(${store},attributes.custom_type_2) = 1)`}}};
   return{ok:true,status:resolver?206:200,url:value,text:JSON.stringify(payload)};}});
 report=suppressActiveRenewalReport(state,report);report.metadata.manualActiveRenewal.maintenance=maintenance;
 return{state,report,reportDirectory:directory,bible,lifecycleConfig:structuredClone(STATE_LIFECYCLE_CONFIG),provenance:{status:'verified_github_shadow_artifact',state,repository:env.GITHUB_REPOSITORY,workflowRunId:env.GITHUB_RUN_ID,headSha:env.GITHUB_SHA,currentHead:env.GITHUB_SHA,artifactId:'999991',artifactDigest:'b'.repeat(64)}};
}
