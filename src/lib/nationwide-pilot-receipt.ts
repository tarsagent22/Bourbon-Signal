import { createHmac, timingSafeEqual } from 'node:crypto';

export const PILOT_RECEIPT_HEADER = 'x-bourbon-signal-pilot-verification';
export const PILOT_RECEIPT_CONTRACT = 'bourbon-signal/source-receipt@1';
export const PILOT_RECEIPT_SOURCES = Object.freeze({
  'ca:mission-trails-wine-spirits': {state:'CA',storeId:'mission-trails-wine-spirits:8181-mission-gorge'},
  'fl:jensens-miami': {state:'FL',storeId:'jensens-liquors:1646-sw-27th'},
} as const);
type SourceId = keyof typeof PILOT_RECEIPT_SOURCES;
type Row = Record<string, any>;

function scoped(url: URL): SourceId | null {
  const source=url.searchParams.get('source_receipt') as SourceId;
  const definition=Object.hasOwn(PILOT_RECEIPT_SOURCES,source)?PILOT_RECEIPT_SOURCES[source]:null;
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
  if(!definition) throw new Error('Unknown pilot source.');
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
