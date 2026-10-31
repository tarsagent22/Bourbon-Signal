import {pacedRequestGate,forEachStoreBounded} from './paced-store-workers.mjs';
import { arizonaXapiLibraryQueryAssignments } from './arizona-xapi.mjs';
import { stableId } from '../core/text.mjs';
import { librarySourceSearchPlan } from '../library-search-runtime.mjs';
import { parseBoundGroceryXapiInventory } from './grocery-xapi-identity.mjs';
import { WESTERN_GROCERY_EXPANSION_SOURCES, WESTERN_GROCERY_RESOLVER_ZIPS } from './western-grocery-premises.mjs';

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const DROP_TIERS = new Set(['limited','allocated','highly_allocated','unicorn']);
export const GROCERY_EXPANSION_REQUEST_LIMIT = 127;
export const CALIFORNIA_GROCERY_TRANSIENT_RETRY_LIMIT = 8;
export const ILLINOIS_GROCERY_TRANSIENT_RETRY_LIMIT = 8;
export const GROCERY_EXPANSION_REQUEST_LIMITS = Object.freeze({IL:2700,WA:127,CA:914+CALIFORNIA_GROCERY_TRANSIENT_RETRY_LIMIT,NM:43});
const GROCERY_EXPANSION_STORE_LIMITS = Object.freeze({IL:180,WA:58,CA:433,NM:16});
export const ILLINOIS_GROCERY_PRIORITY_TERMS=Object.freeze(['weller','eagle rare','e.h. taylor',"blanton's",'stagg',"michter's","booker's",'old fitzgerald']);
const publicStoreKey = '7bad9afbb87043b28519c4443106db06';
const publicSearchKey = 'e914eec9448c4d5eb672debf5011cf8f';

export function isGroceryExpansionEmptyResolver(payload,stateCode){
  if(stateCode!=='IL')return false;
  const channel=payload?.instore,error=channel?.errors?.[0];
  return channel?.count===0&&channel.ack==='1'
    &&Object.keys(channel).sort().join('|')==='ack|count|errors'
    &&Array.isArray(channel.errors)&&channel.errors.length===1
    &&error?.code==='SR-0003'&&error.statusCode===404
    &&error.message==='No store founds for entered search criteria'
    &&Object.keys(error).sort().join('|')==='code|message|statusCode';
}

export function groceryExpansionPremiseMatches(source, store) {
  const address=store?.address;
  return String(store?.locationId || '')===source.merchantId && address?.state===source.stateCode
    && address?.country==='US' && normalize(store.polarisBannerName)===source.banner
    && normalize(store.domainName)===normalize(source.resolverDomainName || source.banner)
    && normalize(`${address.line1}, ${address.city}, ${address.state} ${address.zipcode}`)===normalize(source.address);
}

function currentDropTarget(record,state) {
  return record?.libraryAlertEligible!==false && record?.libraryIdentities?.some(bottle=>
    bottle.isAlertEligible!==false && DROP_TIERS.has(bottle.stateOverrides.find(o=>o.jurisdiction===state)?.tier || bottle.nationalTier));
}

export function groceryProductSnapshot(product) {
  return Object.fromEntries(['id','pid','storeId','name','upc','price','containsAlcohol','alcoholVolumePct',
    'dispItemSizeQty','dispItemPackageQty','dispUnitOfMeasure','unitOfMeasure'].map(key=>[key,product[key]]).concat([
      ['channelEligibility',{inStore:product.channelEligibility?.inStore}],
      ['channelInventory',Object.fromEntries(['instore','inStore','instoreItemQty','inStoreItemQty'].filter(key=>product.channelInventory?.[key]!==undefined).map(key=>[key,product.channelInventory[key]]))]
    ]));
}

