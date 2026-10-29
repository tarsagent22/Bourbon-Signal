#!/usr/bin/env node
import {readFile,readdir,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './collectors/central-cityhive-expansion.mjs';
import {isCentralCityHiveInventory} from './central-cityhive-policy.mjs';
import {parseCityHiveProducts} from './collectors/cityhive-surfaces.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
import {withResearchLifecycle} from './research-state-registry.mjs';
import {verifyActiveRenewalRawCaptures,attachActiveRenewalCanaryProof} from './active-renewal-capture-proof.mjs';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const canonical=value=>{const url=new URL(value);url.searchParams.sort();return url.href;};

// Only workflow-issued portable raw bodies can produce isolated canary input.
// Report signals, prices, tiers and mutable absolute file paths are never read.
export async function prepareCentralCityHiveCanary({state,report,reportDirectory,bible,provenance,nowMs=Date.now(),lifecycleConfig}={}){
  const sources=CENTRAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===state);
  if(!['WI','OK'].includes(state)||report?.state!==state||report.metadata?.complete!==true
    ||report.metadata.shadowOnly!==true||report.metadata.productionActivationAllowed!==false
    ||report.metadata.customerDeliveryAllowed!==false||report.sources?.length!==sources.length
    ||!report.sources.every(row=>row.ok===true&&sources.some(source=>row.sourceRuntimeId===`research:${state.toLowerCase()}:${source.id}`
      &&row.label===source.sourceLabel&&row.url===source.categoryUrl)))throw new Error('A complete matching isolated CityHive shadow report is required');
  const origin=report.metadata.origin;
  if(provenance?.status!=='verified_github_shadow_artifact'||provenance.state!==state
    ||provenance.repository!=='tarsagent22/Bourbon-Signal'||!/^\d+$/.test(provenance.artifactId||'')
    ||!/^[a-f0-9]{64}$/.test(provenance.artifactDigest||'')||!/^[a-f0-9]{40}$/.test(provenance.headSha||'')
    ||origin?.kind!=='github_actions'||String(origin.workflowRunId)!==provenance.workflowRunId
    ||origin.repository!==provenance.repository||origin.commitSha!==provenance.headSha)throw new Error('Canary requires verified workflow-issued shadow provenance and ZIP digest');
  const finishedMs=Date.parse(report.finishedAt),receipts=report.metadata.receipts;
  if(!Number.isFinite(finishedMs)||finishedMs>nowMs||nowMs-finishedMs>2*60*60_000
    ||!Array.isArray(receipts)||receipts.length<sources.length||receipts.length>sources.length*5)throw new Error('Incomplete or stale shadow receipt set');
  const categorySources=new Set(),seenUrls=new Set(),seenPaths=new Set(),rows=new Map(),proofs=[];
  for(const receipt of receipts){
    const observedMs=Date.parse(receipt.observedAt),age=nowMs-observedMs;
    if(!Number.isFinite(age)||age<0||age>2*60*60_000||observedMs>finishedMs)throw new Error('Shadow source clock is stale or future-dated; collect again');
    if(receipt.status!==200||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>2*1024*1024)throw new Error('Incomplete bounded shadow HTTP proof');
    const url=new URL(receipt.url),source=sources.find(source=>source.hostname===url.hostname);
    if(!source||url.protocol!=='https:'||url.username||url.password||url.port||url.hash
      ||url.pathname!=='/shop/'||url.searchParams.get('merchant-id')!==source.merchantId
      ||canonical(receipt.finalUrl)!==canonical(receipt.url)||seenUrls.has(canonical(receipt.url)))throw new Error('Foreign, redirected or duplicate source capture');
    seenUrls.add(canonical(receipt.url));
    if(canonical(receipt.url)===canonical(source.categoryUrl))categorySources.add(source.id);
    else if([...url.searchParams].length!==2||!url.searchParams.has('ch-query')
      ||!url.searchParams.get('ch-query')?.trim()||url.searchParams.get('ch-query').length>120)throw new Error('Unreviewed CityHive search capture');
    const relative=receipt.artifactPath;
    if(typeof relative!=='string'||!/^source-captures\/[A-Za-z0-9._-]+\.html$/.test(relative)||seenPaths.has(relative))throw new Error('Source capture path must be portable, bounded and unique');
    seenPaths.add(relative);
    const body=await readFile(path.join(reportDirectory,relative));
    if(body.length!==receipt.bytes||sha(body)!==receipt.sha256)throw new Error('Captured body does not match its immutable HTTP receipt');
    let exactPremise=false;
    // The parser invokes this callback only after its exact registered merchant
    // ID and full premise-address checks, including for healthy zero stock.
    parseCityHiveProducts(body.toString('utf8'),source,{sources:CENTRAL_CITYHIVE_EXPANSION_SOURCES,
      isAllowedMerchantConfiguration:()=>{exactPremise=true;return true;}});
    if(!exactPremise)throw new Error('Captured merchant configuration no longer proves the exact registered premise');
    for(const row of parseCentralCityHiveInventory(body.toString('utf8'),source,bible,{observedAt:receipt.observedAt})){
      if(!isCentralCityHiveInventory(row,{nowMs}))throw new Error('Replayed candidate lacks current exact source proof');
      const prior=rows.get(row.id);if(!prior||Date.parse(prior.observedAt)<observedMs)rows.set(row.id,row);
    }
    proofs.push({url:receipt.url,observedAt:receipt.observedAt,sha256:receipt.sha256,artifactPath:relative});
  }
  if(categorySources.size!==sources.length)throw new Error('Partial state source capture: exact merchant category proof is missing');
  const operational=[...rows.values()].map(row=>canonicalizeSignal(row,bible));
  const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(row=>({...row,previewOnly:true,
    canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,
    eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}));
  const renewalAudit=report.metadata.manualActiveRenewal?await verifyActiveRenewalRawCaptures({state,report,reportDirectory,bible,nowMs,lifecycle:lifecycleConfig}):null;
  if(!drops.length&&!renewalAudit)throw new Error('No qualified canary candidates survived current library and export policy');
  const candidate={schemaVersion:1,state,generatedAt:report.finishedAt,scope:'isolated_canary_input_no_production_activation',
    originalSourceClockPreserved:true,workflowSource:provenance,sourceReceipts:proofs,
    locations:sources.map(source=>({id:source.storeId,storeId:source.storeId,state,name:source.name,storeName:source.name,
      address:source.address,storeAddress:source.address,city:source.city,zip:source.zip,type:'store',locationType:'store',
      source:source.sourceLabel,precision:'store_level',searchable:true,collectorAttached:true,
      hasSignals:drops.some(row=>row.storeId===source.storeId)})),drops};
  return renewalAudit?attachActiveRenewalCanaryProof(candidate,renewalAudit):candidate;
}
async function findReports(directory){const files=[];for(const entry of await readdir(directory,{withFileTypes:true})){const file=path.join(directory,entry.name);if(entry.isDirectory())files.push(...await findReports(file));else if(entry.name==='report.json')files.push(file);}return files;}
const argument=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
  const state=argument('--state'),artifact=argument('--artifact-dir'),proofFile=argument('--provenance'),out=argument('--out'),configOut=argument('--config-out');
  if(!['WI','OK'].includes(state)||!artifact||!proofFile||out!==`data/canary-inputs/${state}.json`
    ||configOut!==`out/canary-preparation/${state}/lifecycle-research.json`)throw new Error('Use reviewed state, verified artifact/provenance and fixed state canary/config output paths');
  const provenance=JSON.parse(await readFile(proofFile,'utf8')),matching=[];
  for(const file of await findReports(path.resolve(artifact))){const report=JSON.parse(await readFile(file,'utf8'));if(report.state===state&&String(report.metadata?.origin?.workflowRunId)===provenance.workflowRunId)matching.push({file,report});}
  if(matching.length!==1)throw new Error('Expected exactly one matching workflow-issued state report');
  const result=await prepareCentralCityHiveCanary({state,report:matching[0].report,reportDirectory:path.dirname(matching[0].file),bible:await BourbonBible.load(),provenance});
  const lifecycle=withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json','utf8')));
  for(const[file,value]of [[out,result],[configOut,lifecycle]]){await mkdir(path.dirname(file),{recursive:true});await writeFile(file,JSON.stringify(value,null,2)+'\n');}
  console.log(JSON.stringify({state,rows:result.drops.length,stores:result.locations.length,sourceRun:provenance.workflowRunId,productionActivationAllowed:false}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
