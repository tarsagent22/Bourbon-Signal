import { readFile } from 'node:fs/promises';
import { CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory } from './collectors/central-cityhive-expansion.mjs';
import { CENTRAL_CITYHIVE_RESEARCH_SOURCES } from './collectors/central-cityhive-research-premises.mjs';
import { isCentralCityHiveInventory } from './central-cityhive-policy.mjs';
import { confidenceForSignal } from './confidence-policy.mjs';
import { bibleLookup,buildDrops,isActiveCustomerStateRow } from './export-site-contract.mjs';

const RETAINED_KS_DE_CAPTURES=Object.freeze({
  KS:Object.freeze({
    'kings-liquor-olathe:6060f76259a44e1d9f41522d':'KS/source-captures/001.html',
    'verns-liquor:61ae46168baad441363308b0':'KS/source-captures/003.html',
    'rj-liquor:6060f6496aaeeb555664ca4f':'KS/source-captures/005.html',
  }),
  DE:Object.freeze({
    'kreston-wines:618406f81a9efe0452444e07':'DE/source-captures/001.html',
    'kreston-wines:6054cfaae7d3073507c4ee0b':'DE/source-captures/003.html',
  }),
});

async function fixtureForSource(state,source){
  const retained=RETAINED_KS_DE_CAPTURES[state]?.[source.storeId];
  if(!retained)return JSON.parse(await readFile(new URL(`../test/fixtures/central-cityhive/${source.id}.json`,import.meta.url),'utf8'));
  const html=await readFile(new URL(`../test/fixtures/ks-de-cityhive/${retained}`,import.meta.url),'utf8');
  const embedded=html.match(/<script\b[^>]*type=["']application\/json["'][^>]*>([\s\S]*?)<\/script>/iu);
  if(!embedded)throw new Error(`Retained ${state} CityHive capture is missing its embedded product payload.`);
  return JSON.parse(embedded[1]);
}

export async function executeCentralCityHiveFixtures(payload,{bible}={}){
  const failures=[];
  for(const item of payload.cases||[]){
    const input=item.input||{},source=[...CENTRAL_CITYHIVE_EXPANSION_SOURCES,...CENTRAL_CITYHIVE_RESEARCH_SOURCES].find(source=>source.state===payload.state&&source.id===input.sourceId);
    if(!source){failures.push(`${item.id}: no reviewed source for state and source ID.`);continue;}
    const fixture=await fixtureForSource(payload.state,source);
    if(['MN','MO','WY'].includes(payload.state)){
      fixture.sourceId=source.id;
      for(const config of fixture.merchant_configs||[]){config.merchant.id=source.merchantId;config.merchant.name=source.name;config.merchant.address.full_address=source.address;config.merchant.address.location={type:'Point',coordinates:[source.lng,source.lat]};}
      for(const product of fixture.products||[])for(const merchant of product.merchants||[]){
        merchant.merchant_id=source.merchantId;merchant.full_address=source.address;
        for(const option of merchant.product_options||[]){option.merchant_id=source.merchantId;option.full_address=source.address;option.product_url=option.product_url.replace('https://liquorguys.com',source.baseUrl);}
      }
    }
    for(const product of fixture.products||[]){
      if(input.rawName)product.name=input.rawName;
      for(const merchant of product.merchants||[]){
        if(input.shippingOnly)merchant.offer_types=['shipping'];
        for(const option of merchant.product_options||[]){
          if(input.rawName)option.option_display_data.name=input.rawName;
          if(input.size)option.option_display_data.size.quantity=String(input.size);
          if(input.shippingOnly)option.allowed_offer_types=['shipping'];
          if(input.wrongMerchant)option.merchant_id='unreviewed-merchant';
          if(input.wrongHost)option.product_url=option.product_url.replace(source.baseUrl,'https://unreviewed.example');
        }
      }
    }
    const observedAt=new Date(Date.now()-Number(input.ageMinutes||0)*60_000).toISOString();
    const parsed=parseCentralCityHiveInventory(`<script type="application/json">${JSON.stringify(fixture)}</script>`,source,bible,{observedAt});
    const rows=parsed.map(row=>({...row,...(input.shadowOnly?{alertable:false,eligibleForOnSite:false,eligibleForDelivery:false,eligibleForEmail:false,eligibleForSms:false}:{}),raw:{...row.raw,shadowOnly:input.shadowOnly===true}}));
    const candidates=buildDrops(rows,bibleLookup(bible.records),rows);
    const actual={sourceRows:rows.length,inventoryProofRows:rows.filter(row=>isCentralCityHiveInventory(row)).length,
      candidateCount:candidates.length,canonicalNames:[...new Set(rows.map(row=>row.canonicalName))].sort(),
      quantity:candidates[0]?.quantity??null,quantityIsExact:candidates[0]?.quantityIsExact??null,
      semantics:candidates[0]?.quantitySemantics??null,
      preservesOriginalTimestamp:rows.every(row=>row.observedAt===observedAt)&&candidates.every(row=>row.observedAt===observedAt),
      deliveryEligible:candidates.some(row=>row.eligibleForDelivery===true||row.eligibleForEmail===true||row.eligibleForSms===true),
      confidenceInventoryAllowed:rows.some(row=>confidenceForSignal(row).canAlertAsInventory),
      customerActive:isActiveCustomerStateRow({state:payload.state})};
    for(const[key,expected]of Object.entries(item.expected||{}))if(JSON.stringify(actual[key])!==JSON.stringify(expected)){
      failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)} but got ${JSON.stringify(actual[key])}.`);
    }
  }
  return{ok:failures.length===0,failures};
}