export function isGroceryExpansionEmptySearch(payload,source,term,{start=0}={}){
  if(!WESTERN_GROCERY_EXPANSION_SOURCES.includes(source)||payload?.appCode!=='GR204'
    ||typeof term!=='string'||!term.trim()||!Number.isInteger(start)
    ||![0,...(source.stateCode==='IL'&&['bourbon','whiskey'].includes(term)?[100,200]:[])].includes(start))return false;
  // Captured Illinois responses sometimes omit the entire response object for
  // Google's explicit empty result. This exact closed form is healthy zero;
  // it never proves stock, a positive store, or a bottle identity.
  if(source.stateCode==='IL'&&JSON.stringify(Object.keys(payload).sort())===JSON.stringify(['appCode','appMsg'])
    &&payload.appMsg==='GR : Google Retail returned empty response..')return true;
  if(payload.response?.numFound!==0||payload.response?.start!==start
    ||Object.hasOwn(payload.response,'docs')||payload.response.miscInfo?.query!==term)return false;
  const filter=payload.response.miscInfo.filter;
  return typeof filter==='string'
    &&filter.includes(`(inventory(${source.merchantId}, price) >0)`)
    &&filter.includes(`(inventory(${source.merchantId},attributes.custom_type_2) = 1)`);
}

export function parseGroceryExpansionInventory(payload, source, bible, {observedAt}={}) {
  if(!WESTERN_GROCERY_EXPANSION_SOURCES.includes(source) || !Number.isFinite(Date.parse(observedAt)))return [];
  return parseBoundGroceryXapiInventory(payload,source,bible).filter(row=>currentDropTarget(row.record,source.stateCode) && Number.isFinite(row.price) && row.price>0).map(row=>({
    id:stableId([source.stateCode,'grocery-xapi',source.merchantId,row.productId]),state:source.stateCode,stateCode:source.stateCode,
    sourceLabel:source.sourceLabel,sourceUrl:`https://${source.host}/shop/product-details.${row.productId}.html`,
    sourceChain:source.id,merchantId:source.merchantId,productId:row.productId,variantId:row.variantId,
    rawName:row.title,canonicalBottleId:row.record.id,canonicalName:row.record.canonical,tier:row.record.tier,
    sourceBottleMatchMethod:row.matchMethod,confidence:.86,eventType:'retailer_store_inventory_result',
    locationPrecision:'store_level',locationName:source.name,storeName:source.name,storeId:source.storeId,
    storeAddress:source.address,address:source.address,city:source.city,postalCode:source.zip,zip:source.zip,
    lat:source.lat,lng:source.lng,quantity:row.quantity,quantityIsExact:row.inventorySemantics==='exact_retailer_quantity',
    price:row.price,observedAt,fetchedAt:observedAt,availabilityStatus:'in_stock',
    availabilityLabel:row.quantity>0?`Retailer reports ${row.quantity} available`:'Retailer reports in-store availability',
    sourceAvailabilityVerified:true,canAlertAsInventory:true,canAlertAsWatch:true,dataLane:'inventory',
    inventorySemantics:row.inventorySemantics,
    caveat:'First-party in-store availability may change. Verify with the retailer before driving.',
    evidence:`${source.name} reports ${row.title} available at ${source.address}${row.quantity>0?` with quantity ${row.quantity}`:''}.`,
    sourceProductBinding:{schemaVersion:1,source:'grocery-xapi',merchantId:source.merchantId,storeId:source.storeId,
      storeAddress:source.address,productId:row.productId,variantId:row.variantId,rawName:row.title,
      canonicalBottleId:row.record.id,price:row.price,observedAt,premisesVerified:true,inStoreChannelVerified:true,
      inventorySemantics:row.inventorySemantics,productSnapshot:groceryProductSnapshot(row.rawProduct)},
    raw:{chain:source.id,merchantId:source.merchantId,product:groceryProductSnapshot(row.rawProduct),
      inventorySemantics:row.inventorySemantics,reportedQuantity:row.reportedQuantity,fulfillmentPolicyVerified:true}
  }));
}

