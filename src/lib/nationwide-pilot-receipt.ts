import { createHmac, timingSafeEqual } from 'node:crypto';
import { SHOPIFY_PICKUP_SOURCES } from '../../engine/src/sources/shopify-pickup-policy.mjs';

export const PILOT_RECEIPT_HEADER = 'x-bourbon-signal-pilot-verification';
export const PILOT_RECEIPT_CONTRACT = 'bourbon-signal/source-receipt@1';
export const PILOT_RECEIPT_SOURCES = Object.freeze({
  'ca:mission-trails-wine-spirits': {state:'CA',storeId:'mission-trails-wine-spirits:8181-mission-gorge'},
  'fl:jensens-miami': {state:'FL',storeId:'jensens-liquors:1646-sw-27th'},
} as const);
type SourceId = keyof typeof PILOT_RECEIPT_SOURCES;
type Row = Record<string, any>;

/** Data comes only from the server's explicitly admitted registry, never a request. */
export function cohortReceiptSources() {
  const result: Array<{sourceId:string;state:string;disabled:boolean;expiryHours:number;collectorVersion:string;bindings:Array<{storeId:string;productId:string;variantId:string;canonicalBottleId:string}>}> = [];
  const ids=new Set<string>();
  for(const source of SHOPIFY_PICKUP_SOURCES as readonly Row[]) {
    if(source?.kind!=='shopify-variant-pickup') throw new Error('Invalid trusted receipt registry.');
    if(typeof source.id!=='string'||!/^[a-z0-9][a-z0-9:._-]{0,179}$/.test(source.id)||ids.has(source.id)||Object.hasOwn(PILOT_RECEIPT_SOURCES,source.id)
      || !/^[A-Z]{2}$/.test(source.state||'')||source.definition?.state!==source.state||typeof source.disabled!=='boolean'
      || source.expiryHours!==1||typeof source.collectorVersion!=='string'||!source.collectorVersion.startsWith('shopify-variant-pickup-')
      || !Array.isArray(source.definition?.stores)||!source.definition.stores.length||source.definition.stores.length>5
      || !Array.isArray(source.definition?.products)||!source.definition.products.length||source.definition.products.length>2
      || !Array.isArray(source.partitionBindings)||!Array.isArray(source.admission?.bindings)||source.admission.sourceId!==source.id) throw new Error('Invalid trusted receipt registry.');
    const expected=source.definition.stores.flatMap((store:Row)=>source.definition.products.map((product:Row)=>({storeId:store.id,productId:product.productId,variantId:product.variantId})));
    const key=(row:Row)=>JSON.stringify([row.storeId,row.productId,row.variantId]);
    if(new Set(expected.map(key)).size!==expected.length||source.partitionBindings.length!==expected.length||source.admission.bindings.length!==expected.length
      || new Set(source.partitionBindings.map(key)).size!==expected.length||new Set(source.admission.bindings.map(key)).size!==expected.length
      || source.partitionBindings.some((binding:Row)=>!expected.some((row:Row)=>key(row)===key(binding))))throw new Error('Invalid trusted receipt tuples.');
    const bindings=expected.map((tuple:Row)=>{
      const binding=source.admission.bindings.find((row:Row)=>key(row)===key(tuple));
      if(!binding||![tuple.storeId,tuple.productId,tuple.variantId,binding.canonicalBottleId].every(value=>typeof value==='string'&&value.length>0&&value.length<=180))throw new Error('Invalid trusted receipt canonical.');
      return {storeId:String(tuple.storeId),productId:String(tuple.productId),variantId:String(tuple.variantId),canonicalBottleId:String(binding.canonicalBottleId)};
    });
    ids.add(source.id);result.push({sourceId:source.id,state:source.state,disabled:source.disabled,expiryHours:source.expiryHours,collectorVersion:source.collectorVersion,bindings});
  }
  return result;
}
function receiptDefinition(sourceId:string) {
  if(Object.hasOwn(PILOT_RECEIPT_SOURCES,sourceId))return PILOT_RECEIPT_SOURCES[sourceId as SourceId];
  try{return cohortReceiptSources().find(source=>source.sourceId===sourceId)||null;}catch{return null;}
}

function scoped(url: URL): string | null {
  const source=url.searchParams.get('source_receipt')||'';
  const definition=receiptDefinition(source);
  const keys=[...url.searchParams.keys()];
  return ['/api/drops','/api/coverage'].includes(url.pathname) && definition
    && keys.length===4 && new Set(keys).size===4
    && keys.every(key=>['state','limit','source_receipt','_bs_verify'].includes(key))
    && url.searchParams.get('state')===definition.state && url.searchParams.get('limit')==='1'
    && /^\d{13}-[a-f0-9]{1,16}$/.test(url.searchParams.get('_bs_verify') || '') ? source : null;
}

export function signPilotReceipt(url: URL,key: string,now=Date.now()) {
  if(key.length<32 || !scoped(url) || !Number.isFinite(now)) throw new Error('Invalid pilot receipt scope.');
  const seconds=Math.floor(now/1000);
  return `v1:${seconds}:${createHmac('sha256',key).update(`${PILOT_RECEIPT_CONTRACT}\nGET\n${url.origin}${url.pathname}${url.search}\n${seconds}`).digest('hex')}`;
}

