import path from 'node:path';
import {createHash} from 'node:crypto';
import {nativeShopifySource} from './native-shopify-onsite-policy.mjs';
import miContract from '../data/native-pickup-contracts/mi-wine-palace-livonia.json' with {type:'json'};
import txContract from '../data/native-pickup-contracts/tx-pogos-dallas-shopify.json' with {type:'json'};
export const NATIVE_SHOPIFY_IDS=Object.freeze(['mi:wine-palace-livonia','tx:pogos-dallas-shopify']);
export function nativeShopifyContractPaths(id){
 if(!NATIVE_SHOPIFY_IDS.includes(id))throw Error('Unknown closed native leaf contract');
 const key=id.replace(':','-');return{manifest:path.join('data','native-pickup-contracts',key+'.json'),fixtures:path.join('data','native-pickup-fixtures',key+'.json')};
}
export function nativeShopifySemanticManifest(id){
 nativeShopifyContractPaths(id);const source=nativeShopifySource(id),manifest=structuredClone(id==='mi:wine-palace-livonia'?miContract:txContract);
 if(manifest.sourceId!==id||manifest.state!==source.definition.state||JSON.stringify(manifest.collector.sourceIds)!==JSON.stringify([id]))throw Error('Native semantic contract escaped its exact source/state');
 return manifest;
}
export const nativeShopifySemanticHash=manifest=>createHash('sha256').update(JSON.stringify(Object.fromEntries(['lifecycle','collector','storeIdentity','sourceSemantics','customerPaths'].map(key=>[key,manifest[key]])))).digest('hex');
