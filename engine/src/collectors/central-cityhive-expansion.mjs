import { parseCityHiveProducts } from './cityhive-surfaces.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';
import { stableId } from '../core/text.mjs';
import { librarySourceSearchTerms } from '../library-search-runtime.mjs';
import texasExpansion from '../../data/texas-cityhive-expansion-sources.json' with {type:'json'};
import minnesotaExpansion from '../../data/minnesota-cityhive-expansion-sources.json' with {type:'json'};

function source(id, name, state, baseUrl, merchantId, address, city, zip) {
  return Object.freeze({id, name, state, stateCode:state, platform:'cityhive', baseUrl,
    hostname:new URL(baseUrl).hostname, merchantId, address, city, zip,
    storeId:`${id}:${merchantId}`, sourceLabel:`${name} first-party pickup inventory`,
    categoryUrl:`${baseUrl}/shop/?subtype=Bourbon&merchant-id=${merchantId}`});
}

// Exact first-party merchant configurations captured on 2026-10-29 UTC.
// These sources remain research until the separate state promotion contract passes.
export const CENTRAL_CITYHIVE_EXPANSION_SOURCES = Object.freeze([
  source('liquorguys-wauwatosa','Liquorguys','WI','https://liquorguys.com','634464e2ec82c44b45abf3ef',
    '11728 W North Ave, Wauwatosa, WI 53226, USA','Wauwatosa','53226'),
  source('yucatan-liquor-okc','Yucatan Liquor','OK','https://yucatanliquor.com','67fe7b7c8a5eea0bf6837355',
    '9109 S May Ave, Oklahoma City, OK 73159, USA','Oklahoma City','73159'),
  source('byrons-liquor-okc',"Byron's Liquor Warehouse",'OK','https://byronsliquor.com','6060f5bded7ffb6a9c4c64b8',
    '2322 N Broadway Ave, Oklahoma City, OK 73103, USA','Oklahoma City','73103'),
]);
export const TEXAS_CITYHIVE_EXPANSION_SOURCES=Object.freeze(texasExpansion.stores.map(Object.freeze));
export const MINNESOTA_CITYHIVE_EXPANSION_SOURCES=Object.freeze(minnesotaExpansion.stores.map(Object.freeze));
const ALL_SOURCES=Object.freeze([...CENTRAL_CITYHIVE_EXPANSION_SOURCES,...TEXAS_CITYHIVE_EXPANSION_SOURCES,...MINNESOTA_CITYHIVE_EXPANSION_SOURCES]);

export function centralCityHiveBottleFormat(option, product) {
  const data=option.option_display_data || option.optionDisplayData || {};
  const size=data.size || option.option_params?.size || product.size;
  const value=Number(size?.quantity), unit=String(size?.measure || '').toLowerCase();
  const ml=unit==='l' ? value*1000 : unit==='ml' ? value : NaN;
  const pack=option.pack_size ?? product.pack_size;
  return Number.isFinite(ml) && ml>=375 && ml<=1750
    && (pack==null || Number(pack)===1)
    && !/\b(?:gift\s*(?:set|pack)|bundle|case|sampler|miniature|cocktail|cream|liqueur|flavored|flavoured|vodka|gin|rum|tequila|wine|beer)\b/i.test(data.name || product.name || '');
}

// Source-specific spellings require the reviewed product ID and current option
// attributes. They never become fuzzy aliases for another retailer or expression.
export function reviewedCentralCityHiveIdentity(option, product) {
  const data=option.option_display_data || {}, props=data.properties || {};
  const id=String(option.product_id || product.id || '');
  if(data.name!==product.name || Number(data.size?.quantity)!==750 || data.size?.measure!=='ml')return null;
  if(id==='6594472cd20b667b856eb419' && product.name==='R Michters Single Barrel Rye 10yr 750ml'
    && String(props.age)==='10' && props.brands?.length===1 && props.brands[0]==="Michter's"
    && data.basic_category?.includes('rye') && !data.basic_category?.includes('bourbon'))return "Michter's 10 Year Rye";
  if(id==='5e21e94d0320ad0f80403af4' && product.name==='Larceny Barrel Proof Brourbon'
    && props.brands?.length===1 && props.brands[0]==='Larceny'
    && data.basic_category?.includes('bourbon') && !data.basic_category?.includes('rye')
    && Number.parseFloat(props.content)>=55 && Number.parseFloat(props.content)<=75)return 'Larceny Barrel Proof';
  return null;
}