export function authorizePilotReceipt(url: URL,header: string|null,key: string,now=Date.now()) {
  if(!scoped(url) || key.length<32 || !Number.isFinite(now)) return false;
  const match=/^v1:(\d{10}):([a-f0-9]{64})$/.exec(header || '');
  if(!match) return false;
  const age=Math.floor(now/1000)-Number(match[1]);
  if(age < -5 || age>90) return false;
  const expected=signPilotReceipt(url,key,Number(match[1])*1000).split(':')[2];
  return timingSafeEqual(Buffer.from(expected,'hex'),Buffer.from(match[2],'hex'));
}

/** Fixed public inventory identities only. Never returns cards or member data. */
export function pilotReceiptPayload(surface:'feed'|'coverage',sourceId:string,rows:Row[],snapshot:string|null,now=Date.now()) {
  const definition=Object.hasOwn(PILOT_RECEIPT_SOURCES,sourceId)?PILOT_RECEIPT_SOURCES[sourceId as SourceId]:null;
  if(!definition) return cohortPayload(surface,sourceId,rows,snapshot,now);
  let identities=rows.filter(row=>row.sourcePollId===sourceId && row.state===definition.state
    && (row.storeId || row.store_id)===definition.storeId && row.stale!==true && row.sourceStale!==true
    && (row.canAlertAsInventory===true || row.can_alert_as_inventory===true))
    .map(row=>({sourceId,runId:String(row.sourcePollRun || ''),generation:Number(row.sourcePollGeneration),
      state:definition.state,storeId:definition.storeId,
      canonicalBottleId:String(row.canonicalId || row.canonicalBottleId || row.canonical_id || ''),
      productId:String(row.productId || ''),variantId:String(row.variantId || ''),
      observedAt:String(row.lastConfirmedAt || row.last_confirmed_at || row.observedAt || row.observed_at || '')}))
    .filter(row=>row.runId && Number.isSafeInteger(row.generation) && row.generation>0 && row.canonicalBottleId
      && row.productId && row.variantId && Number.isFinite(Date.parse(row.observedAt))
      && Date.parse(row.observedAt)<=now && now-Date.parse(row.observedAt)<=3600000)
    .slice(0,200);
  if(new Set(identities.map(row=>`${row.runId}:${row.generation}`)).size>1) identities=[];
  return {contractVersion:PILOT_RECEIPT_CONTRACT,surface,sourceId,snapshot,receivedAt:new Date(now).toISOString(),
    total:identities.length,identities};
}

function cohortPayload(surface:'feed'|'coverage',sourceId:string,rows:Row[],snapshot:string|null,now:number) {
  const source=receiptDefinition(sourceId);
  if(!source||!('bindings' in source))throw new Error('Unknown pilot source.');
  const coherent=(values:unknown[],expected:string)=>values.filter(value=>value!==undefined&&value!==null&&value!=='').every(value=>String(value)===expected);
  let identities=source.disabled?[]:rows.filter(row=>row.sourcePollId===sourceId&&row.state===source.state&&row.stale!==true&&row.sourceStale!==true
    &&(row.canAlertAsInventory===true||row.can_alert_as_inventory===true)
    &&coherent([row.sourceRuntimeId,row.leafSourceRuntimeId],sourceId)&&coherent([row.stateCode],source.state)
    &&coherent([row.sourceCollectorVersion,row.raw?.collectorVersion],source.collectorVersion)
    &&[row.sourceCollectorVersion,row.raw?.collectorVersion].some(value=>value===source.collectorVersion)
    &&source.bindings.some(binding=>coherent([row.storeId,row.store_id],binding.storeId)&&(row.storeId||row.store_id)===binding.storeId
      &&String(row.productId||'')===binding.productId&&String(row.variantId||'')===binding.variantId
      &&coherent([row.canonicalId,row.canonicalBottleId,row.canonical_id],binding.canonicalBottleId)
      &&String(row.canonicalId||row.canonicalBottleId||row.canonical_id||'')===binding.canonicalBottleId))
    .map(row=>({sourceId,runId:String(row.sourcePollRun||''),generation:Number(row.sourcePollGeneration),state:source.state,storeId:String(row.storeId||row.store_id),
      canonicalBottleId:String(row.canonicalId||row.canonicalBottleId||row.canonical_id||''),productId:String(row.productId),variantId:String(row.variantId),
      observedAt:String(row.lastConfirmedAt||row.last_confirmed_at||row.observedAt||row.observed_at||'')}))
    .filter(row=>row.runId&&row.runId.length<=180&&Number.isSafeInteger(row.generation)&&row.generation>0&&Number.isFinite(Date.parse(row.observedAt))
      &&Date.parse(row.observedAt)<=now&&now-Date.parse(row.observedAt)<=source.expiryHours*3600000).slice(0,200);
  if(new Set(identities.map(row=>`${row.runId}:${row.generation}`)).size>1
    ||new Set(identities.map(row=>JSON.stringify([row.storeId,row.productId,row.variantId]))).size!==identities.length)identities=[];
  return {contractVersion:PILOT_RECEIPT_CONTRACT,surface,sourceId,snapshot,receivedAt:new Date(now).toISOString(),total:identities.length,identities};
}
