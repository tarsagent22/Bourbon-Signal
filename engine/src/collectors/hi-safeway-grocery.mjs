import {createHash} from 'node:crypto';
import {stableId} from '../core/text.mjs';
import {parseBoundGroceryXapiInventory} from './grocery-xapi-identity.mjs';

// Four HI premises were bound to Safeway's public resolver on 2026-11-14.
// This small reviewed cohort is intentionally not a statewide store directory.
export const HI_SAFEWAY_SOURCES=Object.freeze([
  {id:'safeway-hi-2944',merchantId:'2944',storeId:'safeway:2944',name:'Safeway #2944',address:'1234 S Beretania St, Honolulu, HI 96814',city:'Honolulu',zip:'96814',island:'Oahu'},
  {id:'safeway-hi-280',merchantId:'280',storeId:'safeway:280',name:'Safeway #280',address:"1090 Ho'okele St, Kahului, HI 96732",city:'Kahului',zip:'96732',island:'Maui'},
  {id:'safeway-hi-2894',merchantId:'2894',storeId:'safeway:2894',name:'Safeway #2894',address:'4454 Nuhou St Suite #301, Lihue, HI 96766',city:'Lihue',zip:'96766',island:'Kauai'},
  {id:'safeway-hi-2893',merchantId:'2893',storeId:'safeway:2893',name:'Safeway #2893',address:"381 E Maka'Ala St, Hilo, HI 96720",city:'Hilo',zip:'96720',island:'Hawaii Island'},
].map(Object.freeze));
export const HI_SAFEWAY_RESOLVER_ZIPS=Object.freeze([...new Set(HI_SAFEWAY_SOURCES.map(s=>s.zip))]);
const EXPECTED=Object.freeze({
  '960051942':{upc:'0008024400923',canonical:'Buffalo Trace Bourbon',name:/^Buffalo Trace Bourbon 90 Proof - 750 Ml \(limited quantities may be available in store\)$/i,abv:45},
  '960293806':{upc:'0008800400549',canonical:'E.H. Taylor Small Batch',name:/^E\.H\. Taylor Small Batch Kentucky Straight Bourbon Whiskey 100 Proof - 750 Ml \(limited quantities may be available in store\)$/i,abv:50},
  '960488502':{upc:'0008800400552',canonical:'E.H. Taylor Jr. Barrel Proof Bourbon',name:/^Colonel E\.H\. Taylor Barrel Proof Straight Kentucky Bourbon Whiskey Variable Proof - 750 Ml \(limited quantities may be available in store\)$/i,abv:63},
});
const sha=text=>createHash('sha256').update(text).digest('hex');
const norm=s=>String(s||'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
export function hiSafewayPremiseMatches(source,store){
 const a=store?.address;
 return String(store?.locationId||'')===source.merchantId&&a?.state==='HI'&&a?.country==='US'
  &&norm(store?.polarisBannerName)==='safeway'&&norm(store?.domainName)==='safeway'
  &&norm(`${a.line1}, ${a.city}, ${a.state} ${a.zipcode}`)===norm(source.address);
}
export function parseHiSafewayInventory(payload,source,bible,{observedAt}={}){
 if(!HI_SAFEWAY_SOURCES.includes(source)||!Number.isFinite(Date.parse(observedAt))||payload?.appCode!=='GR200 :: A-CT: 200')return [];
 // Restrict before the shared matcher: its legacy family fallback maps Bulleit
 // Single Malt to Bulleit Bourbon. Only these explicitly reviewed source SKUs
 // are admitted in this research candidate; every field below must agree.
 const exactPayload={...payload,response:{...payload.response,docs:(payload?.response?.docs||[]).filter(p=>Object.hasOwn(EXPECTED,String(p?.id||'')))}};
 return parseBoundGroceryXapiInventory(exactPayload,{merchantId:source.merchantId},bible).flatMap(row=>{
  const expected=EXPECTED[row.productId],p=row.rawProduct;
  if(!expected||String(p.upc)!==expected.upc||!expected.name.test(String(p.name||''))
   ||Number(p.alcoholVolumePct)!==expected.abv||Number(p.dispItemSizeQty)!==750
   ||String(p.dispUnitOfMeasure).toLowerCase()!=='ml'||String(p.unitOfMeasure).toLowerCase()!=='ml'
   ||Number(p.price)<=0||!Number.isFinite(Number(p.price))
   ||String(p.channelInventory?.instore??'')!=='1'||p.channelEligibility?.inStore!==true)return [];
  const match=bible.match(expected.canonical),record=match?.record;
  if(!record||record.canonical!==expected.canonical||!record.libraryIdentities?.length)return [];
  const productSnapshot={id:p.id,pid:p.pid,storeId:p.storeId,name:p.name,upc:p.upc,price:p.price,
   containsAlcohol:p.containsAlcohol,alcoholVolumePct:p.alcoholVolumePct,dispItemSizeQty:p.dispItemSizeQty,
   dispUnitOfMeasure:p.dispUnitOfMeasure,unitOfMeasure:p.unitOfMeasure,dispItemPackageQty:p.dispItemPackageQty,
   channelEligibility:{inStore:p.channelEligibility.inStore},channelInventory:{instore:p.channelInventory.instore}};
  return [{id:stableId(['HI','safeway-xapi',source.merchantId,row.productId]),state:'HI',stateCode:'HI',sourceChain:'safeway-hi-xapi',sourceLabel:'Hawaii Safeway XAPI in-store availability',sourceUrl:`https://www.safeway.com/shop/product-details.${row.productId}.html`,merchantId:source.merchantId,productId:row.productId,variantId:row.productId,rawName:row.title,canonicalBottleId:record.id,canonicalName:record.canonical,tier:record.tier,sourceBottleMatchMethod:'hi-safeway-reviewed-sku',confidence:1,eventType:'retailer_store_inventory_result',locationPrecision:'store_level',locationName:source.name,storeName:source.name,storeId:source.storeId,storeAddress:source.address,address:source.address,city:source.city,postalCode:source.zip,zip:source.zip,quantity:0,quantityIsExact:false,price:Number(p.price)>0?Number(p.price):null,observedAt,fetchedAt:observedAt,availabilityStatus:'in_stock',availabilityLabel:'Retailer reports in-store availability',sourceAvailabilityVerified:true,canAlertAsInventory:false,canAlertAsWatch:false,dataLane:'inventory',inventorySemantics:'binary_retailer_in_store_no_exact_count',caveat:'First-party in-store availability only; no exact quantity or retailer observation timestamp. Research only.',evidence:`${source.name} reports ${row.title} available at ${source.address}.`,sourceProductBinding:{schemaVersion:1,source:'safeway-hi-xapi',merchantId:source.merchantId,storeId:source.storeId,storeAddress:source.address,productId:row.productId,variantId:row.productId,rawName:row.title,canonicalBottleId:record.id,observedAt,premisesVerified:true,inStoreChannelVerified:true,inventorySemantics:'binary_retailer_in_store_no_exact_count',productSnapshot},raw:{chain:'safeway-hi-xapi',product:productSnapshot,inventorySemantics:'binary_retailer_in_store_no_exact_count',shadowOnly:true}}];
 });
}
