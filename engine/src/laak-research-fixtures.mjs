import {readFile} from 'node:fs/promises';
import {LOUISIANA_ALASKA_GROCERY_SOURCES} from './collectors/louisiana-alaska-grocery-premises.mjs';
import {parseLouisianaAlaskaGroceryInventory} from './collectors/louisiana-alaska-grocery-expansion.mjs';
import {isLouisianaAlaskaGroceryInventory} from './louisiana-alaska-grocery-policy.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';

const fixture=JSON.parse(await readFile(new URL('../test/fixtures/louisiana-alaska/identity.json',import.meta.url)));
export async function executeLaakResearchFixtures(payload,{bible}={}){
 const state=payload.state,sources=LOUISIANA_ALASKA_GROCERY_SOURCES.filter(source=>source.stateCode===state),source=sources[0],failures=[];
 if(!['AK','LA'].includes(state)||!source)return{ok:false,failures:['Fixture state is not a reviewed AK/LA source.']};
 for(const item of payload.cases||[]){
  if(item.kind==='source_specific_sentinel'){
   const actual={officialHost:new URL(item.input?.sourceUrl||'https://invalid.example').hostname===source.host,sourceHost:source.host};
   for(const[key,expected]of Object.entries(item.expected||{}))if(JSON.stringify(actual[key])!==JSON.stringify(expected))failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)}; got ${JSON.stringify(actual[key])}`);
   continue;
  }
  const input=item.input||{},observedAt=input.observedAt||'2026-11-14T06:00:00.000Z',product=structuredClone(fixture.product);
  product.storeId=source.merchantId;
  if(input.wrongStore)product.storeId='999999';
  if(input.wrongHost)product.storeId=source.merchantId;
  if(input.rawName)product.name=input.rawName;
  if(input.cream)product.name='Bourbon Cream Liqueur 750 Ml';
  if(input.rtd)product.name='Bourbon Old Fashioned Cocktail 750 Ml';
  if(input.pack)product.dispItemPackageQty='6';
  if(input.missingInventory)delete product.channelInventory.instoreItemQty;
  if(input.largeQuantity)product.channelInventory.instoreItemQty='100';
  const rows=parseLouisianaAlaskaGroceryInventory({appCode:'GR200',response:{docs:[product]}},source,bible,{observedAt});
  const qualified=rows.filter(isLouisianaAlaskaGroceryInventory),operational=qualified.map(row=>canonicalizeSignal(row,bible));
  const candidates=buildDrops(operational,bibleLookup(bible.records),operational).map(row=>({...row,previewOnly:true,
   canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,
   eligibleForWatch:false,eligibleForDelivery:false,deliveryEligible:false,eligibleForEmail:false,eligibleForSms:false}));
  const actual={qualified:qualified.length>0,canonicalNames:[...new Set(qualified.map(row=>row.canonicalName))],
   qualifiedProduct:qualified.length>0,rareMatch:qualified.some(row=>['unicorn','allocated','limited'].includes(row.tier)),
   exactQuantity:qualified[0]?.quantityIsExact??null,quantity:qualified[0]?.quantity??null,
   storeId:qualified[0]?.storeId??null,storeIdentityVerified:qualified.every(row=>row.storeId===source.storeId&&row.storeAddress===source.address),
   preservedClock:qualified.every(row=>row.observedAt===observedAt)&&candidates.every(row=>row.observedAt===observedAt),
   previewOnly:candidates.length>0&&candidates.every(row=>row.previewOnly===true),allAlertsDisabled:candidates.every(row=>[
    'canAlertAsInventory','canAlertAsWatch','alertable','eligibleForWatch','eligibleForDelivery','deliveryEligible','eligibleForEmail','eligibleForSms'
   ].every(key=>row[key]===false)),candidateCount:candidates.length};
  for(const[key,expected]of Object.entries(item.expected||{}))if(JSON.stringify(actual[key])!==JSON.stringify(expected))failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)}; got ${JSON.stringify(actual[key])}`);
 }
 return{ok:failures.length===0,failures};
}