export async function collectGroceryExpansion(config,bible,{fetchText,observedAt=new Date().toISOString(),signal,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts={},nowMs=Date.now(),cursorDir,persistAttempts=async()=>{}}={}) {
  if(typeof fetchText!=='function')throw new Error('Bounded first-party fetchText is required');
  const sources=WESTERN_GROCERY_EXPANSION_SOURCES.filter(source=>source.stateCode===config.id);
  const requestLimit=GROCERY_EXPANSION_REQUEST_LIMITS[config.id];
  if(!sources.length || !requestLimit || sources.length>GROCERY_EXPANSION_STORE_LIMITS[config.id])throw new Error('Grocery expansion exceeds reviewed state/store budget');
  const requests=[],signals=[],roadblocks=[],sourceAttempts={...attempts},blockedHosts=new Set();
  const retryLimit=config.id==='CA'?CALIFORNIA_GROCERY_TRANSIENT_RETRY_LIMIT:config.id==='IL'?ILLINOIS_GROCERY_TRANSIENT_RETRY_LIMIT:0;
  let transientRetries=0;
  const deep=config.id==='IL';
  const gate=deep?pacedRequestGate({intervalMs:500,sleep,signal}):null;
  for(const[key,value]of Object.entries(attempts))if(key.startsWith('host:')&&Date.parse(value.nextAllowedAt)>nowMs)blockedHosts.add(key.slice(5));
  const attemptRequest=async(url,kind,source=null,term=null)=>{
    signal?.throwIfAborted();const host=new URL(url).hostname;
    if(gate)await gate();
    if(blockedHosts.has(host))return null;
    if(requests.length>=requestLimit)throw new Error('Grocery expansion request ceiling reached');
    if(!gate&&requests.length)await sleep(400);
    // Reserve before awaiting I/O so concurrent workers share the same ceiling.
    const receipt={kind,sourceId:source?.id||null,merchantId:source?.merchantId||null,term,url,status:0,ok:false,observedAt:new Date().toISOString()};
    requests.push(receipt);
    const response=await fetchText(url,{signal,timeoutMs:15000,maxBytes:4*1024*1024,maxRedirects:0,
      headers:{accept:'application/json','ocp-apim-subscription-key':kind==='resolver'?publicStoreKey:publicSearchKey}});
    Object.assign(receipt,{status:response.status||0,ok:response.ok===true,observedAt:new Date().toISOString()});
    if([401,403,429,435].includes(Number(response.status))){
      const deniedAt=new Date().toISOString();
      blockedHosts.add(host);sourceAttempts[`host:${host}`]={lastAttemptAt:deniedAt,status:'access_denied',httpStatus:response.status,nextAllowedAt:new Date(Date.parse(deniedAt)+86_400_000).toISOString()};
      // Persist denial immediately; a later timeout/publication failure must not erase it.
      await persistAttempts(structuredClone(sourceAttempts));
    }
    if(!response.ok && response.status!==206)roadblocks.push({state:config.id,source:source?.sourceLabel || 'Grocery store resolver',url,status:response.status||0,error:response.error || `HTTP ${response.status}`});
    return response;
  };
  const request=async(url,kind,source=null,term=null)=>{
    const first=await attemptRequest(url,kind,source,term);
    // One retry for a transient transport/server failure, with a shared cap.
    // Denials, rate limits, schema failures and aborted runs never retry.
    if(!first || first.ok || ![0,408,500,502,503,504].includes(Number(first.status))
      || transientRetries>=retryLimit || Number(first.retryAfterSeconds)>2)return first;
    signal?.throwIfAborted();
    transientRetries++;
    await sleep(Math.max(1000,(Number(first.retryAfterSeconds)||0)*1000));
    return attemptRequest(url,kind,source,term);
  };
  const resolver=new Map(),conflicts=new Set(),resolverEmptyZips=[],resolverFailures=[];let resolverComplete=true;
  for(const zip of WESTERN_GROCERY_RESOLVER_ZIPS[config.id] || []){
    const response=await request(`https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=${zip}&radius=50&size=100`,'resolver');
    if(!response || (!response.ok && response.status!==206)){resolverComplete=false;continue;}
    let payload;try{payload=JSON.parse(response.text);}catch{resolverComplete=false;continue;}
    if(!Array.isArray(payload?.instore?.stores)){
      if(isGroceryExpansionEmptyResolver(payload,config.id)){resolverEmptyZips.push(zip);continue;}
      resolverComplete=false;resolverFailures.push({zip,reason:'invalid_instore_channel_shape'});continue;
    }
    for(const store of payload.instore.stores){
      const id=String(store?.locationId || '');if(!id || conflicts.has(id))continue;
      const key=normalize([store.polarisBannerName,store.domainName,store.address?.line1,store.address?.city,store.address?.state,store.address?.country,store.address?.zipcode].join('|'));
      if(resolver.has(id)&&resolver.get(id).key!==key){resolver.delete(id);conflicts.add(id);}else resolver.set(id,{key,store});
    }
  }
  const eligible=sources.filter(source=>groceryExpansionPremiseMatches(source,resolver.get(source.merchantId)?.store));
  const plan=eligible.length?await librarySourceSearchPlan(bible,{sourceKey:`${config.id}:grocery-xapi-expansion`,budget:Math.min(deep?48:8,eligible.length),broadTerms:[],cursorDir}):null;
  const extraTerms=new Map();
  if(plan?.terms.length)for(const{storeIndex,term}of arizonaXapiLibraryQueryAssignments(eligible.length,{terms:plan.terms,poolSize:plan.poolSize,invocation:plan.invocation,maximumStores:GROCERY_EXPANSION_STORE_LIMITS[config.id]})){
    extraTerms.set(storeIndex,[...(extraTerms.get(storeIndex)||[]),term]);
  }
  let complete=resolverComplete && eligible.length===sources.length;
  await forEachStoreBounded(eligible,async(source,index)=>{
    let sourceComplete=true;const seen=new Set();
    const terms=[...new Set(['bourbon','whiskey',...(deep?ILLINOIS_GROCERY_PRIORITY_TERMS:[]),...(extraTerms.get(index)||[])])];
    for(const term of terms){
      for(let page=0;page<(deep&&['bourbon','whiskey'].includes(term)?3:1);page++){
        const host=`https://${source.host}`;
        const params=new URLSearchParams({'request-id':String(Date.now()),url:host,pageurl:host,pagename:'search',rows:'100',start:String(page*100),'search-type':'keyword',storeid:source.merchantId,featured:'true','search-uid':'',q:term,channel:'instore',banner:source.banner});
        const response=await request(`${host}/abs/pub/xapi/search/substitute?${params}`,'inventory',source,term);
        if(!response?.ok){sourceComplete=false;break;}
        let payload;try{payload=JSON.parse(response.text);}catch{sourceComplete=false;break;}
        if(!Array.isArray(payload?.response?.docs)){
          if(isGroceryExpansionEmptySearch(payload,source,term,{start:page*100}))break;
          sourceComplete=false;break;
        }
        if(deep&&(payload.response.start!==page*100||payload.response.miscInfo?.query!==term)){
          sourceComplete=false;break;
        }
        for(const row of parseGroceryExpansionInventory(payload,source,bible,{observedAt}))if(!seen.has(row.id)){seen.add(row.id);signals.push(row);}
        if(!payload.response.miscInfo?.nextPageToken)break;
      }
      if(!sourceComplete)break;
    }
    if(!sourceComplete)complete=false;
    sourceAttempts[source.id]={lastAttemptAt:observedAt,status:sourceComplete?'success':'incomplete',inspected:true,positiveRows:seen.size};
  },deep?2:1);
  return {signals,roadblocks,metadata:{complete,sourceAttempts,requests,selectedStores:sources.map(source=>source.storeId),
    verifiedPremises:eligible.map(source=>source.storeId),resolverEmptyZips,resolverFailures,positiveStores:[...new Set(signals.map(row=>row.storeId))],
    maxRequestCount:requestLimit,storeConcurrency:deep?2:1,broadPageLimit:deep?3:1,priorityTerms:deep?ILLINOIS_GROCERY_PRIORITY_TERMS:[],exhaustiveRetrievalVerified:false,transientRetries,maxTransientRetries:retryLimit,librarySearchPlan:plan,observation:'live_local_preflight_not_production_activation'}};
}
