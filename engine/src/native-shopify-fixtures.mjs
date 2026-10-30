import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {nativeShopifySource,isNativeShopifyOnSiteSignal} from './native-shopify-onsite-policy.mjs';
import {collectClosedNativePickupObservation} from './collectors/native-shopify-onsite.mjs';
const sha=value=>createHash('sha256').update(value).digest('hex');
// Exact historical native bodies only. Case mutations are explicit synthetic
// negatives, never source observations, current stock or collector authority.
export async function executeNativeShopifyFixtures(payload,{bible}={}){
 const failures=[],source=nativeShopifySource(payload.sourceId);
 if(!source||payload.fixtureProtocol!=='closed-native-shopify-pickup@1'||payload.state!==source.definition.state)return{ok:false,failures:['Foreign or unknown native source fixture scope.']};
 const bodies=new Map();for(const receipt of source.receipts){
  const body=await readFile(new URL('../test/fixtures/'+source.base+receipt.artifactPath,import.meta.url),'utf8');
  if(Buffer.byteLength(body)!==receipt.bytes||sha(body)!==receipt.sha256)throw Error('Original native fixture body changed');bodies.set(receipt.url,body);
 }
 for(const item of payload.cases||[]){
  let reads=0,rows=[],rejected=false;const mutation=item.input?.mutation;
  try{const result=await collectClosedNativePickupObservation(payload.sourceId,bible,{observedAt:source.clock,fetchText:async url=>{
   if(!bodies.has(url)||++reads>2)throw Error('Native fixture escaped its two exact URLs');let text=bodies.get(url);
   if(url.endsWith('.json')){const json=JSON.parse(text),product=json.product||json,variant=product.variants.find(v=>String(v.id)===source.definition.products[0].variantId);
    if(mutation==='title'||mutation==='cream')product.title=mutation==='cream'?'Bourbon Cream Liqueur':'Unknown Ordinary Bourbon';
    if(mutation==='size'){variant.title='50ml';variant.option1='50ml';}
    if(mutation==='variant')variant.id='999999999999';text=JSON.stringify(json);
   }else if(mutation==='premise')text=text.replaceAll(source.definition.stores[0].address.split(' ')[0],'99999');
   return{ok:true,status:200,url,text};
  }});rows=result.signals;}catch{rejected=true;}
  const nowMs=Date.parse(source.clock)+(mutation==='stale'?60*60_000+1:30_000),valid=rows.filter(row=>isNativeShopifyOnSiteSignal(row,{nowMs}));
  const actual={eligibleAtFixtureClock:valid.length===1,sourceRows:rows.length,parserRejected:rejected,quantity:rows[0]?.quantity??null,quantityIsExact:rows[0]?.quantityIsExact??null,
   originalClockPreserved:rows.every(row=>row.observedAt===source.clock),allChannelsFalse:rows.every(row=>row.canAlertAsInventory===false&&row.canAlertAsWatch===false&&row.eligibleForDelivery===false&&row.eligibleForEmail===false&&row.eligibleForSms===false),sourceHttpRequests:0};
  for(const[key,expected]of Object.entries(item.expected||{}))if(JSON.stringify(actual[key])!==JSON.stringify(expected))failures.push(`${item.id}: ${key} expected ${JSON.stringify(expected)} got ${JSON.stringify(actual[key])}`);
 }
 return{ok:failures.length===0,failures};
}
