import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {mkdir,readFile,readdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BourbonBible} from './core/bible.mjs';
import {LOUISIANA_ALASKA_GROCERY_SOURCES as ALL,LOUISIANA_ALASKA_RESOLVER_ZIPS} from './collectors/louisiana-alaska-grocery-premises.mjs';
import {classifyLouisianaAlaskaQuery,louisianaAlaskaGroceryPremiseMatches,parseLouisianaAlaskaGroceryInventory} from './collectors/louisiana-alaska-grocery-expansion.mjs';
import {arizonaXapiLibraryQueryAssignments} from './collectors/arizona-xapi.mjs';
import {librarySearchPool} from './library-query-plan.mjs';
import {isLouisianaAlaskaGroceryInventory,louisianaAlaskaGroceryLibraryTier} from './louisiana-alaska-grocery-policy.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
import {withResearchLifecycle} from './research-state-registry.mjs';

const sha=value=>createHash('sha256').update(Buffer.isBuffer(value)?value:JSON.stringify(value)).digest('hex');
const canonical=value=>{const u=new URL(value);u.searchParams.sort();return u.href;};
const STATES=Object.freeze({AK:{requestCount:53,sourceCode:'AK'},LA:{requestCount:43,sourceCode:'LA'}});
const SOURCE_FLAGS=['canAlertAsInventory','canAlertAsWatch','alertable','eligibleForOnSite','eligibleForDropFeed','eligibleForWatch','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms'];
const DELIVERY_FLAGS=['canAlertAsInventory','canAlertAsWatch','alertable','eligibleForWatch','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms'];

function assertSafeReceipt(receipt,report,nowMs){
 const observed=Date.parse(receipt.observedAt),start=Date.parse(report.startedAt),end=Date.parse(report.finishedAt);
 if(!Number.isFinite(observed)||observed<start||observed>end||observed>nowMs||nowMs-observed>2*60*60_000
  ||![200,206].includes(receipt.status)||!Number.isSafeInteger(receipt.bytes)||receipt.bytes<1||receipt.bytes>4*1024*1024
  ||!/^source-captures\/[A-Za-z0-9._-]+\.json$/.test(receipt.artifactPath)||!/^[a-f0-9]{64}$/.test(receipt.sha256||''))throw Error('LA/AK source receipt is stale, malformed, or outside its source budget');
}
function compareSignal(actual,expected){
 for(const key of ['id','state','productId','variantId','canonicalBottleId','canonicalName','rawName','sourceChain','merchantId','storeId','storeAddress','city','postalCode','price','quantity','quantityIsExact','inventorySemantics'])
  assert.deepEqual(actual[key],expected[key],`Captured source replay changed ${key}`);
 for(const key of ['source','merchantId','storeId','storeAddress','productId','variantId','rawName','canonicalBottleId','price','premisesVerified','inStoreChannelVerified','inventorySemantics'])
  assert.deepEqual(actual.sourceProductBinding?.[key],expected.sourceProductBinding?.[key],`Captured source binding changed ${key}`);
 assert.deepEqual(actual.raw?.product,expected.raw?.product,'Captured source product snapshot differs from hosted report');
}

