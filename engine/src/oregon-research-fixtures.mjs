import {parseOregonDailyInventoryCsv,isOregonDailyInventoryObservation,OREGON_DAILY_INVENTORY_URL} from './or-daily-inventory.mjs';

const RARE=new Set(['unicorn','allocated','limited']);
const HEADER=['OLCC Daily Store Inventory','Report Date','Store Number','Location','Street Address','City','Zip Code','Phone Number','Hours Of Operation','Category','Item Code','New Item Code','Description','Size','Proof','Bottle Price','Case Price','Quantity','Inventory Date'];
const csvCell=value=>{const text=String(value??'');return /[",\r\n]/.test(text)?`"${text.replace(/"/g,'""')}"`:text;};
function sampleReport(input,bible){
  const row={...input,reportDate:input.reportDate||'11/14/2026',inventoryDate:input.inventoryDate||'11/13/2026',storeNo:input.storeNo||'1001',storeName:input.storeName||'Condon',address:input.address||'225 S Main Street',city:input.city||'CONDON',zip:input.zip||'97823',quantity:input.quantity??4,category:input.category||'Domestic Whiskey',itemCode:input.itemCode||'fixture-1',newItemCode:input.newItemCode||'new-fixture-1',size:input.size||'750 ML',proof:input.proof??90,bottlePrice:input.bottlePrice||82.95,casePrice:input.casePrice||497.70};
  const values=[HEADER[0],row.reportDate,row.storeNo,row.storeName,row.address,row.city,row.zip,'555-0101','10-6',row.category,row.itemCode,row.newItemCode,row.rawName||'EAGLE RARE S/B BOURBON',row.size,row.proof,row.bottlePrice,row.casePrice,row.quantity,row.inventoryDate];
  return parseOregonDailyInventoryCsv(HEADER.map(csvCell).join(',')+'\r\n'+values.map(csvCell).join(',')+'\r\n',{generatedAt:'2026-11-14T06:30:00.000Z',bible});
}

function evaluate(item,{bible,registeredHosts}){
  const input=item.input||{};
  if(item.kind==='source_specific_sentinel'){
    let host='';try{host=new URL(input.sourceUrl).hostname.toLowerCase();}catch{}
    return{officialHost:registeredHosts.has(host),allowlistedHosts:[...registeredHosts].sort()};
  }
  const report=sampleReport(input,bible),product=report.products[0],store=product?.stores?.[0];
  if(item.kind==='positive_bottle_match')return{canonicalName:product?.canonicalName||null,tier:product?.rarityTier||null,customerVisible:Boolean(product?.canonicalBottleId)};
  if(item.kind==='ordinary_vs_rare_negative')return{rareMatch:report.products.some(row=>RARE.has(String(row.rarityTier||'').toLowerCase()))};
  if(['rye_cream_liqueur_rtd_exclusion','size_or_multipack_exclusion'].includes(item.kind))return{qualifiedProduct:Boolean(product)};
  if(item.kind==='availability_semantics')return{quantity:store?.quantity??null,exactShelfQuantity:Boolean(store),canAlertAsInventory:false,canAlertAsWatch:false};
  if(item.kind==='store_identity')return{storeId:store?.storeNo||null,storeAddress:store?[store.address,store.city,'OR',store.zip].join(', '):null,fabricateIdentity:false};
  if(item.kind==='timestamp_freshness'){
    const observedAt=store?.inventoryObservedAt||null;
    const signal=store?{state:'OR',sourceUrl:OREGON_DAILY_INVENTORY_URL,locationPrecision:'store_level',storeId:store.storeNo,storeAddress:[store.address,store.city,'OR',store.zip].join(', '),canonicalBottleId:product.canonicalBottleId,sourceAvailabilityVerified:true,canAlertAsInventory:false,canAlertAsWatch:false,quantity:store.quantity,observedAt}:null;
    return{preserveOriginalTimestamp:observedAt===input.expectedObservedAt,futureTimestampAllowed:false,staleRowsAlertable:false,accepted:isOregonDailyInventoryObservation(signal,Date.parse('2026-11-14T07:00:00.000Z'))};
  }
  return{};
}

export function executeOregonResearchFixtures(payload,{bible,registeredHosts=new Set(['www.olcc.state.or.us'])}={}){
  const failures=[];
  for(const item of payload.cases||[])for(const[key,expected]of Object.entries(item.expected||{})){
    const actual=evaluate(item,{bible,registeredHosts});if(JSON.stringify(actual[key])!==JSON.stringify(expected))failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)} got ${JSON.stringify(actual[key])}`);
  }
  return{ok:failures.length===0,failures};
}
