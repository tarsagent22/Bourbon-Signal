import {createHash} from 'node:crypto';
const BASE_URL='https://www.michiganliquors.com';
export const MICHIGAN_LIQUORS_DC_SOURCE=Object.freeze({
 id:'michigan-liquors-dc',state:'DC',stateCode:'DC',name:'Michigan Liquors',city:'Washington',
 address:'3934 12th St NE, Washington, DC 20017',storeId:'michigan-liquors:3934-12th-st-ne',
 lat:38.925525,lng:-76.990439,baseUrl:BASE_URL,hostname:'www.michiganliquors.com',
 inventoryUrl:`${BASE_URL}/allocated`,sourceLabel:'Michigan Liquors first-party allocated shelf',
 freshnessMinutes:24*60,availabilitySemantics:'first-party nightly register stock; call to reserve; no online sale'
});
export const MICHIGAN_LIQUORS_DC_BUDGET=Object.freeze({maxProductRequestsPerDay:8,maxCategoryBytes:2*1024*1024,maxProductBytes:512*1024,timeoutMs:12000,cadenceMs:24*60*60_000});

function decode(value){return String(value||'').replace(/&quot;|&#34;/g,'"').replace(/&#x27;|&#39;|&apos;/g,"'").replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>');}
function text(value){return decode(value).replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim();}
function jsonLd(html){
 const out=[];
 for(const m of String(html||'').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)){
  try{const value=JSON.parse(decode(m[1]));out.push(...(Array.isArray(value)?value:[value]));}catch{}
 }
 return out;
}
function flatten(values){return values.flatMap(v=>v&&typeof v==='object'?(Array.isArray(v)?flatten(v):[v,...flatten(Object.values(v))]):[]);}

// A positive result requires the retailer's own product detail schema, store identity,
// an explicit visible stock count, and an in-stock Offer. The listing's allocated
// category alone is never interpreted as availability.
export function parseMichiganLiquorsProduct(html,{url,observedAt=new Date().toISOString(),source=MICHIGAN_LIQUORS_DC_SOURCE}={}){
 if(!Number.isFinite(Date.parse(observedAt)))return null;
 let u;try{u=new URL(url);}catch{return null;}
 if(u.origin!==source.baseUrl||!/^\/spirits\/[A-Za-z0-9-]+$/u.test(u.pathname)||u.search||u.hash)return null;
 const docs=flatten(jsonLd(html)),product=docs.find(x=>x['@type']==='Product'&&x.name&&x.offers&&x.sku);
 if(!product)return null;
 const offer=Array.isArray(product.offers)?product.offers[0]:product.offers;
 const retailer=docs.find(x=>x['@type']==='LiquorStore'||x['@type']==='Store');
 const canonicalUrl=new URL(String(product.url||''),source.baseUrl).href;
 const address=retailer?.address||{};
 if(!retailer||retailer.name!=='Michigan Liquors'||address.streetAddress!=='3934 12th St NE'
   ||address.addressLocality!=='Washington'||address.addressRegion!=='DC'||address.postalCode!=='20017'
   ||Number(retailer.geo?.latitude)!==source.lat||Number(retailer.geo?.longitude)!==source.lng
   ||canonicalUrl!==u.href||offer?.availability!=='https://schema.org/InStock')return null;
 const visible=String(html).match(/Only\s*<!--\s*-->\s*(\d+)\s*<!--\s*-->\s*left in stock/iu)
   ||String(html).match(/Only\s+(\d+)\s+left in stock/iu);
 if(!visible)return null;
 const quantity=Number(visible[1]),price=Number(offer.price);
 if(!Number.isInteger(quantity)||quantity<1||!Number.isFinite(price)||price<=0||offer.priceCurrency!=='USD')return null;
 const name=text(product.name),size=text(product.size||'');
 const sizeMatch=size.match(/^(\d+(?:\.\d+)?)\s*(m?l)$/iu);
 const sizeMl=sizeMatch?Number(sizeMatch[1])*(sizeMatch[2].toLowerCase()==='l'?1000:1):NaN;
 if(!name||!Number.isFinite(sizeMl)||sizeMl<375||sizeMl>1750
   ||/\b(?:gift\s*(?:set|box|pack)|bundle|case|sampler|collection|set\s*\()/iu.test(name)
   ||!/Allocated Liquor/iu.test(text(html)))return null;
 return {sourceId:source.id,state:'DC',stateCode:'DC',storeId:source.storeId,storeName:source.name,storeAddress:source.address,
  lat:source.lat,lng:source.lng,canonicalUrl,sku:String(product.sku),name,size,price,quantity,quantityIsExact:true,
  availabilityStatus:'in_stock',availabilityLabel:`${quantity} left in stock`,observedAt,freshnessMinutes:source.freshnessMinutes,
  sourceUrl:u.href,sourceLabel:source.sourceLabel,sourceAvailabilityVerified:true,
  availabilitySemantics:source.availabilitySemantics};
}

// The allocated page is a candidate index only: its cards have title and price,
// but do not establish size or per-item stock status.
export function parseMichiganLiquorsAllocatedIndex(html,{source=MICHIGAN_LIQUORS_DC_SOURCE}={}){
 const body=String(html||'');
 if(Buffer.byteLength(body,'utf8')>MICHIGAN_LIQUORS_DC_BUDGET.maxCategoryBytes)return [];
 const rows=[],seen=new Set();
 for(const card of body.matchAll(/<a\b(?=[^>]*\bhref="(\/spirits\/[A-Za-z0-9-]+-(?:m|w)[0-9a-z]+)")[^>]*>([\s\S]*?)<\/a>/giu)){
  const contents=card[2],name=text((contents.match(/<h3\b[^>]*>([\s\S]*?)<\/h3>/iu)||[])[1]);
  const category=text((contents.match(/<p\b[^>]*>([\s\S]*?)<\/p>/iu)||[])[1]);
  const priceMatch=contents.match(/\$\s*(?:<!--\s*-->\s*)?([0-9]+(?:\.[0-9]{2})?)/u);
  if(!name||category!=='Allocated Liquor'||!priceMatch)continue;
  const url=new URL(card[1],source.baseUrl).href;
  if(seen.has(url))continue;seen.add(url);
  rows.push({candidateId:card[1].split('/').at(-1),name,price:Number(priceMatch[1]),url,sourceCategory:'Allocated Liquor'});
 }
 return rows;
}

async function publicGet(url,{timeoutMs,maxBytes,fetchImpl=fetch}={}){
 const controller=new AbortController(),timer=setTimeout(()=>controller.abort(new Error('request_timeout')),timeoutMs);
 try{
  const response=await fetchImpl(url,{redirect:'manual',signal:controller.signal,headers:{accept:'text/html,application/xhtml+xml','user-agent':'BourbonSignalResearch/1.0 (+public retail index check)'}});
  if(response.status>=300&&response.status<400)return{ok:false,status:response.status,url:response.url||url,reason:'redirect_not_followed'};
  if(!response.ok)return{ok:false,status:response.status,url:response.url||url,reason:'http_'+response.status};
  const reader=response.body?.getReader();
  if(!reader)return{ok:false,status:response.status,url:response.url||url,reason:'empty_response_body'};
  const chunks=[];let bytes=0;
  while(true){
   const part=await reader.read();if(part.done)break;
   bytes+=part.value.byteLength;
   if(bytes>maxBytes){await reader.cancel();return{ok:false,status:response.status,url:response.url||url,reason:'body_too_large'};}
   chunks.push(part.value);
  }
  const raw=new Uint8Array(bytes);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.byteLength;}
  return{ok:true,status:response.status,url:response.url||url,text:new TextDecoder().decode(raw)};
 }catch(error){return{ok:false,status:0,url,reason:error?.name==='AbortError'?'request_timeout':'network_error'};}
 finally{clearTimeout(timer);}
}

// Isolated read-only collector. It refreshes the index daily and probes at most
// eight allocated bourbon product details per source day. No alert fields are enabled.
export async function collectMichiganLiquorsDC({fetchText,fetchImpl,bible,observedAt=new Date().toISOString(),nowMs=Date.now(),attempts={}}={}){
 const source=MICHIGAN_LIQUORS_DC_SOURCE,budget=MICHIGAN_LIQUORS_DC_BUDGET;
 if(!Number.isFinite(Date.parse(observedAt)))throw new Error('A valid observation clock is required');
 const last=Date.parse(attempts.lastAttemptAt||'');
 if(Number.isFinite(last)&&nowMs-last<budget.cadenceMs){
  const signals=(Array.isArray(attempts.signals)?attempts.signals:[]).filter(row=>{
   const age=nowMs-Date.parse(row.observedAt);return Number.isFinite(age)&&age>=0&&age<=source.freshnessMinutes*60_000;
  });
  return{state:'DC',status:'not_due',signals,metadata:{dueAt:new Date(last+budget.cadenceMs).toISOString(),
   candidateCount:attempts.candidateCount||0,verifiedDistinctExpressionsLowerBound:new Set(signals.map(row=>row.name+'\u0000'+row.size)).size,
   lastObservationAt:attempts.lastSuccessfulIndexAt||null,requests:[]},attempts};
 }
 const get=fetchText||((url,options)=>publicGet(url,{...options,fetchImpl}));
 const requests=[],category=await get(source.inventoryUrl,{timeoutMs:budget.timeoutMs,maxBytes:budget.maxCategoryBytes});
 requests.push({kind:'allocated_candidate_index',url:source.inventoryUrl,status:category.status||0,ok:category.ok===true,
  ...(category.ok?{bytes:Buffer.byteLength(category.text||'','utf8'),sha256:createHash('sha256').update(category.text||'').digest('hex')}:{})});
 const nextAttempts={...attempts,lastAttemptAt:observedAt};
 if(!category.ok)return{state:'DC',status:'source_blocked',signals:[],metadata:{candidateCount:0,verifiedDistinctExpressionsLowerBound:0,requests,noAlerts:true},attempts:nextAttempts};
 const candidates=parseMichiganLiquorsAllocatedIndex(category.text,{source});
 const reportedStockCount=Number((text(category.text).match(/(\d+)\s+in stock right now/iu)||[])[1])||null;
 const exactCandidates=candidates.filter(row=>/\bbourbon\b/iu.test(row.name)
  && !/\b(?:gift\s*(?:set|box|pack)|bundle|case|sampler|collection|set)\b/iu.test(row.name));
 const cursor=Number.isSafeInteger(attempts.cursor)&&attempts.cursor>=0?attempts.cursor:0;
 const selected=exactCandidates.length?Array.from({length:Math.min(budget.maxProductRequestsPerDay,exactCandidates.length)},(_,i)=>exactCandidates[(cursor+i)%exactCandidates.length]):[];
 const signals=[];
 for(const candidate of selected){
  const response=await get(candidate.url,{timeoutMs:budget.timeoutMs,maxBytes:budget.maxProductBytes});
  requests.push({kind:'product_detail',candidateId:candidate.candidateId,url:candidate.url,status:response.status||0,ok:response.ok===true,
   ...(response.ok?{bytes:Buffer.byteLength(response.text||'','utf8'),sha256:createHash('sha256').update(response.text||'').digest('hex')}:{})});
  if(!response.ok){if([401,403,429,435].includes(Number(response.status)))break;continue;}
  const row=parseMichiganLiquorsProduct(response.text,{url:candidate.url,observedAt,source});
  if(!row)continue;
  const match=typeof bible?.match==='function'?bible.match(row.name):null;
  const reviewed=match?.record&&match.confidence===1&&['allocated','unicorn'].includes(String(match.record.tier).toLowerCase());
  row.rawName=row.name;
  row.canonicalBottleId=reviewed?match.record.id:null;row.canonicalName=reviewed?match.record.canonical:null;row.tier=reviewed?match.record.tier:null;
  row.inventorySemantics='Research-only first-party nightly register count; call the store to reserve; no customer alert or availability guarantee.';
  row.alertable=false;row.canAlertAsInventory=false;row.canAlertAsWatch=false;row.eligibleForDelivery=false;row.researchOnly=true;
  signals.push(row);
 }
 nextAttempts.cursor=exactCandidates.length?(cursor+selected.length)%exactCandidates.length:0;
 nextAttempts.candidateCount=candidates.length;
 nextAttempts.exactAllocatedBottleCandidates=exactCandidates.length;
 nextAttempts.lastSuccessfulIndexAt=observedAt;
 nextAttempts.signals=signals;
 const distinct=new Set(signals.map(row=>row.name+'\u0000'+row.size));
 return{state:'DC',status:'research_only',signals,source,metadata:{candidateCount:candidates.length,exactAllocatedBottleCandidates:exactCandidates.length,
  allocatedBourbonCandidates:exactCandidates.length,candidateTitleCount:new Set(candidates.map(row=>row.name)).size,
  reportedInStockItemCount:reportedStockCount,productRequests:requests.filter(r=>r.kind==='product_detail').length,verifiedDistinctExpressionsLowerBound:distinct.size,
  requests,candidateIndex:candidates,noAlerts:true,researchOnly:true,sourceClock:'once_per_24h',nextDueAt:new Date(nowMs+budget.cadenceMs).toISOString()},attempts:nextAttempts};
}