export function parseCentralCityHiveInventory(html, candidate, bible, {observedAt}={}) {
  const source=ALL_SOURCES.find(s=>s===candidate);
  if(!source || !Number.isFinite(Date.parse(observedAt)))return [];
  return parseCityHiveProducts(html,source,{sources:ALL_SOURCES,
    isAllowedOption:centralCityHiveBottleFormat,
    reviewOption:reviewedCentralCityHiveIdentity,
  }).flatMap(row=>{
    const identity=row.reviewedIdentity;
    const {record,match}=identity ? (()=>{const m=bible.match(identity);return {match:m,record:m?.record?.canonical===identity?m.record:null};})() : cityHiveSafeBottleMatch(row.title,bible);
    const batch=row.title.match(/\bbatch\s*(\d{1,4})\b|\b(\d{1,4})\s*batch\b/i);
    if(batch && !new RegExp(`\\b${batch[1]||batch[2]}\\b`).test(record?.canonical||''))return [];
    if(!record || !['allocated','limited','unicorn'].includes(record.tier) || !Number.isFinite(row.price) || row.price<=0)return [];
    return [{id:stableId([source.state,source.id,row.productId,row.variantId]),state:source.state,stateCode:source.state,
      sourceLabel:source.sourceLabel,sourceUrl:row.productUrl,sourceChain:source.chainId||source.id,merchantId:source.merchantId,
      productId:row.productId,optionId:row.variantId,variantId:row.variantId,rawName:row.title,canonicalBottleId:record.id,canonicalName:record.canonical,
      tier:record.tier,confidence:Math.max(.85,match?.confidence || 0),eventType:'retailer_store_inventory_result',
      locationPrecision:'store_level',locationName:source.name,storeName:source.name,storeId:source.storeId,
      storeAddress:source.address,city:source.city,postalCode:source.zip,zip:source.zip,
      quantity:0,storeQty:0,quantityIsExact:false,quantitySemantics:'binary_retailer_orderable_no_exact_count',
      price:row.price,observedAt,fetchedAt:observedAt,availabilityStatus:'in_stock',
      availabilityLabel:'Retailer reports pickup available',sourceAvailabilityVerified:true,
      canAlertAsInventory:true,canAlertAsWatch:true,dataLane:'inventory',
      inventorySemantics:'The current first-party merchant configuration, exact address, product variant and positive pickup offer agree. Exact shelf quantity is not published; verify before driving.',
      evidence:`${source.name} reports ${row.title} available for pickup at ${source.address} for $${row.price.toFixed(2)}.`,
      sourceProductBinding:{schemaVersion:1,source:'central-cityhive',merchantId:source.merchantId,storeId:source.storeId,
        storeAddress:source.address,productId:row.productId,optionId:row.variantId,rawName:row.title,
        canonicalBottleId:record.id,price:row.price,observedAt,premisesVerified:true,pickupOfferVerified:true},
      raw:{chain:source.chainId||source.id,merchantId:source.merchantId,productId:row.productId,optionId:row.variantId,
        reportedQuantity:row.reportedQuantity,quantitySemantics:'binary_retailer_orderable_no_exact_count'}}];
  });
}

export async function collectCentralCityHiveExpansion(config,bible,{fetchText,observedAt=new Date().toISOString(),signal,
  sleep=ms=>new Promise(r=>setTimeout(r,ms)),cursorDir,attempts={},nowMs=Date.now()}={}) {
  if(typeof fetchText!=='function')throw new Error('A bounded first-party fetchText function is required');
  const signals=[],roadblocks=[],requests=[],sourceAttempts={...attempts};
  const perStore=['TX','MN'].includes(config.id);
  const groups=Map.groupBy(ALL_SOURCES.filter(s=>s.state===config.id),s=>perStore?s.id:s.chainId||s.id);
  for(const [groupId,sources] of groups){
    const source=sources[0];
    if(Date.parse(attempts[groupId]?.nextAllowedAt || '')>nowMs || Date.parse(sourceAttempts[source.hostname]?.nextAllowedAt||'')>nowMs)continue;
    const terms=await librarySourceSearchTerms(bible,{sourceKey:`${config.id}:${groupId}`,budget:perStore?2:4,
      priorityTerms:perStore?['barrel proof']:config.id==='WI'?['michter','barrel proof']:['barrel proof','eagle rare','weller'],broadTerms:[],cursorDir});
    const queryUrls=terms.map(term=>source.baseUrl+'/shop/?ch-query='+encodeURIComponent(term)+'&merchant-id='+source.merchantId);
    const urls=perStore?queryUrls:[source.categoryUrl,...queryUrls];
    const seen=new Set();let denied=false;
    for(const url of urls){
      signal?.throwIfAborted();if(requests.some(r=>r.sourceId===groupId))await sleep(1000);
      const response=await fetchText(url,{signal,timeoutMs:10000,maxBytes:2*1024*1024,maxRedirects:0});
      requests.push({sourceId:groupId,url,status:response.status||0,ok:response.ok===true});
      if(!response.ok){
        roadblocks.push({state:config.id,source:source.sourceLabel,url,status:response.status||0,error:response.error||`HTTP ${response.status}`});
        denied=[401,403,429,435].includes(Number(response.status));
        if(denied){sourceAttempts[groupId]={lastAttemptAt:observedAt,status:'access_denied',httpStatus:response.status,nextAllowedAt:new Date(nowMs+24*60*60_000).toISOString()};sourceAttempts[source.hostname]=sourceAttempts[groupId];break;}
        continue;
      }
      for(const candidate of sources)for(const row of parseCentralCityHiveInventory(response.text,candidate,bible,{observedAt}))if(!seen.has(row.id)){seen.add(row.id);signals.push(row);}
    }
    if(!denied)sourceAttempts[groupId]={lastAttemptAt:observedAt,status:seen.size?'success':'no_qualified_inventory',httpStatus:200,nextAllowedAt:new Date(nowMs+30*60_000).toISOString()};
  }
  return {signals,roadblocks,metadata:{requests,sourceAttempts}};
}
