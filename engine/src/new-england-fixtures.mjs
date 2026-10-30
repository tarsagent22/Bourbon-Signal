import {readFile} from 'node:fs/promises';
import {gunzipSync} from 'node:zlib';
import {NEW_ENGLAND_RESEARCH_SOURCES,parseNewEnglandResearchInventory} from './collectors/new-england-research.mjs';
import {isNewEnglandInventory} from './new-england-policy.mjs';
import {canonicalizeSignal} from './operational-report.mjs';
import {bibleLookup,buildDrops} from './export-site-contract.mjs';
const root=new URL('../data/source-evidence/new-england-research-20261029/',import.meta.url);
export async function executeNewEnglandFixtures(payload,{bible}={}){
  const receipts=JSON.parse(await readFile(new URL('receipts.json',root),'utf8')).receipts,failures=[];
  for(const item of payload.cases||[]){
    const input=item.input||{},source=NEW_ENGLAND_RESEARCH_SOURCES.find(row=>row.state===payload.state&&row.id===input.sourceId);
    if(!source){failures.push(item.id+': unreviewed source');continue;}
    const receipt=receipts.find(row=>row.url===source.discoveryUrl),body=gunzipSync(await readFile(new URL(receipt.artifactPath,root)),{maxOutputLength:2*1024*1024}).toString('utf8'),roots=[];
    for(const match of body.matchAll(/decodeURIComponent\(\s*(["'`])([\s\S]*?)\1\s*\)/g))try{roots.push(JSON.parse(decodeURIComponent(match[2])));}catch{}
    let visited=0;const walk=value=>{
      if(++visited>80000||!value||typeof value!=='object')return;
      if(value.merchants&&input.rawName)value.name=input.rawName;
      if(value.option_id){
        if(input.rawName&&value.option_display_data)value.option_display_data.name=input.rawName;
        if(input.size&&value.option_display_data?.size)value.option_display_data.size.quantity=String(input.size);
        if(input.shippingOnly)value.allowed_offer_types=['shipping'];
        if(input.preorder)value.preorder_details={available_at:'2030-01-01'};
        if(input.wrongMerchant)value.merchant_id='unreviewed';
        if(input.wrongHost)value.product_url=value.product_url?.replace(source.baseUrl,'https://foreign.invalid');
        if(Object.hasOwn(input,'stock'))value.quantity=input.stock;
      }
      for(const child of Object.values(value))if(child&&typeof child==='object')walk(child);
    };roots.forEach(walk);
    // Fixture time injection is synthetic implementation testing. Source
    // receipt replay uses its immutable original clock in a separate verifier.
    const observedAt=new Date(Date.now()-Number(input.ageMinutes||0)*60_000).toISOString();
    const rows=parseNewEnglandResearchInventory('<script type="application/json">'+JSON.stringify(roots)+'</script>',source,bible,{observedAt});
    const operational=rows.map(row=>canonicalizeSignal(row,bible)),drops=buildDrops(operational,bibleLookup(bible.records),operational);
    const actual={sourceRows:rows.length,inventoryProofRows:rows.filter(row=>isNewEnglandInventory(row)).length,
      quantity:rows[0]?.quantity??null,quantityIsExact:rows[0]?.quantityIsExact??null,
      allNotificationsDisabled:rows.every(row=>!row.canAlertAsInventory&&!row.canAlertAsWatch&&!row.eligibleForDelivery&&!row.eligibleForEmail&&!row.eligibleForSms),
      researchExportRows:drops.length,preservesOriginalTimestamp:rows.every(row=>row.observedAt===observedAt)};
    for(const[key,expected]of Object.entries(item.expected||{}))if(JSON.stringify(actual[key])!==JSON.stringify(expected))failures.push(`${item.id}: expected ${key}=${JSON.stringify(expected)} but got ${JSON.stringify(actual[key])}`);
  }
  return{ok:failures.length===0,failures};
}
