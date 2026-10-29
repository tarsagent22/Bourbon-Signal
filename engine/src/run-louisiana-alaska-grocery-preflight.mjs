import fs from 'node:fs';
import path from 'node:path';
import {createHash,randomUUID} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {STATE_LIFECYCLE_CONFIG} from './state-lifecycle.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES} from './collectors/louisiana-alaska-grocery-premises.mjs';
import {parseLouisianaAlaskaGroceryInventory,louisianaAlaskaGroceryPremiseMatches,isLouisianaAlaskaGroceryEmptySearch} from './collectors/louisiana-alaska-grocery-expansion.mjs';
import {louisianaAlaskaGroceryLibraryTier} from './louisiana-alaska-grocery-policy.mjs';
import {fetchReviewedLouisianaAlaskaText,validateLouisianaAlaskaIncidentJournal,persistLouisianaAlaskaIncidentJournal} from './collectors/louisiana-alaska-grocery-transport.mjs';
const hash=value=>createHash('sha256').update(value).digest('hex'),DAY=86400000,DENIALS=new Set([401,403,429,435]);
export const LOUISIANA_ALASKA_PREFLIGHT_PLAN=Object.freeze([
  Object.freeze({id:'albertsons-la-1311',zip:'70809'}),Object.freeze({id:'carrsqc-ak-720',zip:'99503'}),Object.freeze({id:'safeway-ak-1820',zip:'99801'}),
]);
const writeJson=(file,value)=>fs.writeFileSync(file,JSON.stringify(value,null,2)+'\n');
export async function runLouisianaAlaskaGroceryPreflight({output,incidentDir,bible,fetchText=fetchReviewedLouisianaAlaskaText,lifecycle=STATE_LIFECYCLE_CONFIG,sleep=ms=>new Promise(r=>setTimeout(r,ms)),signal=AbortSignal.timeout(90000)}={}){
  for(const state of ['LA','AK'])if(lifecycle.activeStates?.includes(state)||lifecycle.states?.[state]?.publicStatus!=='research_only')throw Error('Preflight only accepts inactive LA/AK research states');
  fs.mkdirSync(output,{recursive:true});fs.mkdirSync(incidentDir,{recursive:true});const captures=[],results=[],journals={},files={};let requests=0;
  for(const state of ['LA','AK']){const file=path.join(incidentDir,state+'.json');files[state]=file;journals[state]=validateLouisianaAlaskaIncidentJournal(fs.existsSync(file)?JSON.parse(fs.readFileSync(file,'utf8')):{},state);persistLouisianaAlaskaIncidentJournal(file,journals[state]);}
  const blocked=host=>Object.values(journals).some(journal=>journal['host:'+host]&&(journal['host:'+host].status==='access_denied'||Date.parse(journal['host:'+host].nextAllowedAt)>Date.now()));
  async function request(url,state,label){
    signal.throwIfAborted();const host=new URL(url).hostname;
    if(blocked(host))return{ok:false,status:0,text:'',skipped:true,reason:'Persisted denied or unfinished host; no HTTP'};
    if(requests>=6)throw Error('Preflight six-request limit reached');
    await sleep(requests?400:0);signal.throwIfAborted();const at=new Date().toISOString(),journal=journals[state];
    journal['host:'+host]={status:'in_flight',httpStatus:null,lastAttemptAt:at,nextAllowedAt:new Date(Date.parse(at)+DAY).toISOString(),requestId:randomUUID(),urlSha256:hash(url)};
    persistLouisianaAlaskaIncidentJournal(files[state],journal);requests++;
    const verify=result=>{const a=new URL(url),b=new URL(result.url);a.searchParams.sort();b.searchParams.sort();if(a.href!==b.href)throw Error('Preflight exact source URL changed');return result;};
    const onResponse=result=>{verify(result);if(DENIALS.has(Number(result.status))){journal['host:'+host]={status:'access_denied',httpStatus:Number(result.status),reviewRequired:true,lastAttemptAt:at,nextAllowedAt:new Date(Date.parse(at)+Math.max(DAY,(Number(result.retryAfterSeconds)||0)*1000)).toISOString()};persistLouisianaAlaskaIncidentJournal(files[state],journal);}};
    let response;
    try{response=verify(await fetchText(url,{signal,onResponse}));onResponse(response);
      if(!DENIALS.has(Number(response.status))&&Number(response.status)>=100){delete journal['host:'+host];persistLouisianaAlaskaIncidentJournal(files[state],journal);}
    }catch(error){captures.push({url,state,label,startedAt:at,finishedAt:new Date().toISOString(),error:error.message});writeJson(path.join(output,'captures.json'),captures);return{ok:false,status:0,text:'',error:error.message};}
    const bytes=Buffer.from(response.text||''),packed=gzipSync(bytes),file=label+'.txt.gz';fs.writeFileSync(path.join(output,file),packed);
    captures.push({url,state,label,status:response.status,ok:response.ok===true,startedAt:at,finishedAt:new Date().toISOString(),file,decodedBytes:bytes.length,decodedSha256:hash(bytes),gzipSha256:hash(packed)});writeJson(path.join(output,'captures.json'),captures);return response;
  }
  for(const plan of LOUISIANA_ALASKA_PREFLIGHT_PLAN){
    const source=LOUISIANA_ALASKA_GROCERY_SOURCES.find(row=>row.id===plan.id),state=source.stateCode;
    if(blocked(source.host)){results.push({sourceId:source.id,state,host:source.host,premiseVerified:false,status:'persisted_host_block',queryRequests:0,rows:[]});continue;}
    const resolver=await request('https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode='+plan.zip+'&radius=50&size=100',state,source.id+'-resolver');
    let premiseVerified=false;try{premiseVerified=resolver.ok===true&&JSON.parse(resolver.text).instore?.stores?.some(store=>louisianaAlaskaGroceryPremiseMatches(source,store))===true;}catch{}
    if(!premiseVerified){results.push({sourceId:source.id,state,host:source.host,premiseVerified:false,status:'resolver_not_verified',queryRequests:0,rows:[]});continue;}
    const base='https://'+source.host,params=new URLSearchParams({'request-id':String(Date.now()),url:base,pageurl:base,pagename:'search',rows:'100',start:'0','search-type':'keyword',storeid:source.merchantId,featured:'true','search-uid':'',q:'bourbon',channel:'instore',banner:source.banner});
    const observedAt=new Date().toISOString(),response=await request(base+'/abs/pub/xapi/search/substitute?'+params,state,source.id+'-bourbon');let payload;try{payload=JSON.parse(response.text);}catch{}
    const rows=response.ok&&Array.isArray(payload?.response?.docs)?parseLouisianaAlaskaGroceryInventory(payload,source,bible,{observedAt}).flatMap(row=>{
      const tier=louisianaAlaskaGroceryLibraryTier(row,bible);return['limited','allocated','unicorn'].includes(tier)?[{...row,tier,researchOnly:true,customerVisible:false,productionActivated:false,previewOnly:true,
        alertable:false,canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:false,eligibleForDropFeed:false,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}]:[];
    }):[];
    results.push({sourceId:source.id,state,host:source.host,premiseVerified:true,httpStatus:response.status,queryRequests:response.skipped?0:1,status:response.ok&&(Array.isArray(payload?.response?.docs)||isLouisianaAlaskaGroceryEmptySearch(payload,source,'bourbon'))?'source_observed':'source_failed',rawProductRows:payload?.response?.docs?.length||0,
      canonicalNames:[...new Set(rows.map(row=>row.canonicalName))].sort(),huntingNames:[...new Set(rows.filter(row=>/eagle rare|taylor|blanton|weller|stagg|barrel proof|full proof|booker|mckenna|russell.*(?:13|15)|van winkle|elmer|rock hill|fitzgerald/i.test(row.canonicalName)).map(row=>row.canonicalName))].sort(),rows});
  }
  const report={schemaVersion:1,kind:'bounded_hosted_access_preflight_not_qualifying_shadow_or_promotion',startedAt:captures[0]?.startedAt||null,finishedAt:new Date().toISOString(),requestCount:requests,maxRequests:6,
    researchOnly:true,customerCoverageAdded:0,shadowRuns:0,canaryRuns:0,productionActivationAllowed:false,customerDeliveryAllowed:false,complete:results.length===3&&results.every(row=>row.status==='source_observed'),results,captures};
  writeJson(path.join(output,'report.json'),report);return report;
}
async function main(){
  if(process.env.GITHUB_ACTIONS!=='true'||!process.env.GITHUB_RUN_ID||!process.env.GITHUB_SHA)throw Error('Use the genuine isolated hosted preflight workflow');
  for(const key of ['BOURBON_SIGNAL_AUTO_DEPLOY','ALERT_DELIVERY_ENABLED','ALERT_ONSITE_DELIVERY_ENABLED','ALERT_EMAIL_DELIVERY_ENABLED','ALERT_SMS_DELIVERY_ENABLED'])if(process.env[key]!=='0')throw Error('Preflight requires all publication/delivery controls disabled');
  const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim();if(git('status','--porcelain','--untracked-files=no'))throw Error('Preflight source must be committed');
  const library=JSON.parse(fs.readFileSync('out/library-catalog.json','utf8')),age=Date.now()-Date.parse(library.fetchedAt);if(!Number.isFinite(age)||age< -60000||age>3600000)throw Error('Preflight requires the fresh full current app catalog');
  const output=path.resolve('out/shadow/grocery-preflight-'+process.env.GITHUB_RUN_ID+'-'+(process.env.GITHUB_RUN_ATTEMPT||'1'));fs.mkdirSync(path.dirname(output),{recursive:true});fs.mkdirSync(output,{recursive:false});
  const inputs={};for(const file of ['out/library-catalog.json','out/bourbon-bible.json']){const bytes=fs.readFileSync(file);inputs[file]=hash(bytes);fs.writeFileSync(path.join(output,path.basename(file)),bytes);}
  const report=await runLouisianaAlaskaGroceryPreflight({output,incidentDir:path.resolve('out/source-incidents/louisiana-alaska-grocery-preflight'),bible:await BourbonBible.load()});
  const sourceFiles={};for(const file of ['run-louisiana-alaska-grocery-preflight.mjs','collectors/louisiana-alaska-grocery-premises.mjs','collectors/louisiana-alaska-grocery-expansion.mjs','collectors/louisiana-alaska-grocery-transport.mjs','louisiana-alaska-grocery-production-config.mjs','louisiana-alaska-grocery-policy.mjs','collectors/grocery-xapi-identity.mjs','collectors/arizona-xapi-matching.mjs','collectors/arizona-xapi-library-identity.mjs','core/collection-context.mjs','core/collection-http.mjs'])sourceFiles[file]=hash(fs.readFileSync(new URL(file,import.meta.url)));
  const receipt={kind:report.kind,sourceCommit:git('rev-parse','HEAD'),githubSha:process.env.GITHUB_SHA,workflowRunId:process.env.GITHUB_RUN_ID,workflowRunAttempt:process.env.GITHUB_RUN_ATTEMPT,sourceFiles,inputs,reportSha256:hash(fs.readFileSync(path.join(output,'report.json'))),complete:report.complete,requestCount:report.requestCount};writeJson(path.join(output,'receipt.json'),receipt);
  console.log(JSON.stringify({...receipt,stores:report.results.map(row=>({sourceId:row.sourceId,status:row.status,httpStatus:row.httpStatus,premiseVerified:row.premiseVerified,eligibleRows:row.rows.length,huntingNames:row.huntingNames}))},null,2));if(!report.complete)process.exitCode=2;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href)main().catch(error=>{console.error(error);process.exitCode=1;});
