import { arizonaXapiLibraryQueryAssignments } from './arizona-xapi.mjs';
import { stableId } from '../core/text.mjs';
import {createHash} from 'node:crypto';
import { librarySourceSearchPlan } from '../library-search-runtime.mjs';
import { parseBoundGroceryXapiInventory } from './grocery-xapi-identity.mjs';
import { LOUISIANA_ALASKA_GROCERY_SOURCES, LOUISIANA_ALASKA_RESOLVER_ZIPS } from './louisiana-alaska-grocery-premises.mjs';
import {isLouisianaAlaskaGroceryInventory} from '../louisiana-alaska-grocery-policy.mjs';

const normalize = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const DROP_TIERS = new Set(['limited','allocated','highly_allocated','unicorn']);
export const LOUISIANA_ALASKA_GROCERY_REQUEST_LIMIT = 53;
export const LOUISIANA_ALASKA_GROCERY_REQUEST_LIMITS = Object.freeze({LA:43,AK:53});
const LOUISIANA_ALASKA_GROCERY_STORE_LIMITS = Object.freeze({LA:15,AK:19});
const publicStoreKey = '7bad9afbb87043b28519c4443106db06';
const publicSearchKey = 'e914eec9448c4d5eb672debf5011cf8f';

export function louisianaAlaskaGroceryPremiseMatches(source, store) {
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

export function isLouisianaAlaskaGroceryEmptySearch(payload,source,term){
  if(!LOUISIANA_ALASKA_GROCERY_SOURCES.includes(source)||payload?.appCode!=='GR204'
    ||payload.response?.numFound!==0||payload.response?.start!==0
    ||Object.hasOwn(payload.response,'docs')||payload.response.miscInfo?.query!==term)return false;
  const filter=payload.response.miscInfo.filter;
  return typeof filter==='string'
    &&filter.includes(`(inventory(${source.merchantId}, price) >0)`)
    &&filter.includes(`(inventory(${source.merchantId},attributes.custom_type_2) = 1)`);
}

export function classifyLouisianaAlaskaQuery(payload,source,term,{httpStatus}={}){
  if(!LOUISIANA_ALASKA_GROCERY_SOURCES.includes(source)||typeof term!=='string'||!term
    ||![200,206].includes(httpStatus)||payload?.appCode==='GR200 :: A-CT: 408')return 'INVALID';
  if(isLouisianaAlaskaGroceryEmptySearch(payload,source,term))return 'CONFIRMED_EMPTY';
  if(source.stateCode==='LA'&&source.host==='www.albertsons.com'&&httpStatus===200
    &&payload?.appCode==='GR204'&&payload.appMsg==='GR : Google Retail returned empty response..'
    &&JSON.stringify(Object.keys(payload).sort())===JSON.stringify(['appCode','appMsg']))return 'UNCONFIRMED_EMPTY_QUERY';
  if(payload?.appCode!==undefined&&!['GR200','GR200 :: A-CT: 200'].includes(payload.appCode))return 'INVALID';
  const docs=payload?.response?.docs;
  return Array.isArray(docs)&&docs.length>0&&docs.length<=100&&docs.every(product=>product
    &&typeof product.name==='string'&&product.name&&String(product.id)===String(product.pid)&&/^\d+$/.test(String(product.id))
    &&String(product.storeId)===source.merchantId&&typeof product.containsAlcohol==='boolean'
    &&product.channelEligibility&&product.channelInventory)?'BOUND_PRODUCTS':'INVALID';
}

// This is a metadata consistency check, never raw or negative authority. The
// source collector derives it; the shadow/preparer independently replays raw.
export function hasLouisianaAlaskaPositiveEvidenceOnly(metadata,rows,state){
 try{const sources=LOUISIANA_ALASKA_GROCERY_SOURCES.filter(s=>s.stateCode===state),ids=sources.map(s=>s.storeId),queries=metadata?.unconfirmedNegativeQueries,evidence=metadata?.queryEvidence;
  return state==='LA'&&metadata?.complete===false&&metadata.profileScope==='POSITIVE_EVIDENCE_ONLY'
    &&metadata.requestProfileComplete===true&&metadata.negativeComplete===false
    &&Number.isSafeInteger(metadata.unconfirmedNegativeQueryCount)&&metadata.unconfirmedNegativeQueryCount>0
    &&Array.isArray(queries)&&queries.length===metadata.unconfirmedNegativeQueryCount
    &&metadata.requests?.length===43&&metadata.requests.every(r=>r.ok===true&&[200,206].includes(r.status))
    &&JSON.stringify(metadata.selectedStores)===JSON.stringify(ids)&&metadata.verifiedPremises?.length===ids.length&&ids.every(id=>metadata.verifiedPremises.includes(id))
    &&Array.isArray(evidence)&&evidence.length===38&&evidence.every(q=>{const s=sources.find(s=>s.id===q.sourceId&&s.storeId===q.storeId&&s.merchantId===q.merchantId),u=new URL(q.url);return s
      &&['BOUND_PRODUCTS','CONFIRMED_EMPTY','UNCONFIRMED_EMPTY_QUERY'].includes(q.disposition)&&u.origin===`https://${s.host}`&&u.pathname==='/abs/pub/xapi/search/substitute'
      &&u.searchParams.get('storeid')===s.merchantId&&u.searchParams.get('banner')===s.banner&&u.searchParams.get('channel')==='instore'&&u.searchParams.get('q')===q.term
      &&metadata.requests.some(r=>r.kind==='inventory'&&r.url===q.url&&r.status===q.httpStatus);})
    &&JSON.stringify(queries)===JSON.stringify(evidence.filter(q=>q.disposition==='UNCONFIRMED_EMPTY_QUERY'))
    &&Object.keys(metadata.sourceAttempts||{}).length===sources.length&&sources.every(s=>metadata.sourceAttempts[s.id]?.status===(queries.some(q=>q.sourceId===s.id)?'positive_evidence_only':'success')&&metadata.sourceAttempts[s.id]?.inspected===true)
    &&sources.every(s=>['bourbon','whiskey'].every(term=>evidence.some(q=>q.sourceId===s.id&&q.term===term)))
    &&queries.every(q=>q.disposition==='UNCONFIRMED_EMPTY_QUERY'&&ids.includes(q.storeId)&&typeof q.term==='string'&&q.term
      &&q.httpStatus===200&&/^[a-f0-9]{64}$/.test(q.bodySha256))
    &&Array.isArray(rows)&&rows.length>0&&rows.every(row=>row.state===state&&ids.includes(row.storeId)&&isLouisianaAlaskaGroceryInventory(row));
 }catch{return false;}
}

export function parseLouisianaAlaskaGroceryInventory(payload, source, bible, {observedAt}={}) {
  if(!LOUISIANA_ALASKA_GROCERY_SOURCES.includes(source) || !Number.isFinite(Date.parse(observedAt)))return [];
  return parseBoundGroceryXapiInventory(payload,source,bible).filter(row=>!(row.record.canonical==='Wild Turkey Master'&&!/\bmaster\b/i.test(row.title)) && currentDropTarget(row.record,source.stateCode) && Number.isFinite(row.price) && row.price>0).map(row=>({
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

export async function collectLouisianaAlaskaGrocery(config,bible,{fetchText,observedAt=new Date().toISOString(),signal,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),attempts={},nowMs=Date.now(),cursorDir,persistAttempts=async()=>{}}={}) {
  if(typeof fetchText!=='function')throw new Error('Bounded first-party fetchText is required');
  const sources=LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source=>source.stateCode===config.id);
  const requestLimit=LOUISIANA_ALASKA_GROCERY_REQUEST_LIMITS[config.id];
  if(!sources.length || !requestLimit || sources.length>LOUISIANA_ALASKA_GROCERY_STORE_LIMITS[config.id])throw new Error('Grocery expansion exceeds reviewed state/store budget');
  const requests=[],signals=[],roadblocks=[],sourceAttempts={...attempts},blockedHosts=new Set(),queryEvidence=[];
  for(const[key,value]of Object.entries(attempts))if(key.startsWith('host:')&&Date.parse(value.nextAllowedAt)>nowMs)blockedHosts.add(key.slice(5));
  const request=async(url,kind,source=null,term=null)=>{
    signal?.throwIfAborted();const host=new URL(url).hostname;
    if(blockedHosts.has(host))return null;
    if(requests.length>=requestLimit)throw new Error('Grocery expansion request ceiling reached');
    if(requests.length)await sleep(400);
    const response=await fetchText(url,{signal,timeoutMs:15000,maxBytes:4*1024*1024,maxRedirects:0,
      headers:{accept:'application/json','ocp-apim-subscription-key':kind==='resolver'?publicStoreKey:publicSearchKey}});
    requests.push({kind,sourceId:source?.id || null,merchantId:source?.merchantId || null,term,url,status:response.status||0,ok:response.ok===true,observedAt:new Date().toISOString()});
    if([401,403,429,435].includes(Number(response.status))){
      blockedHosts.add(host);sourceAttempts[`host:${host}`]={lastAttemptAt:observedAt,status:'access_denied',httpStatus:response.status,nextAllowedAt:new Date(nowMs+86_400_000).toISOString()};
      // Persist denial immediately; a later timeout/publication failure must not erase it.
      await persistAttempts(structuredClone(sourceAttempts));
    }
    if(!response.ok && response.status!==206)roadblocks.push({state:config.id,source:source?.sourceLabel || 'Grocery store resolver',url,status:response.status||0,error:response.error || `HTTP ${response.status}`});
    return response;
  };
  const resolver=new Map(),conflicts=new Set();let resolverComplete=true;
  for(const zip of LOUISIANA_ALASKA_RESOLVER_ZIPS[config.id] || []){
    const response=await request(`https://www.safeway.com/abs/pub/xapi/storeresolver/v2/all?zipcode=${zip}&radius=50&size=100`,'resolver');
    if(!response || (!response.ok && response.status!==206)){resolverComplete=false;continue;}
    let payload;try{payload=JSON.parse(response.text);}catch{resolverComplete=false;continue;}
    if(!Array.isArray(payload?.instore?.stores)){resolverComplete=false;continue;}
    for(const store of payload.instore.stores){
      const id=String(store?.locationId || '');if(!id || conflicts.has(id))continue;
      const key=normalize([store.polarisBannerName,store.domainName,store.address?.line1,store.address?.city,store.address?.state,store.address?.country,store.address?.zipcode].join('|'));
      if(resolver.has(id)&&resolver.get(id).key!==key){resolver.delete(id);conflicts.add(id);}else resolver.set(id,{key,store});
    }
  }
  const eligible=sources.filter(source=>louisianaAlaskaGroceryPremiseMatches(source,resolver.get(source.merchantId)?.store));
  const plan=eligible.length?await librarySourceSearchPlan(bible,{sourceKey:`${config.id}:grocery-xapi-expansion`,budget:Math.min(8,eligible.length),broadTerms:[],cursorDir}):null;
  const extraTerms=new Map();
  if(plan?.terms.length)for(const{storeIndex,term}of arizonaXapiLibraryQueryAssignments(eligible.length,{terms:plan.terms,poolSize:plan.poolSize,invocation:plan.invocation})){
    extraTerms.set(storeIndex,[...(extraTerms.get(storeIndex)||[]),term]);
  }
  let complete=resolverComplete && eligible.length===sources.length;
  for(const[index,source]of eligible.entries()){
    let sourceComplete=true;const seen=new Set(),unconfirmed=[];
    for(const term of ['bourbon','whiskey',...(extraTerms.get(index)||[])]){
      const host=`https://${source.host}`;
      const params=new URLSearchParams({'request-id':String(Date.now()),url:host,pageurl:host,pagename:'search',rows:'100',start:'0','search-type':'keyword',storeid:source.merchantId,featured:'true','search-uid':'',q:term,channel:'instore',banner:source.banner});
      const response=await request(`${host}/abs/pub/xapi/search/substitute?${params}`,'inventory',source,term);
      if(!response?.ok){sourceComplete=false;break;}
      let payload;try{payload=JSON.parse(response.text);}catch{sourceComplete=false;break;}
      const disposition=classifyLouisianaAlaskaQuery(payload,source,term,{httpStatus:response.status});
      const evidence={sourceId:source.id,storeId:source.storeId,merchantId:source.merchantId,term,url:requests.at(-1).url,
        httpStatus:response.status,disposition,bodySha256:createHash('sha256').update(response.text).digest('hex')};
      queryEvidence.push(evidence);
      if(disposition==='UNCONFIRMED_EMPTY_QUERY'){unconfirmed.push(evidence);continue;}
      if(disposition==='CONFIRMED_EMPTY')continue;
      if(disposition!=='BOUND_PRODUCTS'){sourceComplete=false;break;}
      for(const row of parseLouisianaAlaskaGroceryInventory(payload,source,bible,{observedAt}))if(!seen.has(row.id)){seen.add(row.id);signals.push(row);}
    }
    if(!sourceComplete)complete=false;
    sourceAttempts[source.id]={lastAttemptAt:observedAt,status:sourceComplete?(unconfirmed.length?'positive_evidence_only':'success'):'incomplete',inspected:true,positiveRows:seen.size};
  }
  const requestProfileComplete=complete,unconfirmedNegativeQueries=queryEvidence.filter(q=>q.disposition==='UNCONFIRMED_EMPTY_QUERY');
  const negativeComplete=requestProfileComplete&&unconfirmedNegativeQueries.length===0;
  const profileScope=negativeComplete?'COMPLETE_REVIEWED_PROFILE':requestProfileComplete&&signals.length>0?'POSITIVE_EVIDENCE_ONLY':'INCOMPLETE';
  return {signals,roadblocks,metadata:{complete:negativeComplete,requestProfileComplete,negativeComplete,profileScope,
    unconfirmedNegativeQueryCount:unconfirmedNegativeQueries.length,unconfirmedNegativeQueries,
    confirmedEmptyQueryCount:queryEvidence.filter(q=>q.disposition==='CONFIRMED_EMPTY').length,queryEvidence,
    sourceAttempts,requests,selectedStores:sources.map(source=>source.storeId),
    verifiedPremises:eligible.map(source=>source.storeId),positiveStores:[...new Set(signals.map(row=>row.storeId))],
    maxRequestCount:requestLimit,librarySearchPlan:plan,observation:'live_local_preflight_not_production_activation'}};
}
