import { parseCityHiveProducts } from './cityhive-surfaces.mjs';
import { cityHiveSafeBottleMatch } from './safe-bottle-match.mjs';
import { stableId } from '../core/text.mjs';
import { librarySourceSearchTerms } from '../library-search-runtime.mjs';
import texasExpansion from '../../data/texas-cityhive-expansion-sources.json' with {type:'json'};
import { MINNESOTA_CITYHIVE_EXPANSION_SOURCES, MIDWEST_CITYHIVE_EXPANSION_SOURCES, ADDITIONAL_CITYHIVE_EXPANSION_SOURCES, MARYLAND_CITYHIVE_RESEARCH_SOURCES, RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES, WYOMING_CITYHIVE_RESEARCH_SOURCES, DC_CITYHIVE_RESEARCH_SOURCES, ARKANSAS_CITYHIVE_RESEARCH_SOURCES } from './central-cityhive-research-premises.mjs';
export { MINNESOTA_CITYHIVE_EXPANSION_SOURCES, MIDWEST_CITYHIVE_EXPANSION_SOURCES, ADDITIONAL_CITYHIVE_EXPANSION_SOURCES } from './central-cityhive-research-premises.mjs';
import {centralCityHiveRecordMarketTier} from './central-cityhive-market-policy.mjs';
export {centralCityHiveRecordMarketTier} from './central-cityhive-market-policy.mjs';
import {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from './central-cityhive-premises.mjs';
export {CENTRAL_CITYHIVE_EXPANSION_SOURCES} from './central-cityhive-premises.mjs';
export const TEXAS_CITYHIVE_EXPANSION_SOURCES=Object.freeze(texasExpansion.stores.map(Object.freeze));
const ALL_SOURCES=Object.freeze([...CENTRAL_CITYHIVE_EXPANSION_SOURCES,...TEXAS_CITYHIVE_EXPANSION_SOURCES,...MINNESOTA_CITYHIVE_EXPANSION_SOURCES,...MIDWEST_CITYHIVE_EXPANSION_SOURCES,...ADDITIONAL_CITYHIVE_EXPANSION_SOURCES,...MARYLAND_CITYHIVE_RESEARCH_SOURCES,...RHODE_ISLAND_CITYHIVE_RESEARCH_SOURCES,...WYOMING_CITYHIVE_RESEARCH_SOURCES,...DC_CITYHIVE_RESEARCH_SOURCES,...ARKANSAS_CITYHIVE_RESEARCH_SOURCES]);

const WYOMING_WELLER = Object.freeze({
  merchantId: '5dd3011bbc3e38663aadcb3c',
  productId: '5d6ee338e548d71ac6cb7b48',
  optionId: '2358e78ce51684fe9dce7e08158be31c0d9eaa34d34679df05deb40d56aa580e',
  rawName: 'Weller Full Proof 114 Proof Wheated Bourbon',
  canonicalName: 'Weller Full Proof',
});

export function centralCityHiveLibraryTier(signal,bible) {
 const source=ALL_SOURCES.find(s=>s.state===signal.state&&s.merchantId===signal.merchantId&&s.storeId===signal.storeId);
 const p=signal.sourceProductBinding,variant=signal.optionId||signal.variantId;
 if(!source||signal.sourceLabel!==source.sourceLabel||signal.sourceChain!==(source.chainId||source.id)
   ||signal.storeAddress!==source.address||p?.source!=='central-cityhive'||p.schemaVersion!==1
   ||p.storeId!==signal.storeId||p.storeAddress!==signal.storeAddress||p.merchantId!==signal.merchantId
   ||p.productId!==signal.productId||p.optionId!==variant||p.rawName!==signal.rawName
   ||p.canonicalBottleId!==signal.canonicalBottleId||p.price!==signal.price||p.observedAt!==signal.observedAt
   ||p.premisesVerified!==true||p.pickupOfferVerified!==true||signal.sourceAvailabilityVerified!==true
   ||signal.availabilityStatus!=='in_stock'||Number(signal.quantity)!==0||signal.quantityIsExact!==false
   ||!Number.isFinite(Date.parse(signal.observedAt)))return null;
 if(source.lat!=null&&(signal.lat!==source.lat||signal.lng!==source.lng||p.coordinatesVerified!==true||p.latitude!==source.lat||p.longitude!==source.lng))return null;
 try{const url=new URL(signal.sourceUrl),segments=url.pathname.split('/').filter(Boolean);
  const scope = source.scopeProductUrlToMerchant;
  const query = url.searchParams;
  if(url.protocol!=='https:'||url.hostname!==source.hostname||url.username||url.password||url.hash
    ||segments.length!==4||segments[0]!=='shop'||segments[1]!=='product'||segments[3]!==signal.productId
    ||[...query].length!==(scope?2:1)||query.get('option-id')!==variant
    ||(scope&&query.get('merchant-id')!==source.merchantId))return null;
 }catch{return null;}
 const record=bible.records.find(r=>r.id===p.canonicalBottleId);if(!record)return null;
 const identity=p.identityName||signal.rawName;
 let match=cityHiveSafeBottleMatch(identity,bible);
 if(identity!==signal.rawName){
  const reviewed=(signal.productId==='6594472cd20b667b856eb419'&&signal.rawName==='R Michters Single Barrel Rye 10yr 750ml'&&identity==="Michter's 10 Year Rye")
    ||(signal.productId==='5e21e94d0320ad0f80403af4'&&signal.rawName==='Larceny Barrel Proof Brourbon'&&identity==='Larceny Barrel Proof')
    ||(signal.merchantId==='6060f6496aaeeb555664ca4f'&&signal.productId==='665932752999236a66c861b6'
      &&signal.rawName==='WELLER MILLENIUM'&&identity==='Weller Millennium')
    ||(signal.merchantId==='594311b6c90f94622d026e1e'&&signal.productId==='6a03603df437b100019febf3'
      &&variant==='c4b6d71d9d8941ce0521d41f56e30cef46056aa805a9e38a896679e9b05c2c45'
      &&signal.rawName==='Little Book Chapter All The Wiser'&&identity==='Little Book Chapter 10')
    ||(signal.merchantId==='64f6226b7537422b95e04824'&&signal.productId==='56c28cb0756275139def0100'
      &&signal.rawName==='Stagg Jr. Kentucky Straight Bourbon Whiskey'&&identity==='Stagg')
    || (source.state === 'WY' && signal.merchantId === WYOMING_WELLER.merchantId
      && signal.productId === WYOMING_WELLER.productId && variant === WYOMING_WELLER.optionId
      && signal.rawName === WYOMING_WELLER.rawName && identity === WYOMING_WELLER.canonicalName);
  if(!reviewed)return null;
 }
 if(match.record?.id!==record.id||match.match?.confidence!==1)return null;
 return centralCityHiveRecordMarketTier(record,source.state);
}

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
  const description=[product.description,data.description].join(' ').replace(/<[^>]*>/gu,' ').replace(/&nbsp;|\u00a0/giu,' ');
  if(option.merchant_id==='594311b6c90f94622d026e1e' && id==='6a03603df437b100019febf3'
    &&option.option_id==='c4b6d71d9d8941ce0521d41f56e30cef46056aa805a9e38a896679e9b05c2c45'
    &&product.name==='Little Book Chapter All The Wiser' && data.name===product.name
    &&props.brands?.length===1 && props.brands[0]==='Little Book'
    &&data.basic_category?.includes('whiskey') && props.state==='Kentucky' && String(props.age)==='10'
    &&/\bLittle Book Chapter 10\b[\s\S]{0,120}\bAll the Wiser\b/i.test(description)
    &&/\b100%\s+bourbon\b/i.test(description))return 'Little Book Chapter 10';
  if(id==='6594472cd20b667b856eb419' && product.name==='R Michters Single Barrel Rye 10yr 750ml'
    && String(props.age)==='10' && props.brands?.length===1 && props.brands[0]==="Michter's"
    && data.basic_category?.includes('rye') && !data.basic_category?.includes('bourbon'))return "Michter's 10 Year Rye";
  if(id==='5e21e94d0320ad0f80403af4' && product.name==='Larceny Barrel Proof Brourbon'
    && props.brands?.length===1 && props.brands[0]==='Larceny'
    && data.basic_category?.includes('bourbon') && !data.basic_category?.includes('rye')
    && Number.parseFloat(props.content)>=55 && Number.parseFloat(props.content)<=75)return 'Larceny Barrel Proof';
  if(option.merchant_id==='6060f6496aaeeb555664ca4f' && id==='665932752999236a66c861b6'
    && product.name==='WELLER MILLENIUM' && props.brands?.length===1 && props.brands[0]==='Weller Bourbon'
    && data.basic_category?.includes('bourbon') && props.state==='Kentucky')return 'Weller Millennium';
  const categories=Array.isArray(product.basic_category)?product.basic_category.map(value=>String(value).toLowerCase()):[];
  if(option.merchant_id==='64f6226b7537422b95e04824' && id==='56c28cb0756275139def0100'
    && product.name==='Stagg Jr. Kentucky Straight Bourbon Whiskey'
    && String(product.additional_properties?.brands)==='Stagg Bourbon'
    && categories.includes('bourbon')&&!categories.includes('rye')
    && Number.parseFloat(product.additional_properties?.content)>=50&&Number.parseFloat(product.additional_properties?.content)<=75)return 'Stagg';
  if (option.merchant_id === WYOMING_WELLER.merchantId && id === WYOMING_WELLER.productId
    && option.option_id === WYOMING_WELLER.optionId && product.name === WYOMING_WELLER.rawName
    && data.basic_category?.includes('bourbon') && !data.basic_category?.includes('rye')
    && props.state === 'Kentucky' && props.content === '57%') return WYOMING_WELLER.canonicalName;
  return null;
}

