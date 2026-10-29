import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {ADDITIONAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './collectors/central-cityhive-expansion.mjs';
import {NJ_MI_CANDIDATE_STORE_IDS} from './collectors/nj-mi-research-premises.mjs';
import {isNjMiResearchInventory} from './nj-mi-research-policy.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
import {withResearchLifecycle} from './research-state-registry.mjs';

export function buildNjMiCanaryCandidates(rows,bible,{nowMs=Date.now()}={}){
  const operational=rows.filter(row=>isNjMiResearchInventory(row,{nowMs})&&row.raw?.shadowOnly!==true&&row.sourceProductBinding?.shadowOnly!==true).map(row=>canonicalizeSignal(row,bible));
  return buildDrops(operational,bibleLookup(bible.records),operational).map(row=>({...row,previewOnly:true,
    canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
    eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false}));
}
export async function prepareNjMiCanary({state,report,reportDirectory,bible,provenance,nowMs=Date.now()}={}){
  const sources=ADDITIONAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===state&&NJ_MI_CANDIDATE_STORE_IDS.includes(source.storeId));
  if(!['NJ','MI'].includes(state)||report?.state!==state||report.metadata?.complete!==true
    ||report.metadata.scope!=='exact_five_premise_candidate_only'||report.metadata.shadowOnly!==true
    ||report.metadata.productionActivationAllowed!==false||report.metadata.customerDeliveryAllowed!==false
    ||report.sources?.length!==sources.length||!report.sources.every(row=>row.ok===true&&row.matchedBottleCount>0))throw Error('Complete candidate-only state captures are required');
  const origin=report.metadata.origin;
  if(provenance?.status!=='verified_github_shadow_artifact'||provenance.state!==state||provenance.repository!=='tarsagent22/Bourbon-Signal'
    ||origin?.kind!=='github_actions'||String(origin.workflowRunId)!==provenance.workflowRunId||origin.commitSha!==provenance.headSha
    ||origin.repository!==provenance.repository||provenance.headSha!==provenance.currentHead
    ||!/^[a-f0-9]{64}$/.test(provenance.artifactDigest||'')||!/^\d+$/.test(provenance.artifactId||''))throw Error('Verified exact-head GitHub candidate proof is required');
  const receipts=report.metadata.receipts,seen=new Set(),rows=[];
  if(!Array.isArray(receipts)||receipts.length!==sources.length)throw Error('Exact candidate receipt count is required');
  for(const receipt of receipts){
    const observed=Date.parse(receipt.observedAt),age=nowMs-observed,url=new URL(receipt.url);
    const source=sources.find(source=>source.hostname===url.hostname&&source.merchantId===url.searchParams.get('merchant-id'));
    if(!source||seen.has(source.storeId)||!Number.isFinite(age)||age<0||age>2*60*60_000
      ||observed>Date.parse(report.finishedAt)||observed<Date.parse(report.startedAt)||receipt.finalUrl!==receipt.url||receipt.status!==200
      ||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>2*1024*1024)throw Error('Foreign, stale, duplicate or incomplete candidate receipt');
    const expected=new URL(source.categoryUrl);expected.searchParams.delete('subtype');expected.searchParams.set('ch-query',source.prioritySearchTerm||'barrel proof');
    if(url.href!==expected.href)throw Error('Unreviewed candidate query');
    if(!/^source-captures\/[A-Za-z0-9._-]+\.txt$/.test(receipt.artifactPath||''))throw Error('Candidate capture path must be portable and bounded');
    const body=await readFile(path.join(reportDirectory,receipt.artifactPath));
    if(body.length!==receipt.bytes||createHash('sha256').update(body).digest('hex')!==receipt.sha256)throw Error('Candidate body hash/length mismatch');
    const parsed=parseCentralCityHiveInventory(body.toString('utf8'),source,bible,{observedAt:receipt.observedAt});
    if(!parsed.length||!parsed.every(row=>isNjMiResearchInventory(row,{nowMs})))throw Error('Current raw candidate premise/product/pickup proof did not qualify');
    rows.push(...parsed);seen.add(source.storeId);
  }
  if(seen.size!==sources.length)throw Error('Candidate premise scope is incomplete');
  const drops=buildNjMiCanaryCandidates(rows,bible,{nowMs});
  if(!drops.length||new Set(drops.map(row=>row.storeId)).size!==sources.length)throw Error('Current candidate export lost a reviewed premise');
  return{schemaVersion:1,state,generatedAt:report.finishedAt,scope:'isolated_canary_input_no_production_activation',
    originalSourceClockPreserved:true,workflowSource:provenance,sourceReceipts:receipts,
    locations:sources.map(source=>({id:source.storeId,storeId:source.storeId,state,name:source.name,storeName:source.name,
      address:source.address,storeAddress:source.address,city:source.city,zip:source.zip,lat:source.lat,lng:source.lng,
      type:'store',locationType:'store',source:source.sourceLabel,precision:'store_level',searchable:true,collectorAttached:true,hasSignals:true})),drops};
}
const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
  const state=argument('--state'),artifact=argument('--artifact-dir'),proof=argument('--provenance'),out=argument('--out'),configOut=argument('--config-out');
  if(!['NJ','MI'].includes(state)||!artifact||!proof||out!==`data/canary-inputs/${state}.json`
    ||configOut!==`out/canary-preparation/${state}/lifecycle-research.json`)throw Error('Use a reviewed state and fixed NJ/MI canary/config paths');
  const reportDirectory=path.join(path.resolve(artifact),'nj-mi-research',state),report=JSON.parse(await readFile(path.join(reportDirectory,'report.json'),'utf8'));
  const value=await prepareNjMiCanary({state,report,reportDirectory,bible:await BourbonBible.load(),provenance:JSON.parse(await readFile(proof,'utf8'))});
  const lifecycle=withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json','utf8')));
  for(const[file,payload]of [[out,value],[configOut,lifecycle]]){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(payload,null,2)+'\n');}
  console.log(JSON.stringify({state,rows:value.drops.length,stores:value.locations.length,sourceRun:value.workflowSource.workflowRunId,productionActivationAllowed:false}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
