import {readFile} from 'node:fs/promises';
import {LOUISIANA_ALASKA_GROCERY_SOURCES} from './collectors/louisiana-alaska-grocery-premises.mjs';
import {parseLouisianaAlaskaGroceryInventory} from './collectors/louisiana-alaska-grocery-expansion.mjs';
import {isLouisianaAlaskaGroceryInventory} from './louisiana-alaska-grocery-policy.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';

export async function executeLouisianaAlaskaGroceryFixtures(payload,{bible}={}){
  const fixture=JSON.parse(await readFile(new URL('../test/fixtures/louisiana-alaska-grocery/identity.json',import.meta.url)));
  const captured=fixture.cases.find(row=>row.state===payload.state||row.source.stateCode===payload.state);
  if(!captured)throw Error('Unreviewed LA/AK fixture state');
  const source=LOUISIANA_ALASKA_GROCERY_SOURCES.find(row=>row.id===captured.source.id),failures=[];
  for(const item of payload.cases||[]){
    const input=item.input||{},products=structuredClone(captured.products);
    for(const product of products){
      if(input.rawName)product.name=input.rawName;
      if(input.size){product.name=product.name.replace(/\b750\s*ml\b/i,`${input.size} ml`);product.dispItemSizeQty=String(input.size);}
      if(input.wrongStore)product.storeId='unreviewed';
      if(input.shippingOnly){product.channelInventory={instore:'0',shipping:'1'};product.channelEligibility={inStore:false,shipping:true};}
      if(input.wrongProof)product.alcoholVolumePct=12;
    }
    // Captured product fixture execution is implementation proof, never live stock.
    const observedAt=new Date(Date.now()-Number(input.ageMinutes||0)*60000).toISOString();
    const rows=parseLouisianaAlaskaGroceryInventory({response:{docs:products}},input.wrongHost?{...source,host:'unreviewed.example'}:source,bible,{observedAt})
      .map(row=>({...row,canAlertAsInventory:false,canAlertAsWatch:false,alertable:false,eligibleForOnSite:true,eligibleForDropFeed:true,
        eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}));
    const qualified=rows.filter(row=>isLouisianaAlaskaGroceryInventory(row)&&Date.now()-Date.parse(row.observedAt)<=2*60*60000);
    const operational=qualified.map(row=>canonicalizeSignal(row,bible)),candidates=buildDrops(operational,bibleLookup(bible.records),operational);
    const actual={sourceRows:rows.length,inventoryProofRows:qualified.length,candidateCount:candidates.length,
      sourceClockPreserved:rows.every(row=>row.observedAt===observedAt)&&candidates.every(row=>row.observedAt===observedAt),
      deliveryEligible:candidates.some(row=>row.canAlertAsInventory||row.canAlertAsWatch||row.eligibleForWatch||row.eligibleForDelivery||row.eligibleForEmail||row.eligibleForSms),
      quantitySemanticsPreserved:rows.every(row=>row.quantityIsExact===false?row.quantity===0:row.quantity>0),
      previewFlagRequired:candidates.some(row=>row.previewOnly===true)};
    for(const[key,expected]of Object.entries(item.expected||{}))if(JSON.stringify(actual[key])!==JSON.stringify(expected))failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)}; got ${JSON.stringify(actual[key])}`);
  }
  return{ok:failures.length===0,failures};
}