export function parseCentralCityHiveInventory(html, candidate, bible, {observedAt,onVerifiedPremise}={}) {
  const source=ALL_SOURCES.find(s=>s===candidate);
  if(!source || !Number.isFinite(Date.parse(observedAt)))return [];
  return parseCityHiveProducts(html,source,{sources:ALL_SOURCES,
    isAllowedOption:centralCityHiveBottleFormat,
    reviewOption:reviewedCentralCityHiveIdentity,
    isAllowedMerchantConfiguration:merchant=>{
      if(source.lat==null&&source.lng==null){onVerifiedPremise?.(source);return true;}
      const point=merchant.address?.location,coordinates=point?.coordinates;
      const allowed=point?.type==='Point'&&Array.isArray(coordinates)&&coordinates.length===2
        &&coordinates.every(Number.isFinite)&&coordinates[1]===source.lat&&coordinates[0]===source.lng;
      if(allowed)onVerifiedPremise?.(source);return allowed;
    },
  }).flatMap(row=>{
    const identity=row.reviewedIdentity;
    const {record,match}=identity ? (()=>{const m=bible.match(identity);return {match:m,record:m?.record?.canonical===identity?m.record:null};})() : cityHiveSafeBottleMatch(row.title,bible);
    const batch=row.title.match(/\bbatch\s*(\d{1,4})\b|\b(\d{1,4})\s*batch\b/i);
    if(batch && !new RegExp(`\\b${batch[1]||batch[2]}\\b`).test(record?.canonical||''))return [];
    const tier=centralCityHiveRecordMarketTier(record,source.state);
    if(!record || match?.confidence!==1 || !['allocated','limited','unicorn'].includes(tier) || !Number.isFinite(row.price) || row.price<=0)return [];
    const productUrl = new URL(row.productUrl);
    if (source.scopeProductUrlToMerchant) productUrl.searchParams.set('merchant-id', source.merchantId);
    return [{id:stableId([source.state,source.id,row.productId,row.variantId]),state:source.state,stateCode:source.state,
      sourceLabel:source.sourceLabel,sourceUrl:productUrl.href,sourceChain:source.chainId||source.id,merchantId:source.merchantId,
      productId:row.productId,optionId:row.variantId,variantId:row.variantId,rawName:row.title,canonicalBottleId:record.id,canonicalName:record.canonical,
      tier,confidence:Math.max(.85,match?.confidence || 0),eventType:'retailer_store_inventory_result',
      locationPrecision:'store_level',locationName:source.name,storeName:source.name,storeId:source.storeId,
      storeAddress:source.address,city:source.city,postalCode:source.zip,zip:source.zip,
      lat:source.lat??null,lng:source.lng??null,
      quantity:0,storeQty:0,quantityIsExact:false,quantitySemantics:'binary_retailer_orderable_no_exact_count',
      price:row.price,observedAt,fetchedAt:observedAt,availabilityStatus:'in_stock',
      availabilityLabel:'Retailer reports pickup available',sourceAvailabilityVerified:true,
      canAlertAsInventory:true,canAlertAsWatch:true,dataLane:'inventory',
      inventorySemantics:'The current first-party merchant configuration, exact address, product variant and positive pickup offer agree. Exact shelf quantity is not published; verify before driving.',
      evidence:`${source.name} reports ${row.title} available for pickup at ${source.address} for $${row.price.toFixed(2)}.`,
      sourceProductBinding:{schemaVersion:1,source:'central-cityhive',merchantId:source.merchantId,storeId:source.storeId,
        storeAddress:source.address,productId:row.productId,optionId:row.variantId,rawName:row.title,
        canonicalBottleId:record.id,canonicalName:record.canonical,identityName:identity||row.title,price:row.price,observedAt,premisesVerified:true,pickupOfferVerified:true,
        reportedQuantity:row.reportedQuantity,quantitySemantics:'binary_retailer_orderable_no_exact_count',
        ...(source.lat!=null&&source.lng!=null?{latitude:source.lat,longitude:source.lng,coordinatesVerified:true}:{})},
      raw:{chain:source.chainId||source.id,merchantId:source.merchantId,productId:row.productId,optionId:row.variantId,
        reportedQuantity:row.reportedQuantity,quantitySemantics:'binary_retailer_orderable_no_exact_count'}}];
  });
}

