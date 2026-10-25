import { collectGroceryXapiSource } from './grocery-xapi-runtime-source.mjs';
import { groceryXapiHash, compileGroceryXapiDescriptors } from '../sources/grocery-xapi-policy.mjs';
const get = (map,id) => map?.get?.(id) || map?.[id];
const norm = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();

// One existing bounded runtime request; existing durable SQL lease owns retries.
export async function collectGroceryXapiPoll(bible, descriptor, options = {}) {
  const {groceryPolicy,policySnapshotId,marketLookup,fetchText,...runtimeOptions}=options;
  if (!groceryPolicy?.evaluateObservation || !policySnapshotId || !marketLookup || typeof fetchText!=='function' || descriptor.disabled) throw new TypeError('Current enabled policy and bounded transport required');
  const [source]=compileGroceryXapiDescriptors({definitions:[structuredClone(descriptor.definition)],admissions:[structuredClone(descriptor.admission)],runtimeVersion:descriptor.runtimeVersion,runtimeSha256:descriptor.runtimeSha256});
  if (source.configSha256!==descriptor.configSha256 || source.admissionSha256!==descriptor.admissionSha256) throw new TypeError('Changed XAPI descriptor');
  const definition=source.definition;
  const clock=runtimeOptions.clock || Date.now;
  const stamp=(row,binding)=>({...row,sourceRuntimeId:source.id,sourcePolicySnapshotId:policySnapshotId,sourceConfigSha256:source.configSha256,
    sourceAdmissionSha256:source.admissionSha256,sourceRuntimeSha256:source.runtimeSha256,sourceCollectorVersion:source.runtimeVersion,
    sourceProductBinding:groceryXapiHash(binding),completeSnapshot:false,absenceIsOutOfStock:false});
  const unknown=(binding,observedAt,status)=>stamp({state:definition.state,stateCode:definition.state,sourceChain:source.chain,sourceLabel:source.sourceLabel,merchantId:definition.merchantId,
    storeId:definition.premise.storeId,storeName:definition.premise.name,storeAddress:definition.premise.address,city:definition.premise.city,zip:definition.premise.zip,
    sourceUrl:`https://${definition.host}/shop/product-details.${binding.productId}.html`,eventType:'retailer_store_inventory_result',locationPrecision:'store_level',
    productId:binding.productId,variantId:binding.variantId,canonicalBottleId:binding.canonicalBottleId,canonicalName:binding.canonicalName,rawName:binding.rawName,
    tier:get(marketLookup.byId,binding.canonicalBottleId)?.tier,observedAt,availabilityStatus:status,quantity:0,quantityIsExact:false,
    sourceAvailabilityVerified:false,canAlertAsInventory:false,canAlertAsWatch:false,raw:{volumeMl:binding.volumeMl,packageCount:binding.packageCount,fulfillmentPolicyVerified:true}},binding);
  const allowed=row=>{const checked=groceryPolicy.evaluateObservation(row);return checked===true || checked?.eligible===true;};
  // Preflight every immutable reviewed binding before transport; withdrawal or
  // disabled policy cannot make a request and cannot borrow another source.
  const preflightAt=new Date(clock()).toISOString();
  if (!definition.bindings.every(binding=>allowed(unknown(binding,preflightAt,'unknown')))) throw new Error('grocery_xapi_identity_or_schema_failure: collection policy rejected');
  const policies={[definition.state]:{
    admitSource:row=>groceryXapiHash(row.premise)===groceryXapiHash(definition.premise) && row.id===definition.id && row.host===definition.host && row.merchantId===definition.merchantId,
    admitBottle:(record,_row,product)=>definition.bindings.some(binding=>binding.productId===String(product.id || product.pid || product.upc || '')
      && binding.variantId===String(product.pid || product.id || product.upc || '') && binding.canonicalBottleId===record.id
      && norm(binding.canonicalName)===norm(record.canonical) && norm(binding.rawName)===norm(product.name)
      && ['allocated','limited','unicorn'].includes(get(marketLookup.byId,record.id)?.tier)),
  }};
  let payload;
  let result;
  try {
    result=await collectGroceryXapiSource(bible,{...definition,runtimeId:source.id,sourceChain:source.chain,sourceLabel:source.sourceLabel},{...runtimeOptions,policies,fetchText:async(...args)=>{
      const response=await fetchText(...args);
      if(response.ok && response.status===200){try{payload=JSON.parse(response.text);}catch{/* runtime rejects malformed JSON */}}
      return response;
    }});
  } catch (error) {
    const details=error.details || {};
    error.details={...details,accounting:{...details.accounting,requestCount:details.requestCount || 0,
      bytes:details.bytes || 0,elapsedMs:details.elapsedMs || 0,completeSnapshot:false,absenceIsOutOfStock:false}};
    throw error;
  }
  try {
  const at=result.signals[0]?.observedAt || new Date(clock()).toISOString();
  const signals=result.signals.map(row=>{
    const binding=definition.bindings.find(b=>b.productId===row.productId && b.variantId===row.variantId);
    return binding?stamp({...row,tier:get(marketLookup.byId,binding.canonicalBottleId)?.tier},binding):null;
  }).filter(row=>row && groceryPolicy.eligible(row));
  const observations=definition.bindings.map(binding=>signals.find(row=>row.productId===binding.productId && row.variantId===binding.variantId)
    || unknown(binding,at,(payload?.response?.docs || []).some(product=>String(product.id || product.pid || product.upc || '')===binding.productId)?'unknown':'omitted_first_page'));
  if (!observations.every(allowed)) throw new Error('grocery_xapi_identity_or_schema_failure: observation policy rejected');
  return {...result,signals,observations};
  } catch(error) {
    error.details={...error.details,accounting:{...result.accounting,...error.details?.accounting}};
    throw error;
  }
}
