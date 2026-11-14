import { readFile } from 'node:fs/promises';
import { CENTRAL_CITYHIVE_EXPANSION_SOURCES,parseCentralCityHiveInventory } from './collectors/central-cityhive-expansion.mjs';
import { CENTRAL_CITYHIVE_RESEARCH_SOURCES } from './collectors/central-cityhive-research-premises.mjs';
import { isCentralCityHiveInventory } from './central-cityhive-policy.mjs';
import { confidenceForSignal } from './confidence-policy.mjs';
import { bibleLookup,buildDrops,isActiveCustomerStateRow } from './export-site-contract.mjs';

export async function executeCentralCityHiveFixtures(payload,{bible}={}){
  const failures=[];
  for(const item of payload.cases||[]){
    const input=item.input||{},source=[...CENTRAL_CITYHIVE_EXPANSION_SOURCES,...CENTRAL_CITYHIVE_RESEARCH_SOURCES]
      .find(source=>source.state===payload.state&&source.id===input.sourceId);
    if(!source){failures.push(`${item.id}: no reviewed source for state and source ID.`);continue;}
    const researchFixture=source.state==='MN'?({
      'top-ten-liquors:64640ae4a9a1022c2d6eba51':'mn-top-ten-blaine.json',
    }[source.id]):source.state==='RI'?({
      'rhode-island-liquor-delivery:64f6226b7537422b95e04824':'eagle-rare-10-year-kentucky-straight-bourbon.json',
      'fifth-ward-liquor:546babb03932330002100300':'fifth-ward-eagle-rare-10.json',
      'california-liquors-ri:6114919961187149b8241cdd':'california-liquors-eagle-rare-10.json',
    }[source.id]):null;
    const fixturePath=researchFixture
      ? new URL(`../test/fixtures/${source.state==='RI'?'ri-cityhive':'central-cityhive'}/${researchFixture}`,import.meta.url)
      : new URL(`../test/fixtures/central-cityhive/${source.id}.json`,import.meta.url);
    const fixture=JSON.parse(await readFile(fixturePath,'utf8'));
    const products=fixture.products|| (fixture.product?[fixture.product]:[]);
    for(const product of products){
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