export async function prepareLaakCanary({state,report,reportDirectory,provenance,bible,nowMs=Date.now()}={}){
 if(!Object.hasOwn(STATES,state)||report?.state!==state||provenance?.status!=='verified_github_laak_shadow_artifact'
  ||provenance.repository!=='tarsagent22/Bourbon-Signal'||!provenance.stateSet?.includes(state)
  ||String(provenance.workflowRunId)!==String(report.metadata?.origin?.workflowRunId)
  ||provenance.headSha!==report.metadata?.origin?.commitSha||!/^sha256:[a-f0-9]{64}$/.test(`sha256:${provenance.artifactDigest||''}`))throw Error('Canary requires matching workflow-issued LA/AK artifact provenance');
 if(report.stale!==false||!['useful','positive_evidence_only'].includes(report.status)
  ||report.metadata?.complete!==true||report.metadata?.requestProfileComplete!==true||report.metadata?.negativeComplete!==true
  ||report.metadata?.profileScope!=='COMPLETE_REVIEWED_PROFILE'||report.metadata?.shadowOnly!==true
  ||report.metadata?.productionActivationAllowed!==false||report.metadata?.customerDeliveryAllowed!==false
  ||!Array.isArray(report.metadata.receipts)||!Array.isArray(report.metadata.requests)||!Array.isArray(report.metadata.queryEvidence)
  ||!Array.isArray(report.signals)||!report.signals.length)throw Error('A complete alert-disabled hosted state report is required');
 const sourceSet=ALL.filter(source=>source.stateCode===state),storeIds=sourceSet.map(source=>source.storeId);
 if(!sourceSet.length||report.metadata.selectedStores?.length!==sourceSet.length||storeIds.some(id=>!report.metadata.selectedStores.includes(id))
  ||report.metadata.verifiedPremises?.length!==sourceSet.length||storeIds.some(id=>!report.metadata.verifiedPremises.includes(id)))throw Error('Hosted report does not cover the exact reviewed source premises');
 if(sha(bible.records)!==report.metadata.bibleRecordsSha256)throw Error('Current Bible revision differs from the report; exact bottle identity must be reviewed again');
 const expectedReceipts=STATES[state].requestCount;
 if(report.metadata.receipts.length!==expectedReceipts||report.metadata.requests.length!==expectedReceipts
  ||report.metadata.receipts.length>STATES[state].requestCount)throw Error('Hosted request count differs from the reviewed per-state ceiling');
 const resolver=new Map(),conflicts=new Set(),seenZips=new Set(),inventoryCaptures=[],receiptEvidence=[],seenPaths=new Set();
 for(const [index,receipt] of report.metadata.receipts.entries()){
  assertSafeReceipt(receipt,report,nowMs);
  if(seenPaths.has(receipt.artifactPath))throw Error('Duplicate raw source capture path');seenPaths.add(receipt.artifactPath);
  const body=await readFile(path.join(reportDirectory,receipt.artifactPath));
  if(body.length!==receipt.bytes||sha(body)!==receipt.sha256)throw Error('Raw response bytes do not match their immutable receipt');
  const url=new URL(receipt.url),final=new URL(receipt.finalUrl);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||canonical(url)!==canonical(final))throw Error('Source receipt contains a foreign origin or redirect');
  const request=report.metadata.requests[index];
  if(!request||canonical(request.url)!==canonical(receipt.url)||Number(request.status)!==Number(receipt.status)||request.ok!==true)throw Error('Request journal differs from original response receipt');
  const payload=JSON.parse(body.toString('utf8'));
  if(url.pathname==='/abs/pub/xapi/storeresolver/v2/all'){
   const zip=url.searchParams.get('zipcode');
   if(url.hostname!=='www.safeway.com'||!LOUISIANA_ALASKA_RESOLVER_ZIPS[state]?.includes(zip)||url.searchParams.get('radius')!=='50'
    ||url.searchParams.get('size')!=='100'||seenZips.has(zip)||!Array.isArray(payload.instore?.stores))throw Error('Unexpected or duplicate first-party resolver capture');
   seenZips.add(zip);
   for(const store of payload.instore.stores){const id=String(store.locationId||'');if(!id||conflicts.has(id))continue;
    const key=JSON.stringify([store.polarisBannerName,store.domainName,store.address]);
    if(resolver.has(id)&&resolver.get(id).key!==key){resolver.delete(id);conflicts.add(id);}else resolver.set(id,{key,store});}
  }else{
   const source=sourceSet.find(item=>item.host===url.hostname&&item.merchantId===url.searchParams.get('storeid')&&item.banner===url.searchParams.get('banner'));
   if(!source||url.pathname!=='/abs/pub/xapi/search/substitute'||url.searchParams.get('channel')!=='instore'
    ||url.searchParams.get('rows')!=='100'||url.searchParams.get('start')!=='0')throw Error('Inventory capture is outside exact reviewed store/channel scope');
   const term=url.searchParams.get('q'),disposition=classifyLouisianaAlaskaQuery(payload,source,term,{httpStatus:receipt.status});
   if(disposition==='INVALID')throw Error('Captured inventory response no longer passes the source payload contract');
   const query={sourceId:source.id,storeId:source.storeId,merchantId:source.merchantId,term,url:receipt.url,httpStatus:receipt.status,disposition,bodySha256:receipt.sha256};
   receiptEvidence.push(query);inventoryCaptures.push({source,payload,term,observedAt:receipt.observedAt});
  }
 }
 if(seenZips.size!==LOUISIANA_ALASKA_RESOLVER_ZIPS[state].length
  ||sourceSet.some(source=>!louisianaAlaskaGroceryPremiseMatches(source,resolver.get(source.merchantId)?.store)))throw Error('Original resolver captures do not prove every exact premise');
 const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
 if(!same(receiptEvidence,report.metadata.queryEvidence))throw Error('Replayed source query evidence differs from the report journal');
 const plan=report.metadata.librarySearchPlan,pool=new Set(librarySearchPool(bible));
 if(plan?.schemaVersion!==1||plan.sourceKey!==`${state}:grocery-xapi-expansion`||plan.budget!==8||plan.terms?.length!==8
  ||new Set(plan.terms).size!==8||plan.poolSize!==pool.size||plan.terms.some(term=>!pool.has(term))
  ||!Number.isSafeInteger(plan.invocation)||plan.invocation<0)throw Error('Saved research query plan is invalid against the current source rotation');
 const expectedQueryKeys=sourceSet.flatMap(source=>['bourbon','whiskey'].map(term=>`${source.id}|${term}`));
 for(const assignment of arizonaXapiLibraryQueryAssignments(sourceSet.length,{terms:plan.terms,poolSize:plan.poolSize,invocation:plan.invocation}))
  expectedQueryKeys.push(`${sourceSet[assignment.storeIndex].id}|${assignment.term}`);
 const actualQueryKeys=receiptEvidence.map(row=>`${row.sourceId}|${row.term}`);
 if(JSON.stringify(actualQueryKeys.sort())!==JSON.stringify(expectedQueryKeys.sort()))throw Error('Saved per-store searches differ from the reviewed bounded query assignment');
 const bySource=new Map();
 for(const source of sourceSet){
  const captures=inventoryCaptures.filter(item=>item.source===source);
  if(!['bourbon','whiskey'].every(term=>captures.some(item=>item.term===term)))throw Error('A reviewed store lacks both broad current inventory searches');
  for(const capture of captures){
   for(const row of parseLouisianaAlaskaGroceryInventory(capture.payload,capture.source,bible,{observedAt:capture.observedAt})){
    if(!isLouisianaAlaskaGroceryInventory(row))throw Error('Replayed captured row violates current exact inventory policy');
    const tier=louisianaAlaskaGroceryLibraryTier(row,bible);if(!['limited','allocated','unicorn'].includes(tier))continue;
    row.tier=tier;const existing=bySource.get(row.id);if(!existing)bySource.set(row.id,row);
   }
  }
 }
 const hosted=new Map(report.signals.map(row=>[row.id,row]));
 if(hosted.size!==report.signals.length||hosted.size!==bySource.size)throw Error('Current source replay row count differs from hosted report');
 for(const [id,row] of bySource){const saved=hosted.get(id);if(!saved)throw Error('Current replay has an unreported positive row');compareSignal(row,saved);
  if(saved.state!==state||saved.observedAt!==report.startedAt||saved.sourceProductBinding?.observedAt!==report.startedAt
   ||saved.sourceProductBinding?.shadowOnly!==true||saved.raw?.shadowOnly!==true
   ||SOURCE_FLAGS.some(flag=>saved[flag]!==false))throw Error('Hosted positive row changed original run clock or shadow-only policy');}
 const replayedRows=[...bySource.values()],operational=replayedRows.map(row=>canonicalizeSignal(row,bible));
 const sourceByKey=new Map(replayedRows.map(row=>[`${row.storeId}|${row.productId}`,row]));
 const drops=buildDrops(operational,bibleLookup(bible.records),operational).map(row=>{
  const source=sourceByKey.get(`${row.storeId}|${row.productId}`);
  if(!source)throw Error('Canonical export row is not bound to a replayed exact source product');
  return {...row,sourceProductBinding:source.sourceProductBinding,sourceAvailabilityVerified:true,
   inventorySemantics:source.inventorySemantics,sourceInventorySemantics:source.inventorySemantics,raw:source.raw,previewOnly:true,
   canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,
   eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false};
 });
 if(!drops.length||drops.some(row=>row.state!==state||DELIVERY_FLAGS.some(flag=>row[flag]!==false)
  ||row.eligibleForOnSite!==true||row.eligibleForDropFeed!==true))throw Error('No safe preview rows survived the current canonical export');
 const locations=sourceSet.map(source=>({id:source.storeId,storeId:source.storeId,name:source.name,storeName:source.name,address:source.address,storeAddress:source.address,
  city:source.city,state,zip:source.zip,lat:source.lat,lng:source.lng,type:'store',locationType:'store',source:source.sourceLabel,precision:'store_level',
  searchable:true,collectorAttached:true,hasSignals:drops.some(row=>row.storeId===source.storeId)}));
 const positiveStores=new Set(drops.map(row=>row.storeId));
 const exportedKeys=new Set(drops.map(row=>`${row.storeId}|${row.productId}`));
 return {schemaVersion:1,state,generatedAt:report.finishedAt,scope:'isolated_canary_input_no_production_activation',originalSourceClockPreserved:true,
  workflowSource:provenance,sourceReceipts:report.metadata.receipts.map(row=>({url:row.url,observedAt:row.observedAt,sha256:row.sha256})),
  evidence:{runId:provenance.workflowRunId,reportStartedAt:report.startedAt,reportFinishedAt:report.finishedAt,bibleRecordsSha256:report.metadata.bibleRecordsSha256,
   receiptCount:report.metadata.receipts.length,qualifiedRows:bySource.size,exportRows:drops.length,positiveStoreCount:positiveStores.size,
   currentExportPolicyExclusions:[...bySource.values()].filter(row=>!exportedKeys.has(`${row.storeId}|${row.productId}`)).map(row=>({storeId:row.storeId,productId:row.productId,canonicalName:row.canonicalName,reason:'current canonical canary export policy'})),
   positiveStoreIds:[...positiveStores].sort()},locations,drops};
}

