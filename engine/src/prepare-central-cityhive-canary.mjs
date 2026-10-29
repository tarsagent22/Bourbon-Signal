#!/usr/bin/env node
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory} from './collectors/central-cityhive-expansion.mjs';
import {isCentralCityHiveInventory} from './central-cityhive-policy.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';

// Reparse saved first-party bodies. A mutable report's row list alone is not
// proof. This creates only isolated preview input; source clocks never change.
export async function prepareCentralCityHiveCanary({state,report,bible,captureRoots}={}){
  if(report?.state!==state||!report.sources?.length||!report.sources.every(row=>row.ok===true))throw new Error('A complete matching live shadow report is required');
  const roots=(captureRoots||[path.resolve('out','shadow'),path.resolve('out','research-source-captures')]).map(root=>path.resolve(root));
  const sources=CENTRAL_CITYHIVE_EXPANSION_SOURCES.filter(source=>source.state===state),observedSources=new Set(),rows=new Map(),receipts=[];
  if(!sources.length)throw new Error('No reviewed sources for canary state');
  for(const receipt of report.metadata?.receipts||[]){
    if(receipt.status!==200)throw new Error('Incomplete shadow HTTP proof');
    const url=new URL(receipt.url),source=sources.find(source=>source.hostname===url.hostname);
    if(!source||url.protocol!=='https:'||url.pathname!=='/shop/'||url.searchParams.get('merchant-id')!==source.merchantId)throw new Error('Foreign source capture');
    const file=path.resolve(receipt.file||'');
    if(!roots.some(root=>file.startsWith(root+path.sep)))throw new Error('Source capture escaped the supplied evidence roots');
    if(!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>2*1024*1024)throw new Error('Captured body exceeds the bounded source contract');
    const body=await readFile(file);
    if(body.length!==receipt.bytes||createHash('sha256').update(body).digest('hex')!==receipt.sha256)throw new Error('Captured body does not match HTTP receipt');
    const observedAt=receipt.observedAt;
    const parsed=parseCentralCityHiveInventory(body.toString('utf8'),source,bible,{observedAt});
    for(const row of parsed){if(!isCentralCityHiveInventory(row))throw new Error('Captured candidate is stale or lacks current exact source proof');rows.set(row.id,row);}
    observedSources.add(source.id);receipts.push({url:receipt.url,observedAt,sha256:receipt.sha256});
  }
  if(observedSources.size!==sources.length)throw new Error('Partial state source capture');
  const signals=[...rows.values()],candidates=buildDrops(signals,bibleLookup(bible.records),signals);
  if(!candidates.length)throw new Error('No usable canary candidates');
  const drops=candidates.map(row=>({...row,previewOnly:true,canAlertAsInventory:false,canAlertAsWatch:false,
    eligibleForOnSite:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}));
  return{schemaVersion:1,state,generatedAt:report.finishedAt,scope:'isolated_canary_input_no_production_activation',
    originalSourceClockPreserved:true,sourceReceipts:receipts,drops};
}
function argument(flag){return process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);}
async function main(){
  const state=argument('--state'),reportFile=argument('--report'),out=argument('--out');
  if(!state||!reportFile||!out)throw new Error('Use --state=WI|OK --report=<actual-shadow-report.json> --out=data/canary-inputs/<STATE>.json');
  if(out!==`data/canary-inputs/${state}.json`)throw new Error('Canary output must use the reviewed state input path');
  const report=JSON.parse(await readFile(reportFile,'utf8')),bible=await BourbonBible.load();
  const result=await prepareCentralCityHiveCanary({state,report,bible});
  await mkdir(path.dirname(out),{recursive:true});await writeFile(out,JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify({state,rows:result.drops.length,stores:new Set(result.drops.map(row=>row.storeId)).size,productionActivationAllowed:false}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
