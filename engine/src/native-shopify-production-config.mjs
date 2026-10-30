import {nativeShopifyProductionAllowed} from './collectors/native-shopify-onsite.mjs';
import {nativeShopifySource} from './native-shopify-onsite-policy.mjs';
import {nativeShopifyContractPaths} from './native-shopify-contract.mjs';
export function nativeMichiganStateConfig(legacy,options={}){
 if(legacy.id!=='MI')return legacy;
 const id='mi:wine-palace-livonia',source=nativeShopifySource(id);
 if(!nativeShopifyProductionAllowed(id,options))return Object.freeze({...legacy,active:false,disabledReason:'Michigan native pickup is not admitted; held CityHive research is never activated by a state flag.'});
 const d=source.definition;
 return Object.freeze({id:'MI',label:'Wine Palace of Livonia exact native pickup',tier:'B',active:true,strategy:'retailer_store_inventory',cadence:'30m',rareSignalTarget:true,
  value:'Exact750mL native pickup at one reviewed Livonia premise only. No exact shelf count or outbound alerts.',
  nativePickupSourceId:id,nativeVerification:nativeShopifyContractPaths(id),
  precisionSource:{name:d.sourceLabel,url:d.baseUrl+'/products/'+d.products[0].handle},
  sources:[{kind:'native_shopify_pickup',name:d.sourceLabel,label:d.sourceLabel,url:d.baseUrl+'/products/'+d.products[0].handle,precisionOnly:true,sourceRuntimeId:id}],apiCandidates:[]});
}
export function nativeMichiganVerificationId(state,options={}){return state==='MI'&&nativeShopifyProductionAllowed('mi:wine-palace-livonia',options)?'mi:wine-palace-livonia':null;}