export async function collectCentralCityHiveExpansion(config,bible,{fetchText,observedAt=new Date().toISOString(),signal,
  sleep=ms=>new Promise(r=>setTimeout(r,ms)),cursorDir,attempts={},nowMs=Date.now(),sourceIds}={}) {
  if(typeof fetchText!=='function')throw new Error('A bounded first-party fetchText function is required');
  const signals=[],roadblocks=[],requests=[],sourceAttempts={...attempts},verifiedPremises=new Set(),requestedHosts=new Set();
  const perStore=['TX','MN','MO','IL','NJ','LA','MI','MA','CT','DE','HI','MD','KS','RI','WY','DC','AR'].includes(config.id);
  const allowed=sourceIds===undefined?ALL_SOURCES.filter(s=>s.state===config.id):sourceIds.map(id=>ALL_SOURCES.find(s=>s.state===config.id&&s.id===id)).filter(Boolean);
  if(sourceIds!==undefined&&(allowed.length!==sourceIds.length||new Set(sourceIds).size!==sourceIds.length))throw new Error('CityHive source filter must contain unique reviewed premises for this state');
  const groups=Map.groupBy(allowed,s=>perStore?s.id:s.chainId||s.id);
  for(const [groupId,sources] of groups){
    const source=sources[0];
    if(Date.parse(attempts[groupId]?.nextAllowedAt || '')>nowMs || Date.parse(sourceAttempts[source.hostname]?.nextAllowedAt||'')>nowMs)continue;
    const priorityTerms=perStore?(Array.isArray(source.prioritySearchTerms)&&source.prioritySearchTerms.length?source.prioritySearchTerms:[source.prioritySearchTerm||'barrel proof'])
      :config.id==='WI'?['michter','barrel proof']:['barrel proof','eagle rare','weller'];
    const terms=await librarySourceSearchTerms(bible,{sourceKey:`${config.id}:${groupId}`,budget:perStore?Math.max(2,priorityTerms.length+1):4,
      priorityTerms,broadTerms:[],cursorDir});
    const queryUrls=terms.map(term=>source.baseUrl+'/shop/?ch-query='+encodeURIComponent(term)+'&merchant-id='+source.merchantId);
    const urls=perStore?queryUrls:[source.categoryUrl,...queryUrls];
    const seen=new Set();let denied=false;
    for(const url of urls){
      signal?.throwIfAborted();if(requestedHosts.has(source.hostname))await sleep(1000);
      requestedHosts.add(source.hostname);
      const response=await fetchText(url,{signal,timeoutMs:10000,maxBytes:2*1024*1024,maxRedirects:0});
      requests.push({sourceId:groupId,url,status:response.status||0,ok:response.ok===true});
      if(!response.ok){
        roadblocks.push({state:config.id,source:source.sourceLabel,url,status:response.status||0,error:response.error||`HTTP ${response.status}`});
        denied=[401,403,429,435].includes(Number(response.status));
        if(denied){sourceAttempts[groupId]={lastAttemptAt:observedAt,status:'access_denied',httpStatus:response.status,nextAllowedAt:new Date(nowMs+24*60*60_000).toISOString()};sourceAttempts[source.hostname]=sourceAttempts[groupId];break;}
        continue;
      }
      for(const candidate of sources)for(const row of parseCentralCityHiveInventory(response.text,candidate,bible,{observedAt,onVerifiedPremise:source=>verifiedPremises.add(source.storeId)}))if(!seen.has(row.id)){seen.add(row.id);signals.push(row);}
    }
    if(!denied)sourceAttempts[groupId]={lastAttemptAt:observedAt,status:seen.size?'success':'no_qualified_inventory',httpStatus:200,nextAllowedAt:new Date(nowMs+30*60_000).toISOString()};
  }
  const selectedStores=allowed.map(source=>source.storeId);
  return {signals,roadblocks,metadata:{requests,sourceAttempts,selectedStores,verifiedPremises:[...verifiedPremises],
    complete:requests.length>0&&requests.every(request=>request.ok)&&selectedStores.every(id=>verifiedPremises.has(id)),exhaustiveCatalogVerified:false}};
}
