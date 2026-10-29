import {readFile} from 'node:fs/promises';
import {WESTERN_GROCERY_EXPANSION_SOURCES} from './collectors/western-grocery-premises.mjs';
import {parseGroceryExpansionInventory} from './collectors/grocery-xapi-expansion.mjs';
import {isGroceryExpansionInventory} from './grocery-xapi-policy.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {buildDrops,bibleLookup} from './export-site-contract.mjs';
const files={WA:'washington-xapi-expansion',NM:'new-mexico-grocery-expansion'};

export async function executeGroceryResearchFixtures(payload,{bible}={}){
  const fixture=JSON.parse(await readFile(new URL(`../test/fixtures/${files[payload.state]}/identity.json`,import.meta.url)));
  const source=WESTERN_GROCERY_EXPANSION_SOURCES.find(s=>s.stateCode===payload.state&&s.merchantId===fixture.source.merchantId);
  const failures=[];
  for(const item of payload.cases||[]){
    const input=item.input||{},products=structuredClone(fixture.products);
    for(const product of products){
      if(input.rawName)product.name=input.rawName;
      if(input.size){product.name=product.name.replace(/\b750\s*ml\b/i,`${input.size} ml`);product.dispItemSizeQty=String(input.size);}
      if(input.wrongStore)product.storeId='unreviewed';
      if(input.shippingOnly){product.channelInventory={instore:'0',shipping:'1'};product.channelEligibility={inStore:false,shipping:true};}
      if(input.wrongProof)product.alcoholVolumePct=12;
    }
    // This is a synthetic executable fixture, never current source evidence.
    const observedAt=new Date(Date.now()-Number(input.ageMinutes||0)*60_000).toISOString();
    const rows=parseGroceryExpansionInventory({response:{docs:products}},input.wrongHost?{...source,host:'unreviewed.example'}:source,bible,{observedAt});
    const qualified=rows.filter(row=>isGroceryExpansionInventory(row)&&Date.now()-Date.parse(row.observedAt)<=2*60*60_000);
    const operational=qualified.map(row=>canonicalizeSignal(row,bible));
    const candidates=buildDrops(operational,bibleLookup(bible.records),operational).map(row=>({...row,previewOnly:true,
      canAlertAsInventory:false,canAlertAsWatch:false,eligibleForOnSite:true,eligibleForDropFeed:true,eligibleForWatch:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}));
    const actual={sourceRows:rows.length,inventoryProofRows:qualified.length,candidateCount:candidates.length,
      canonicalNames:[...new Set(rows.map(row=>row.canonicalName))].sort(),
      sourceClockPreserved:rows.every(row=>row.observedAt===observedAt)&&candidates.every(row=>row.observedAt===observedAt),
      deliveryEligible:candidates.some(row=>row.eligibleForDelivery||row.eligibleForEmail||row.eligibleForSms),
      quantitySemanticsPreserved:rows.every(row=>row.quantityIsExact===false?row.quantity===0:row.quantity>0)};
    for(const[key,expected]of Object.entries(item.expected||{}))if(JSON.stringify(actual[key])!==JSON.stringify(expected))failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)}; got ${JSON.stringify(actual[key])}`);
  }
  return{ok:failures.length===0,failures};
}
