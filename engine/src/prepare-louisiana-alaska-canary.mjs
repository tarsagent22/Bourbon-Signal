import {readFile,readdir,mkdir,writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES,LOUISIANA_ALASKA_RESOLVER_ZIPS} from './collectors/louisiana-alaska-grocery-premises.mjs';
import {louisianaAlaskaGroceryPremiseMatches,parseLouisianaAlaskaGroceryInventory,classifyLouisianaAlaskaQuery,hasLouisianaAlaskaPositiveEvidenceOnly} from './collectors/louisiana-alaska-grocery-expansion.mjs';
import {verifyLouisianaAlaskaPositiveCaptures} from './louisiana-alaska-grocery-positive-proof.mjs';
import {isLouisianaAlaskaGroceryInventory} from './louisiana-alaska-grocery-policy.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
import {withResearchLifecycle} from './research-state-registry.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function prepareLouisianaAlaskaCanary({state,report,reportDirectory,bible,provenance,nowMs=Date.now()}={}){
  const positiveOnly=hasLouisianaAlaskaPositiveEvidenceOnly(report?.metadata,report?.signals,state);
  if(!['LA','AK'].includes(state)||report?.state!==state||(report.metadata?.complete!==true&&!positiveOnly)
    ||!report.sources?.length||!report.sources.every(row=>row.ok===true))throw new Error('A complete matching grocery shadow report is required');
  const origin=report.metadata.origin;
  if(provenance?.headSha!==provenance?.currentHead)throw Error('LA/AK canary requires exact source head; issue fresh shadows after any code change');
  if(provenance?.status!=='verified_github_shadow_artifact'||provenance.state!==state
    ||origin?.kind!=='github_actions'||String(origin.workflowRunId)!==provenance.workflowRunId
    ||origin.repository!==provenance.repository||origin.commitSha!==provenance.headSha)throw new Error('Canary input requires verified workflow-issued shadow provenance');
  const positiveAudit=positiveOnly?await verifyLouisianaAlaskaPositiveCaptures({state,report,reportDirectory,bible,nowMs}):null;
  const sources=LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source=>source.stateCode===state),resolver=new Map(),conflicts=new Set();
  const inventories=[],resolverZips=new Set(),receipts=[];
  for(const receipt of report.metadata.receipts||[]){
    const observedMs=Date.parse(receipt.observedAt),age=nowMs-observedMs;
    if(!Number.isFinite(age)||age<0||age>2*60*60_000)throw new Error('Shadow HTTP source observation is stale or future-dated; collect again');
    if(![200,206].includes(receipt.status)||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>4*1024*1024)throw new Error('Incomplete shadow HTTP capture');
    const relative=receipt.artifactPath;
    if(typeof relative!=='string'||!/^source-captures\/[A-Za-z0-9._-]+\.json$/.test(relative))throw new Error('Source capture path is not portable and bounded');
    const body=await readFile(path.join(reportDirectory,relative));
    if(body.length!==receipt.bytes||sha(body)!==receipt.sha256)throw new Error('Source body does not match its immutable receipt');
    const url=new URL(receipt.url),final=new URL(receipt.finalUrl);
    const canonical=value=>{value.searchParams.sort();return value.href;};
    if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||canonical(url)!==canonical(final))throw new Error('Foreign or redirected source capture');
    const payload=JSON.parse(body);
    if(url.pathname==='/abs/pub/xapi/storeresolver/v2/all'){
      const zip=url.searchParams.get('zipcode');
      if(url.hostname!=='www.safeway.com'||!LOUISIANA_ALASKA_RESOLVER_ZIPS[state].includes(zip)
        ||url.searchParams.get('radius')!=='50'||url.searchParams.get('size')!=='100'||resolverZips.has(zip)
        ||!Array.isArray(payload.instore?.stores))throw new Error('Unexpected or duplicate resolver capture');
      resolverZips.add(zip);
      for(const store of payload.instore.stores){
        const id=String(store.locationId),key=JSON.stringify([store.polarisBannerName,store.domainName,store.address]);
        if(conflicts.has(id))continue;
        if(resolver.has(id)&&resolver.get(id).key!==key){resolver.delete(id);conflicts.add(id);}else resolver.set(id,{key,store});
      }
    }else{
      const source=sources.find(s=>s.host===url.hostname&&s.merchantId===url.searchParams.get('storeid')&&s.banner===url.searchParams.get('banner'));
      const disposition=classifyLouisianaAlaskaQuery(payload,source,url.searchParams.get('q'),{httpStatus:receipt.status});
      if(!source||url.pathname!=='/abs/pub/xapi/search/substitute'||url.searchParams.get('channel')!=='instore'
        ||url.searchParams.get('rows')!=='100'||url.searchParams.get('start')!=='0'
        ||!(['BOUND_PRODUCTS','CONFIRMED_EMPTY'].includes(disposition)||positiveAudit&&disposition==='UNCONFIRMED_EMPTY_QUERY'))throw new Error('Unreviewed store/channel inventory capture');
      inventories.push({source,payload,observedAt:receipt.observedAt,term:url.searchParams.get('q')});
    }
    receipts.push({url:receipt.url,observedAt:receipt.observedAt,sha256:receipt.sha256});
  }
  if(resolverZips.size!==LOUISIANA_ALASKA_RESOLVER_ZIPS[state].length
    ||sources.some(source=>!louisianaAlaskaGroceryPremiseMatches(source,resolver.get(source.merchantId)?.store)))throw new Error('Current exact premise proof is incomplete');
  const rows=new Map();
  for(const source of sources){
    const captures=inventories.filter(capture=>capture.source===source);
    if(!['bourbon','whiskey'].every(term=>captures.some(capture=>capture.term===term)))throw new Error('A reviewed premise lacks its complete broad inventory capture');
    for(const capture of captures)for(const row of parseLouisianaAlaskaGroceryInventory(capture.payload,source,bible,{observedAt:capture.observedAt})){
      if(!isLouisianaAlaskaGroceryInventory(row))throw new Error('Replayed source proof no longer meets the inventory contract');rows.set(row.id,row);
    }
  }
  const operational=[...rows.values()].map(row=>canonicalizeSignal({...row,alertable:false,canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false},bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(row=>({...row,
    canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false}));
  if(!drops.length)throw new Error('No qualified preview rows survived current source and export policy');
  return {schemaVersion:1,state,generatedAt:report.finishedAt,scope:'isolated_canary_input_no_production_activation',
    ...(positiveAudit?{sourceQueryProfile:positiveAudit.summary}:{}),
    originalSourceClockPreserved:true,workflowSource:provenance,sourceReceipts:receipts,
    locations:sources.map(source=>({id:source.storeId,storeId:source.storeId,name:source.name,storeName:source.name,
      address:source.address,storeAddress:source.address,city:source.city,state,zip:source.zip,lat:source.lat,lng:source.lng,
      type:'store',locationType:'store',source:source.sourceLabel,precision:'store_level',searchable:true,
      collectorAttached:true,hasSignals:drops.some(row=>row.storeId===source.storeId)})),drops};
}
async function findReports(directory){const output=[];for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())output.push(...await findReports(file));else if(entry.name==='report.json')output.push(file);}return output;}
const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
  const state=argument('--state'),artifact=argument('--artifact-dir'),proofFile=argument('--provenance'),out=argument('--out'),configOut=argument('--config-out');
  if(!['LA','AK'].includes(state)||!artifact||!proofFile||out!==`data/canary-inputs/${state}.json`
    ||configOut!==`out/canary-preparation/${state}/lifecycle-research.json`)throw new Error('Use reviewed state, extracted artifact/provenance and the fixed state canary/config output paths');
  const provenance=JSON.parse(await readFile(proofFile,'utf8'));
  const files=await findReports(path.resolve(artifact));const matching=[];
  for(const file of files){const report=JSON.parse(await readFile(file,'utf8'));if(report.state===state&&String(report.metadata?.origin?.workflowRunId)===provenance.workflowRunId)matching.push({file,report});}
  if(matching.length!==1)throw new Error('Expected exactly one matching workflow-issued state report');
  const result=await prepareLouisianaAlaskaCanary({state,report:matching[0].report,reportDirectory:path.dirname(matching[0].file),bible:await BourbonBible.load(),provenance});
  const lifecycle=withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json','utf8')));
  for(const[file,value]of [[out,result],[configOut,lifecycle]]){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');}
  console.log(JSON.stringify({state,rows:result.drops.length,sourceRun:provenance.workflowRunId,generatedAt:result.generatedAt,productionActivationAllowed:false}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
