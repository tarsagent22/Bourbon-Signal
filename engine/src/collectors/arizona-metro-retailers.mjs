import { PHOENIX_METRO_RETAILERS, LIQUOR_WHEEL_PHOENIX, decode, priceOf, hostOf, metroBottleMatch, metroPremiseMatches, wooPremiseMap, wheelIdentityName } from './arizona-metro-retailer-proof.mjs';
export * from './arizona-metro-retailer-proof.mjs';
import { stableId, stripHtml } from '../core/text.mjs';
import { librarySourceSearchTerms, rotateLibraryProductCandidates } from '../library-search-runtime.mjs';

export function parseMetroWooProduct(product,retailer,bible,{observedAt,premiseMapQuery,productQueryUrl}={}) {
  const size=[...String(product?.name||'').matchAll(/\b(\d+(?:\.\d+)?)\s*(ml|l)\b/gi)].map(m=>Number(m[1])*(m[2].toLowerCase()==='l'?1000:1));
  const price=priceOf(product?.prices);
  if(!PHOENIX_METRO_RETAILERS.includes(retailer)||!metroPremiseMatches(premiseMapQuery,retailer.store)||!Number.isFinite(Date.parse(observedAt))
    ||hostOf(productQueryUrl)!==hostOf(retailer.baseUrl)||new URL(productQueryUrl).pathname!=='/wp-json/wc/store/v1/products'
    ||!Number.isSafeInteger(product?.id)||product.id<=0||!size.length||size.some(s=>s<375||s>1750)
    ||product.is_in_stock!==true||product.is_purchasable!==true||product.is_on_backorder!==false
    ||!Number.isFinite(price)||price<=0||hostOf(product.permalink)!==hostOf(retailer.baseUrl)
    ||!new URL(product.permalink).pathname.startsWith('/product/')||/\b(?:pack|case|bundle|miniature|sample)\b/i.test(product.name))return null;
  const rawName=decode(product.name);const record=metroBottleMatch(rawName,bible);if(!record)return null;
  return metroSignal(retailer,record,{productId:String(product.id),sourceUrl:product.permalink,rawName,price,observedAt,
    proof:{source:'arizona-woocommerce',premiseUrl:retailer.baseUrl+'/contact/',premiseMapQuery,productQueryUrl,product:{id:product.id,name:product.name,permalink:product.permalink,sku:product.sku,is_in_stock:product.is_in_stock,is_purchasable:product.is_purchasable,is_on_backorder:product.is_on_backorder,prices:product.prices}}});
}
function metroSignal(retailer,record,{productId,sourceUrl,rawName,price,observedAt,proof}) {
  return {id:stableId(['AZ',retailer.id,productId]),state:'AZ',sourceLabel:retailer.sourceLabel,sourceChain:retailer.id,merchantId:retailer.merchantId,
    sourceUrl,productId,rawName,canonicalBottleId:record.id,canonicalName:record.canonical,tier:record.tier,confidence:0.86,
    eventType:'retailer_store_inventory_result',locationPrecision:'store_level',locationName:retailer.store.name,storeName:retailer.store.name,
    storeId:retailer.store.id,storeAddress:retailer.store.address,city:retailer.store.city,stateCode:'AZ',postalCode:retailer.store.zip,zip:retailer.store.zip,
    quantity:0,quantityIsExact:false,price,observedAt,availabilityStatus:'in_stock',availabilityLabel:'Retailer reports available at this store',
    sourceAvailabilityVerified:true,canAlertAsInventory:true,canAlertAsWatch:true,
    inventorySemantics:'The retailer publishes positive availability and price at its verified store. Exact shelf quantity is not published; verify before driving.',
    evidence:`${retailer.store.name} reports ${rawName} available for $${price.toFixed(2)} at ${retailer.store.address}; exact quantity is not published.`,
    sourceProductBinding:{schemaVersion:1,source:proof.source,merchantId:retailer.merchantId,storeId:retailer.store.id,storeAddress:retailer.store.address,productId,rawName,canonicalBottleId:record.id,canonicalName:record.canonical,price,observedAt,...proof},
    raw:{chain:retailer.id,merchantId:retailer.merchantId,product:{id:productId,name:rawName,is_in_stock:true},quantitySemantics:'binary_retailer_availability'}};
}
const jsonLd=html=>[...String(html||'').matchAll(/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].flatMap(m=>{try{const v=JSON.parse(m[1]);return Array.isArray(v)?v:[v,...(v['@graph']||[])];}catch{return []}});
export function parseLiquorWheelProduct(html,sourceUrl,bible,{observedAt}={}) {
  const retailer=LIQUOR_WHEEL_PHOENIX;
  if(hostOf(sourceUrl)!=='liquorwheel2.com'||!/^\/phoenix-liquor-delivery\/[a-z0-9-]+\.html$/.test(new URL(sourceUrl).pathname))return null;
  const ld=jsonLd(html);const premise=ld.find(x=>x['@type']==='LiquorStore');const p=ld.find(x=>x['@type']==='Product');
  let product;try{product=JSON.parse(String(html).match(/\bconst product = (\{[^\r\n]+\});/)?.[1]||'null');}catch{return null}
  const offer=p?.offers;const address=premise?.address;const price=Number(offer?.price);
  if(!Number.isFinite(Date.parse(observedAt))||premise?.['@id']!==retailer.baseUrl+'/'||premise?.name!==retailer.store.name
    ||address?.streetAddress!==retailer.store.street||address?.addressLocality!=='Phoenix'||address?.addressRegion!=='AZ'||address?.postalCode!=='85006'
    ||!p||!product||product.name!==p.name||!/^AZ-[A-Z0-9-]+$/.test(product.id||'')||product.internal_sku!==product.id
    ||offer?.availability!=='https://schema.org/InStock'||offer?.priceCurrency!=='USD'||!Number.isFinite(price)||price<=0||Number(product.price)!==price
    ||offer?.seller?.name!==retailer.store.name||offer?.seller?.url!==sourceUrl
    ||!/<span\b[^>]*class=["'][^"']*pickup-only-label[^"']*["'][^>]*>\s*In-Store Pickup Available\s*<\/span>/i.test(html)
    ||/\b(?:bundle|case|pack|miniature|sample|cocktail|\d+\s*(?:oz|cl))\b/i.test(p.name))return null;
  // This live listing says George T. Stagg but illustrates Stagg. Keep the
  // contradiction excluded; a low price or a generic family match is no cure.
  if(product.id==='AZ-0520726389-GEORGE-T-STAGG-BARREL-PROOF-UNFILTERED')return null;
  const identityName=wheelIdentityName(p,product);
  const record=metroBottleMatch(identityName,bible);if(!record)return null;
  return metroSignal(retailer,record,{productId:product.id,sourceUrl,rawName:p.name,price,observedAt,
    proof:{source:'arizona-promenade',premise,product:p,publishedProduct:product,pickupAvailable:true,identityName}});
}
function boundedRequests(retailer,fetchText,options,maxRequests,maxElapsedMs) {
  const requests=[];let denied=false;const start=Date.now();
  return {requests,get denied(){return denied},async request(url){
    options.signal?.throwIfAborted();
    if(denied||requests.length>=maxRequests||Date.now()-start>=maxElapsedMs)return {ok:false,status:0,text:'',error:'Retailer request/time budget exhausted'};
    if(requests.length)await(options.sleep||((ms)=>new Promise(r=>setTimeout(r,ms))))(900);
    const r=await fetchText(url,{headers:{accept:'text/html,application/json'},timeoutMs:10000,signal:options.signal});
    requests.push({url,status:r.status||0,ok:r.ok});if([401,403,429,435].includes(r.status))denied=true;return r;
  }};
}
export async function collectMetroWooCommerce(config,bible,observedAt,retailer,{fetchText,...options}={}) {
  const signals=[],roadblocks=[];const run=boundedRequests(retailer,fetchText,options,10,90000);const premiseUrl=retailer.baseUrl+'/contact/';
  const contact=await run.request(premiseUrl);const premiseMapQuery=contact.ok?wooPremiseMap(contact.text,retailer):null;
  if(!premiseMapQuery)return {signals,roadblocks:[{state:'AZ',source:retailer.sourceLabel,url:premiseUrl,status:contact.ok?'unverified_premise':contact.status,error:'Current first-party contact map does not verify the reviewed premise.'}],metadata:{requests:run.requests}};
  const seenIds=new Set(),seenOffers=new Set();let category=null;let complete=false;let returnedRows=0;
  const absorb=(products,productQueryUrl)=>{for(const p of products){returnedRows++;if(seenIds.has(p.id))continue;seenIds.add(p.id);
    for(const c of p.categories||[])if(c.name==='Whiskey'&&c.slug==='whiskey-liquor'&&Number.isSafeInteger(c.id))category??=c.id;
    const s=parseMetroWooProduct(p,retailer,bible,{observedAt,premiseMapQuery,productQueryUrl});const key=s&&`${s.rawName.toLowerCase()}|${s.price}`;
    if(s&&!seenOffers.has(key)){seenOffers.add(key);signals.push(s);}
  }};
  const get=async url=>{const r=await run.request(url);if(!r.ok){roadblocks.push({state:'AZ',source:retailer.sourceLabel,url,status:r.status||0,error:r.error||`HTTP ${r.status}`});return null;}try{const p=JSON.parse(r.text);return Array.isArray(p)?p:null;}catch{return null;}};
  const seedUrl=retailer.baseUrl+'/wp-json/wc/store/v1/products?search=bourbon&per_page=100&page=1';
  const seed=await get(seedUrl);if(seed)absorb(seed,seedUrl);
  if(category)for(let page=1;page<=5&&!run.denied;page++){
    const url=retailer.baseUrl+`/wp-json/wc/store/v1/products?category=${category}&per_page=100&page=${page}`;
    const p=await get(url);if(!p)break;absorb(p,url);if(p.length<100){complete=true;break;}
  }
  if(!run.denied)for(const term of await librarySourceSearchTerms(bible,{sourceKey:`AZ:${retailer.id}`,budget:2,broadTerms:[],cursorDir:options.cursorDir})){
    const url=retailer.baseUrl+'/wp-json/wc/store/v1/products?search='+encodeURIComponent(term)+'&per_page=100&page=1';
    const p=await get(url);if(p)absorb(p,url);if(run.denied)break;
  }
  if(!signals.length)roadblocks.push({state:'AZ',source:retailer.sourceLabel,url:retailer.baseUrl,status:'reachable_no_safe_inventory_rows',error:'No identity-matched, positive, premise-bound inventory.'});
  return {signals,roadblocks,metadata:{requests:run.requests,categoryId:category,categoryComplete:complete,returnedRows,uniqueProducts:seenIds.size}};
}
export async function collectLiquorWheelPhoenix(config,bible,observedAt,{fetchText,...options}={}) {
  const retailer=LIQUOR_WHEEL_PHOENIX;const run=boundedRequests(retailer,fetchText,options,16,90000);const signals=[],roadblocks=[];
  const url=retailer.baseUrl+'/phoenix-liquor-delivery/liquor/?in_stock=1&liquor_type=whiskey';
  const r=await run.request(url);
  if(!r.ok)return {signals,roadblocks:[{state:'AZ',source:retailer.sourceLabel,url,status:r.status,error:r.error||`HTTP ${r.status}`}],metadata:{requests:run.requests}};
  const urls=[...new Set([...r.text.matchAll(/href=["']([^"']+\.html)["']/g)].map(m=>decode(m[1])))].filter(u=>hostOf(u)==='liquorwheel2.com'&&/^\/phoenix-liquor-delivery\/[a-z0-9-]+\.html$/.test(new URL(u).pathname));
  const conflict=urls.find(u=>new URL(u).pathname==='/phoenix-liquor-delivery/george-t-stagg-barrel-proof-unfiltered.html');
  if(conflict)roadblocks.push({state:'AZ',source:retailer.sourceLabel,url:conflict,status:'conflicting_bottle_identity',error:'Reviewed listing title says George T. Stagg while its photograph shows Stagg; excluded without another detail request.'});
  const candidates=urls.filter(u=>u!==conflict);
  const fixed=candidates.filter(u=>{const tail=new URL(u).pathname.split('/').at(-1).replace(/\.html$/,'').replace(/-/g,' ');return Boolean(metroBottleMatch(tail,bible))||/^blanton s bourbon$/.test(tail);}).slice(0,8);
  const rotating=await rotateLibraryProductCandidates(candidates.filter(u=>!fixed.includes(u)).map(u=>({sku:u})),{sourceKey:'AZ:liquor-wheel-2-phoenix:details',limit:15-fixed.length,cursorDir:options.cursorDir});
  const selected=[...fixed,...rotating.map(p=>p.sku)];
  for(const productUrl of selected){if(run.requests.length>=16||run.denied)break;
    const res=await run.request(productUrl);if(!res.ok){roadblocks.push({state:'AZ',source:retailer.sourceLabel,url:productUrl,status:res.status,error:res.error||`HTTP ${res.status}`});continue;}
    const s=parseLiquorWheelProduct(res.text,productUrl,bible,{observedAt});if(s)signals.push(s);
  }
  return {signals,roadblocks,metadata:{requests:run.requests,discoveredProductUrls:urls.length,selectedProductUrls:selected,rotatingDetailCount:rotating.length,exhaustiveRetrievalVerified:false}};
}
