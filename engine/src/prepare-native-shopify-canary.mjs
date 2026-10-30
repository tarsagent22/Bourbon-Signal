import {createHash} from 'node:crypto';
import {nativeShopifySource,isNativeShopifyOnSiteSignal,NATIVE_SHOPIFY_TTL_MS} from './native-shopify-onsite-policy.mjs';
import {collectClosedNativePickupObservation,nativeShopifyCohortHash} from './collectors/native-shopify-onsite.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';

// An explicit, transport-free canary preparer. These inputs alone are NOT a
// GitHub artifact, source admission, immutable promotion or customer proof.
// A future hosted protocol must verify their origin before calling this module.
export async function prepareNativeShopifyCanary({sourceId,captures,bible,nowMs=Date.now()}={}){
 const source=nativeShopifySource(sourceId);
 if(!source||!Array.isArray(captures)||captures.length!==2)throw Error('Exactly two closed native source captures required');
 const bodies=new Map(),receipts=[];
 for(const expected of source.receipts){
  const matches=captures.filter(row=>row.url===expected.url);
  if(matches.length!==1)throw Error('Missing, duplicate or foreign native capture URL');
  const row=matches[0],observed=Date.parse(row.observedAt),age=nowMs-observed;
  if(row.status!==200||row.finalUrl!==expected.url||typeof row.text!=='string'
   ||!Number.isFinite(age)||age<0||age>NATIVE_SHOPIFY_TTL_MS
   ||!Number.isSafeInteger(row.bytes)||row.bytes<1||row.bytes>2*1024*1024
   ||Buffer.byteLength(row.text)!==row.bytes
   ||createHash('sha256').update(row.text).digest('hex')!==row.sha256)throw Error('Invalid, stale, redirected or changed native capture');
  bodies.set(row.url,row.text);
  receipts.push(Object.fromEntries(['url','finalUrl','status','observedAt','bytes','sha256'].map(key=>[key,row[key]])));
 }
 // The oldest necessary response limits the composite observation. A new
 // product response must never renew an older pickup response (or vice versa).
 const observedAt=new Date(Math.min(...receipts.map(row=>Date.parse(row.observedAt)))).toISOString();
 const collected=await collectClosedNativePickupObservation(sourceId,bible,{observedAt,fetchText:async url=>{
  if(!bodies.has(url))throw Error('Native replay escaped the two closed URLs');
  return{ok:true,status:200,url,text:bodies.get(url)};
 }});
 if(collected.signals.length!==1||!collected.signals.every(row=>isNativeShopifyOnSiteSignal(row,{nowMs})))throw Error('Native exact variant/pickup/current-library proof did not qualify');
 const canonical=collected.signals.map(row=>canonicalizeSignal(row,bible));
 const drops=buildDrops(canonical,bibleLookup(bible.records),canonical);
 if(drops.length!==1||!drops.every(row=>isNativeShopifyOnSiteSignal(row,{nowMs})))throw Error('Native canary export lost exact current evidence');
 const store=source.definition.stores[0];
 return{schemaVersion:1,sourceId,state:source.definition.state,scope:'isolated_native_leaf_canary_not_source_or_production_authority',
  generatedAt:new Date(Math.max(...receipts.map(row=>Date.parse(row.observedAt)))).toISOString(),
  sourceCohortSha256:nativeShopifyCohortHash(sourceId),sourceReceipts:receipts,originalSourceClocksPreserved:true,
  productionActivationAllowed:false,customerDeliveryAllowed:false,workflowSource:null,
  locations:[{id:store.id,storeId:store.id,state:source.definition.state,name:store.name,storeName:store.name,
   address:store.address,storeAddress:store.address,city:store.city,zip:store.zip,county:store.county||null,
   lat:null,lng:null,type:'store',locationType:'store',precision:'store_level',searchable:true}],drops};
}

// Leaf-scoped replacement keeps HotSpot and every unrelated TX source intact.
// It never edits lifecycle/state health or retires inherited source warnings.
export function buildNativeShopifyCanaryPayload({baseDrops=[],baseLocations=[],candidate,nowMs=Date.now()}={}){
 const source=nativeShopifySource(candidate?.sourceId),store=source?.definition.stores[0];
 if(!source||candidate.state!==source.definition.state||candidate.sourceCohortSha256!==nativeShopifyCohortHash(candidate.sourceId)
  ||candidate.productionActivationAllowed!==false||candidate.customerDeliveryAllowed!==false||candidate.workflowSource!==null
  ||candidate.scope!=='isolated_native_leaf_canary_not_source_or_production_authority'
  ||!Array.isArray(candidate.drops)||candidate.drops.length!==1
  ||!candidate.drops.every(row=>row.sourceRuntimeId===candidate.sourceId&&isNativeShopifyOnSiteSignal(row,{nowMs}))
  ||candidate.locations?.length!==1||candidate.locations[0].id!==store.id||candidate.locations[0].storeId!==store.id
  ||candidate.locations[0].name!==store.name||candidate.locations[0].storeName!==store.name
  ||candidate.locations[0].address!==store.address||candidate.locations[0].storeAddress!==store.address
  ||candidate.locations[0].city!==store.city||candidate.locations[0].state!==source.definition.state||candidate.locations[0].zip!==store.zip
  ||candidate.locations[0].lat!==null||candidate.locations[0].lng!==null)throw Error('Unvalidated native leaf canary payload');
 return{drops:[...baseDrops.filter(row=>row.sourceRuntimeId!==candidate.sourceId),...structuredClone(candidate.drops)],
  locations:[...baseLocations.filter(row=>String(row.storeId||row.id)!==store.id),...structuredClone(candidate.locations)],
  previewPolicy:{mode:'isolated_native_leaf_canary',sourceId:candidate.sourceId,state:candidate.state,
   alertDeliveryEnabled:false,productionSnapshotPublicationEnabled:false,productionDeploymentEnabled:false},
  lifecycleChanged:false,stateHealthChanged:false};
}