async function reportsUnder(dir){const output=[];for(const entry of await readdir(dir,{withFileTypes:true})){const file=path.join(dir,entry.name);if(entry.isDirectory())output.push(...await reportsUnder(file));else if(entry.name==='report.json')output.push(file);}return output;}
const arg=flag=>process.argv.find(value=>value.startsWith(flag+'='))?.slice(flag.length+1);
async function main(){
 const state=arg('--state'),artifact=arg('--artifact-dir'),proofFile=arg('--provenance'),out=arg('--out'),configOut=arg('--config-out');
 if(!Object.hasOwn(STATES,state)||!artifact||!proofFile||out!==`data/canary-inputs/${state}.json`
  ||configOut!==`out/canary-preparation/${state}/lifecycle-research.json`)throw Error('Use fixed AK/LA canary paths with extracted workflow evidence');
 const provenance=JSON.parse(await readFile(proofFile,'utf8')),matches=[];
 for(const file of await reportsUnder(path.resolve(artifact))){const report=JSON.parse(await readFile(file,'utf8'));if(report.state===state&&String(report.metadata?.origin?.workflowRunId)===provenance.workflowRunId)matches.push({file,report});}
 if(matches.length!==1)throw Error('Expected one matching workflow-issued LA/AK report');
 const result=await prepareLaakCanary({state,report:matches[0].report,reportDirectory:path.dirname(matches[0].file),provenance,bible:await BourbonBible.load()});
 const lifecycle=withResearchLifecycle(JSON.parse(await readFile('../src/config/state-lifecycle.json','utf8')));
 await mkdir(path.dirname(out),{recursive:true});await mkdir(path.dirname(configOut),{recursive:true});
 await writeFile(out,JSON.stringify(result,null,2)+'\n');await writeFile(configOut,JSON.stringify(lifecycle,null,2)+'\n');
 console.log(JSON.stringify({state,...result.evidence,generatedAt:result.generatedAt,productionActivationAllowed:false}));
}
if(import.meta.url===(process.argv[1]?pathToFileURL(path.resolve(process.argv[1])).href:''))main().catch(error=>{console.error(error.message);process.exit(1);});
